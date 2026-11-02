import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { Entry } from '../src/models/Entry';

// These tests need a real MongoDB. Point TEST_MONGODB_URI at a throwaway database;
// without a reachable server they are skipped. Collections are wiped between tests.
const uri = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/roomie_scoreboard_test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough';

let available = false;
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
  available = true;
} catch {
  console.warn(`Skipping API tests: no MongoDB at ${uri}`);
}

const app = createApp();

async function register(name: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email: `${name.toLowerCase()}@example.com`, password: 'password123' });
  expect(res.status).toBe(201);
  return { token: res.body.token as string, id: res.body.user.id as string };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function setupHousehold() {
  const asha = await register('Asha');
  const ben = await register('Ben');
  const created = await request(app)
    .post('/api/households')
    .set(auth(asha.token))
    .send({ name: 'Flat 4B', timezone: 'Asia/Kolkata' });
  expect(created.status).toBe(201);
  const code = created.body.household.code as string;
  const joined = await request(app)
    .post('/api/households/join')
    .set(auth(ben.token))
    .send({ code: code.toLowerCase() });
  expect(joined.status).toBe(200);

  const activities = await request(app).get('/api/activities').set(auth(asha.token));
  const byName = Object.fromEntries(
    activities.body.activities.map((a: { name: string; id: string }) => [a.name, a.id]),
  );
  return { asha, ben, code, byName };
}

describe.skipIf(!available)('API', () => {
  beforeAll(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  });
  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });

  describe('auth', () => {
    it('registers, logs in and returns the current user', async () => {
      const { token } = await register('Asha');

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ASHA@example.com', password: 'password123' });
      expect(login.status).toBe(200);

      const me = await request(app).get('/api/auth/me').set(auth(token));
      expect(me.body.user).toMatchObject({ name: 'Asha', householdId: null });
      expect(me.body.user.passwordHash).toBeUndefined();
    });

    it('rejects bad input, duplicates and wrong passwords', async () => {
      await register('Asha');

      const weak = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ben', email: 'ben@example.com', password: 'short' });
      expect(weak.status).toBe(400);

      const duplicate = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Asha 2', email: 'asha@example.com', password: 'password123' });
      expect(duplicate.status).toBe(409);

      const wrong = await request(app)
        .post('/api/auth/login')
        .send({ email: 'asha@example.com', password: 'not-the-password' });
      expect(wrong.status).toBe(401);
    });

    it('protects every other route', async () => {
      for (const path of ['/api/activities', '/api/entries', '/api/leaderboard', '/api/households/me']) {
        expect((await request(app).get(path)).status).toBe(401);
      }
      const { token } = await register('Asha');
      expect((await request(app).get('/api/activities').set(auth(token))).status).toBe(403);
    });
  });

  describe('households', () => {
    it('creates a household with starter activities and lets a roommate join by code', async () => {
      const { asha, code } = await setupHousehold();
      expect(code).toMatch(/^[A-Z2-9]{6}$/);

      const mine = await request(app).get('/api/households/me').set(auth(asha.token));
      expect(mine.body.household.members.map((m: { name: string }) => m.name)).toEqual([
        'Asha',
        'Ben',
      ]);

      const activities = await request(app).get('/api/activities').set(auth(asha.token));
      expect(activities.body.activities).toHaveLength(8);
    });

    it('rejects unknown codes and double membership', async () => {
      const { asha } = await setupHousehold();
      const carl = await register('Carl');

      const missing = await request(app)
        .post('/api/households/join')
        .set(auth(carl.token))
        .send({ code: 'ZZZZZZ' });
      expect(missing.status).toBe(404);

      const again = await request(app)
        .post('/api/households')
        .set(auth(asha.token))
        .send({ name: 'Another place' });
      expect(again.status).toBe(409);
    });

    it('deletes the household when the last person leaves', async () => {
      const { asha, ben } = await setupHousehold();
      await request(app).post('/api/households/leave').set(auth(asha.token)).expect(200);
      expect(
        (await request(app).get('/api/households/me').set(auth(ben.token))).status,
      ).toBe(200);
      await request(app).post('/api/households/leave').set(auth(ben.token)).expect(200);
      expect(await mongoose.connection.collection('households').countDocuments()).toBe(0);
      expect(await mongoose.connection.collection('activities').countDocuments()).toBe(0);
    });
  });

  describe('logging activities', () => {
    it('adds points to the leaderboard and ranks roommates', async () => {
      const { asha, ben, byName } = await setupHousehold();

      await request(app)
        .post('/api/entries')
        .set(auth(asha.token))
        .send({ activityId: byName['Wash the dishes'], note: 'pasta night' })
        .expect(201);
      await request(app)
        .post('/api/entries')
        .set(auth(ben.token))
        .send({ activityId: byName['Cook for everyone'] })
        .expect(201);

      const board = await request(app).get('/api/leaderboard').set(auth(asha.token));
      expect(board.body.isCurrent).toBe(true);
      expect(board.body.totals).toEqual({ points: 30, count: 2 });
      expect(
        board.body.standings.map((s: { name: string; points: number; rank: number; streak: number }) => [
          s.name,
          s.points,
          s.rank,
          s.streak,
        ]),
      ).toEqual([
        ['Ben', 20, 1, 1],
        ['Asha', 10, 2, 1],
      ]);

      const feed = await request(app).get('/api/entries').set(auth(ben.token));
      expect(feed.body.entries[0]).toMatchObject({ userName: 'Ben', points: 20 });
      expect(feed.body.entries[1]).toMatchObject({ userName: 'Asha', note: 'pasta night' });
    });

    it('ignores an accidental double tap', async () => {
      const { asha, byName } = await setupHousehold();
      const log = () =>
        request(app)
          .post('/api/entries')
          .set(auth(asha.token))
          .send({ activityId: byName['Take out the trash'] });
      expect((await log()).status).toBe(201);
      expect((await log()).status).toBe(409);
    });

    it('lets people add and archive their own activities', async () => {
      const { asha } = await setupHousehold();
      const created = await request(app)
        .post('/api/activities')
        .set(auth(asha.token))
        .send({ name: 'Water the plants', emoji: '🪴', points: 5 });
      expect(created.status).toBe(201);

      const id = created.body.activity.id as string;
      await request(app).delete(`/api/activities/${id}`).set(auth(asha.token)).expect(200);
      await request(app)
        .post('/api/entries')
        .set(auth(asha.token))
        .send({ activityId: id })
        .expect(404);

      const invalid = await request(app)
        .post('/api/activities')
        .set(auth(asha.token))
        .send({ name: 'Cheat', points: 5000 });
      expect(invalid.status).toBe(400);
    });

    it("keeps one household's data away from another's", async () => {
      const { byName } = await setupHousehold();
      const outsider = await register('Zed');
      await request(app)
        .post('/api/households')
        .set(auth(outsider.token))
        .send({ name: 'Elsewhere' })
        .expect(201);

      await request(app)
        .post('/api/entries')
        .set(auth(outsider.token))
        .send({ activityId: byName['Wash the dishes'] })
        .expect(404);
      const feed = await request(app).get('/api/entries').set(auth(outsider.token));
      expect(feed.body.entries).toEqual([]);
    });
  });

  describe('disputes and undo', () => {
    it('stops a disputed entry from counting until the disputer reinstates it', async () => {
      const { asha, ben, byName } = await setupHousehold();
      const logged = await request(app)
        .post('/api/entries')
        .set(auth(asha.token))
        .send({ activityId: byName['Clean the bathroom'] });
      const id = logged.body.entry.id as string;
      const points = async () =>
        (await request(app).get('/api/leaderboard').set(auth(ben.token))).body.standings.find(
          (s: { name: string }) => s.name === 'Asha',
        ).points;

      expect(await points()).toBe(30);

      await request(app).post(`/api/entries/${id}/dispute`).set(auth(asha.token)).expect(400);
      const disputed = await request(app).post(`/api/entries/${id}/dispute`).set(auth(ben.token));
      expect(disputed.body.entry).toMatchObject({ status: 'disputed', disputedByName: 'Ben' });
      expect(await points()).toBe(0);

      await request(app).post(`/api/entries/${id}/reinstate`).set(auth(asha.token)).expect(403);
      await request(app).post(`/api/entries/${id}/reinstate`).set(auth(ben.token)).expect(200);
      expect(await points()).toBe(30);
    });

    it('lets you undo your own entry but nobody else', async () => {
      const { asha, ben, byName } = await setupHousehold();
      const logged = await request(app)
        .post('/api/entries')
        .set(auth(asha.token))
        .send({ activityId: byName['Sweep and mop'] });
      const id = logged.body.entry.id as string;

      await request(app).delete(`/api/entries/${id}`).set(auth(ben.token)).expect(403);
      await request(app).delete(`/api/entries/${id}`).set(auth(asha.token)).expect(200);

      const board = await request(app).get('/api/leaderboard').set(auth(asha.token));
      expect(board.body.totals.points).toBe(0);
    });

    it('does not allow undoing entries older than 24 hours', async () => {
      const { asha, byName } = await setupHousehold();
      const logged = await request(app)
        .post('/api/entries')
        .set(auth(asha.token))
        .send({ activityId: byName['Shared laundry'] });
      const id = logged.body.entry.id as string;
      await Entry.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(id) },
        { $set: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } },
      );
      await request(app).delete(`/api/entries/${id}`).set(auth(asha.token)).expect(403);
    });
  });

  describe('weekly reset and history', () => {
    it('keeps past weeks out of the current board and crowns their winners', async () => {
      const { asha, ben, byName } = await setupHousehold();

      const board = await request(app).get('/api/leaderboard').set(auth(asha.token));
      const currentWeek = board.body.currentWeek as string;

      // Two entries from a week long ago: Ben beats Asha.
      const base = {
        household: new mongoose.Types.ObjectId(
          (await request(app).get('/api/households/me').set(auth(asha.token))).body.household.id,
        ),
        activity: new mongoose.Types.ObjectId(byName['Wash the dishes']),
        activityName: 'Wash the dishes',
        emoji: '🍽️',
        status: 'counted',
        note: '',
        weekKey: '2025-W10',
        dayKey: '2025-03-04',
        createdAt: new Date('2025-03-04T10:00:00Z'),
        updatedAt: new Date('2025-03-04T10:00:00Z'),
      };
      await Entry.collection.insertMany([
        { ...base, user: new mongoose.Types.ObjectId(ben.id), points: 40 },
        { ...base, user: new mongoose.Types.ObjectId(asha.id), points: 10 },
      ]);

      const current = await request(app).get('/api/leaderboard').set(auth(asha.token));
      expect(current.body.week).toBe(currentWeek);
      expect(current.body.totals.points).toBe(0);
      expect(current.body.weeks.map((w: { key: string }) => w.key)).toEqual([currentWeek, '2025-W10']);
      expect(current.body.weeks[1]).toEqual({
        key: '2025-W10',
        startsOn: '2025-03-03',
        endsOn: '2025-03-09',
      });
      const crowns = Object.fromEntries(
        current.body.standings.map((s: { name: string; crowns: number }) => [s.name, s.crowns]),
      );
      expect(crowns).toEqual({ Ben: 1, Asha: 0 });

      const past = await request(app).get('/api/leaderboard?week=2025-W10').set(auth(asha.token));
      expect(past.body).toMatchObject({ isCurrent: false, startsOn: '2025-03-03', endsOn: '2025-03-09' });
      expect(past.body.standings[0]).toMatchObject({ name: 'Ben', points: 40 });

      const allTime = await request(app).get('/api/leaderboard?week=all').set(auth(asha.token));
      expect(allTime.body.totals.points).toBe(50);

      const history = await request(app).get('/api/leaderboard/history').set(auth(asha.token));
      expect(history.body.history).toHaveLength(1);
      expect(history.body.history[0]).toMatchObject({
        weekKey: '2025-W10',
        winners: [{ name: 'Ben', points: 40 }],
      });

      await request(app).get('/api/leaderboard?week=banana').set(auth(asha.token)).expect(400);
    });
  });
});
