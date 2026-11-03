import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { addDays, dayKey } from '../src/lib/weeks';

// Needs a real MongoDB (see api.test.ts). Skipped when none is reachable.
const uri = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/roomie_scoreboard_test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough';

let available = false;
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
  available = true;
} catch {
  console.warn(`Skipping v3 API tests: no MongoDB at ${uri}`);
}

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const oid = (id: string) => new mongoose.Types.ObjectId(id);
const col = (name: string) => mongoose.connection.collection(name);
const today = () => dayKey(new Date(), 'Asia/Kolkata');

interface Person {
  name: string;
  token: string;
  id: string;
}

async function register(name: string): Promise<Person> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email: `${name.toLowerCase()}@example.com`, password: 'password123' });
  expect(res.status).toBe(201);
  return { name, token: res.body.token, id: res.body.user.id };
}

async function flat(names: string[]) {
  const people: Person[] = [];
  for (const name of names) people.push(await register(name));
  const created = await request(app)
    .post('/api/households')
    .set(auth(people[0].token))
    .send({ name: 'Flat 4B', timezone: 'Asia/Kolkata' });
  expect(created.status).toBe(201);
  for (const person of people.slice(1)) {
    await request(app)
      .post('/api/households/join')
      .set(auth(person.token))
      .send({ code: created.body.household.code })
      .expect(200);
  }
  const activities = await request(app).get('/api/activities').set(auth(people[0].token));
  const byName: Record<string, string> = Object.fromEntries(
    activities.body.activities.map((a: { name: string; id: string }) => [a.name, a.id]),
  );
  return { people, householdId: created.body.household.id as string, code: created.body.household.code as string, byName };
}

async function wipe() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

describe.skipIf(!available)('v3 API', () => {
  beforeEach(wipe);
  afterAll(async () => {
    await wipe();
    await mongoose.disconnect();
  });

  describe('hot chores', () => {
    it('heats up a chore nobody has done for days, and cools it when someone does it', async () => {
      const {
        people: [asha, ben],
        byName,
      } = await flat(['Asha', 'Ben']);
      const bathroom = byName['Clean the bathroom'];

      const fresh = await request(app).get('/api/activities').set(auth(asha.token));
      expect(fresh.body.activities.every((a: { hotBonus: number }) => a.hotBonus === 0)).toBe(true);

      // Pretend the chore list was created a week ago.
      await col('activities').updateMany({}, { $set: { createdAt: new Date(Date.now() - 7 * 86_400_000) } });
      const hot = await request(app).get('/api/activities').set(auth(asha.token));
      const row = hot.body.activities.find((a: { id: string }) => a.id === bathroom);
      expect(row).toMatchObject({ points: 30, hotBonus: 15 });

      // Whoever does it gets the bonus on top of the base points.
      const logged = await request(app).post('/api/entries').set(auth(ben.token)).send({ activityId: bathroom });
      expect(logged.body.entry).toMatchObject({ points: 45, bonusPoints: 15 });

      const cooled = await request(app).get('/api/activities').set(auth(asha.token));
      expect(cooled.body.activities.find((a: { id: string }) => a.id === bathroom).hotBonus).toBe(0);
    });

    it('stacks with a bounty from a roommate', async () => {
      const {
        people: [asha, ben],
        byName,
      } = await flat(['Asha', 'Ben']);
      const trash = byName['Take out the trash'];
      await col('activities').updateMany({}, { $set: { createdAt: new Date(Date.now() - 4 * 86_400_000) } });
      await request(app).post('/api/bounties').set(auth(asha.token)).send({ activityId: trash, bonusPoints: 10 }).expect(201);

      const logged = await request(app).post('/api/entries').set(auth(ben.token)).send({ activityId: trash });
      // Base 5, hot +1 (4 days untouched), bounty +10.
      expect(logged.body.entry).toMatchObject({ points: 16, bonusPoints: 11 });
    });
  });

  describe('badges', () => {
    it('awards lifetime badges from real activity', async () => {
      const {
        people: [asha, ben],
        householdId,
        byName,
      } = await flat(['Asha', 'Ben']);

      // Asha: dishes on three days in a row, plus a 4th entry for points.
      const days = [addDays(today(), -2), addDays(today(), -1), today()];
      await col('entries').insertMany(
        days.map((day) => ({
          household: oid(householdId),
          user: oid(asha.id),
          kind: 'chore',
          activity: oid(byName['Wash the dishes']),
          activityName: 'Wash the dishes',
          emoji: '🍽️',
          points: 40,
          bonusPoints: 0,
          note: '',
          status: 'counted',
          dayKey: day,
          weekKey: '2026-W01',
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );

      const res = await request(app).get('/api/badges').set(auth(ben.token));
      expect(res.status).toBe(200);
      const byPerson = Object.fromEntries(
        res.body.badges.map((b: { name: string; badges: { id: string; tier: number }[] }) => [b.name, b.badges]),
      );
      // The entries sit in the long-finished week 2026-W01 where Asha was the only scorer,
      // so she also won that week.
      expect(byPerson.Asha.map((b: { id: string }) => b.id).sort()).toEqual(['crowns', 'points', 'streak']);
      expect(byPerson.Asha.find((b: { id: string }) => b.id === 'streak').tier).toBe(1);
      expect(byPerson.Asha.find((b: { id: string }) => b.id === 'points').tier).toBe(1); // 120 points
      expect(byPerson.Ben).toEqual([]);
    });

    it('is only for people in a household', async () => {
      const loner = await register('Zed');
      expect((await request(app).get('/api/badges').set(auth(loner.token))).status).toBe(403);
      expect((await request(app).get('/api/badges')).status).toBe(401);
    });
  });

  describe('joining a household that has unsettled weeks', () => {
    it('settles finished weeks first, so the newcomer does not share last week\'s pot', async () => {
      const {
        people: [asha, ben, carl, dev],
        householdId,
        code,
        byName,
      } = await flat(['Asha', 'Ben', 'Carl', 'Dev']);
      await col('households').updateOne({ _id: oid(householdId) }, { $set: { prizesFrom: '2026-W01' } });
      await col('entries').insertMany(
        [asha, ben, carl, dev].map((person, i) => ({
          household: oid(householdId),
          user: oid(person.id),
          kind: 'chore',
          activity: oid(byName['Wash the dishes']),
          activityName: 'Wash the dishes',
          emoji: '🍽️',
          points: 40 - i * 10,
          bonusPoints: 0,
          note: '',
          status: 'counted',
          dayKey: '2026-01-07',
          weekKey: '2026-W02',
          createdAt: new Date('2026-01-07T10:00:00Z'),
          updatedAt: new Date('2026-01-07T10:00:00Z'),
        })),
      );

      // Nobody has opened the prizes screen yet. A fifth roommate joins now.
      const eve = await register('Eve');
      await request(app).post('/api/households/join').set(auth(eve.token)).send({ code }).expect(200);

      const view = await request(app).get('/api/prizes').set(auth(asha.token));
      expect(view.body.weeks).toHaveLength(1);
      expect(view.body.weeks[0].memberCount).toBe(4);
      expect(view.body.weeks[0].balances.map((b: { name: string }) => b.name).sort()).toEqual(['Asha', 'Ben', 'Carl', 'Dev']);
      expect((await request(app).get('/api/prizes').set(auth(eve.token))).body.summary).toEqual({ owePaise: 0, owedPaise: 0 });
    });

    it('settles before someone leaves, so they still owe what they owe', async () => {
      const {
        people: [asha, ben, carl, dev],
        householdId,
        byName,
      } = await flat(['Asha', 'Ben', 'Carl', 'Dev']);
      await col('households').updateOne({ _id: oid(householdId) }, { $set: { prizesFrom: '2026-W01' } });
      await col('entries').insertMany(
        [asha, ben, carl, dev].map((person, i) => ({
          household: oid(householdId),
          user: oid(person.id),
          kind: 'chore',
          activity: oid(byName['Wash the dishes']),
          activityName: 'Wash the dishes',
          emoji: '🍽️',
          points: 40 - i * 10,
          bonusPoints: 0,
          note: '',
          status: 'counted',
          dayKey: '2026-01-07',
          weekKey: '2026-W02',
          createdAt: new Date('2026-01-07T10:00:00Z'),
          updatedAt: new Date('2026-01-07T10:00:00Z'),
        })),
      );

      // Dev finished last and would owe ₹18.75, then leaves before anyone looked.
      await request(app).post('/api/households/leave').set(auth(dev.token)).expect(200);

      const view = await request(app).get('/api/prizes').set(auth(asha.token));
      expect(view.body.weeks[0].memberCount).toBe(4);
      expect(view.body.summary.owedPaise).toBe(625);
    });
  });
});
