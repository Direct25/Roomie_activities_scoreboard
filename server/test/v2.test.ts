import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { dayKey, weekKeyOfDay } from '../src/lib/weeks';

// Needs a real MongoDB (see api.test.ts). Skipped when none is reachable.
const uri = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/roomie_scoreboard_test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough';

let available = false;
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
  available = true;
} catch {
  console.warn(`Skipping v2 API tests: no MongoDB at ${uri}`);
}

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const oid = (id: string) => new mongoose.Types.ObjectId(id);

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

/** A household of the given people. The first one is the owner. */
async function flat(names: string[]) {
  const people = [];
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
  return { people, householdId: created.body.household.id as string, byName };
}

const log = (person: Person, activityId: string) =>
  request(app).post('/api/entries').set(auth(person.token)).send({ activityId });

const col = (name: string) => mongoose.connection.collection(name);
const today = () => dayKey(new Date(), 'Asia/Kolkata');

async function wipe() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

describe.skipIf(!available)('v2 API', () => {
  beforeEach(wipe);
  afterAll(async () => {
    await wipe();
    await mongoose.disconnect();
  });

  describe('bounties', () => {
    it('adds a bonus for the first roommate who does the chore, but never the poster', async () => {
      const {
        people: [asha, ben],
        byName,
      } = await flat(['Asha', 'Ben']);
      const chore = byName['Clean the bathroom']; // 30 points

      const posted = await request(app)
        .post('/api/bounties')
        .set(auth(asha.token))
        .send({ activityId: chore, bonusPoints: 20 });
      expect(posted.status).toBe(201);
      const bountyId = posted.body.bounty.id as string;

      // The poster doing it gets no bonus and the bounty stays open.
      const own = await log(asha, chore);
      expect(own.body.entry).toMatchObject({ points: 30, bonusPoints: 0 });
      expect((await request(app).get('/api/bounties').set(auth(ben.token))).body.bounties).toHaveLength(1);

      // Ben claims it.
      const claimed = await log(ben, chore);
      expect(claimed.body.entry).toMatchObject({ points: 50, bonusPoints: 20 });
      expect((await request(app).get('/api/bounties').set(auth(ben.token))).body.bounties).toHaveLength(0);

      // Undoing the chore puts the bounty back.
      await request(app).delete(`/api/entries/${claimed.body.entry.id}`).set(auth(ben.token)).expect(200);
      const reopened = await request(app).get('/api/bounties').set(auth(asha.token));
      expect(reopened.body.bounties.map((b: { id: string }) => b.id)).toEqual([bountyId]);
    });

    it('limits bounties to one per chore and lets the poster cancel', async () => {
      const {
        people: [asha, ben],
        byName,
      } = await flat(['Asha', 'Ben']);
      const body = { activityId: byName['Take out the trash'], bonusPoints: 10 };

      const first = await request(app).post('/api/bounties').set(auth(asha.token)).send(body);
      expect(first.status).toBe(201);
      expect((await request(app).post('/api/bounties').set(auth(ben.token)).send(body)).status).toBe(409);

      await request(app).delete(`/api/bounties/${first.body.bounty.id}`).set(auth(ben.token)).expect(404);
      await request(app).delete(`/api/bounties/${first.body.bounty.id}`).set(auth(asha.token)).expect(200);

      const tooBig = await request(app)
        .post('/api/bounties')
        .set(auth(asha.token))
        .send({ activityId: byName['Take out the trash'], bonusPoints: 500 });
      expect(tooBig.status).toBe(400);
    });

    it('lets an expired bounty lapse', async () => {
      const {
        people: [asha, ben],
        byName,
      } = await flat(['Asha', 'Ben']);
      await request(app)
        .post('/api/bounties')
        .set(auth(asha.token))
        .send({ activityId: byName['Sweep and mop'], bonusPoints: 15 })
        .expect(201);
      await col('bounties').updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

      const claimed = await log(ben, byName['Sweep and mop']);
      expect(claimed.body.entry.bonusPoints).toBe(0);
      expect((await request(app).get('/api/bounties').set(auth(ben.token))).body.bounties).toEqual([]);
    });
  });

  describe('challenges', () => {
    it('runs a challenge end to end and pays the winner the stake', async () => {
      const {
        people: [asha, ben],
        byName,
      } = await flat(['Asha', 'Ben']);

      const sent = await request(app)
        .post('/api/challenges')
        .set(auth(asha.token))
        .send({ opponentId: ben.id, metric: 'points', days: 1, stakePoints: 25 });
      expect(sent.status).toBe(201);
      const id = sent.body.challenge.id as string;
      expect(sent.body.challenge.status).toBe('pending');

      // Only the opponent can accept, and only once.
      await request(app).post(`/api/challenges/${id}/accept`).set(auth(asha.token)).expect(403);
      const accepted = await request(app).post(`/api/challenges/${id}/accept`).set(auth(ben.token));
      expect(accepted.body.challenge).toMatchObject({ status: 'active', startDay: today(), endDay: today() });
      await request(app).post(`/api/challenges/${id}/accept`).set(auth(ben.token)).expect(409);

      // Live scores while it runs.
      await log(asha, byName['Clean the bathroom']); // 30
      await log(ben, byName['Wash the dishes']); // 10
      const live = await request(app).get('/api/challenges').set(auth(ben.token));
      expect(live.body.challenges[0]).toMatchObject({ status: 'active', challengerScore: 30, opponentScore: 10 });

      // Pretend the challenge ran on a past day.
      const past = '2026-01-05';
      await col('challenges').updateOne({ _id: oid(id) }, { $set: { startDay: past, endDay: past } });
      await col('entries').updateMany({}, { $set: { dayKey: past, weekKey: weekKeyOfDay(past) } });

      const board = await request(app).get('/api/leaderboard?week=all').set(auth(ben.token));
      const points = Object.fromEntries(board.body.standings.map((s: { name: string; points: number }) => [s.name, s.points]));
      expect(points).toEqual({ Asha: 55, Ben: 10 }); // 30 + 25 stake vs 10

      const done = await request(app).get('/api/challenges').set(auth(ben.token));
      expect(done.body.challenges[0]).toMatchObject({
        status: 'completed',
        winnerId: asha.id,
        challengerScore: 30,
        opponentScore: 10,
      });

      // The bonus shows in the feed, can't be undone or disputed, and doesn't pay twice.
      const feed = await request(app).get('/api/entries').set(auth(ben.token));
      const bonus = feed.body.entries.find((e: { kind: string }) => e.kind === 'bonus');
      expect(bonus).toMatchObject({ userName: 'Asha', points: 25, emoji: '⚔️' });
      await request(app).delete(`/api/entries/${bonus.id}`).set(auth(asha.token)).expect(403);
      await request(app).post(`/api/entries/${bonus.id}/dispute`).set(auth(ben.token)).expect(400);
      await request(app).get('/api/leaderboard').set(auth(asha.token));
      expect(await col('entries').countDocuments({ kind: 'bonus' })).toBe(1);
    });

    it('counts only one chore for a chore challenge, and a tie pays nothing', async () => {
      const {
        people: [asha, ben],
        byName,
      } = await flat(['Asha', 'Ben']);
      const sent = await request(app)
        .post('/api/challenges')
        .set(auth(asha.token))
        .send({ opponentId: ben.id, metric: 'activity', activityId: byName['Wash the dishes'], days: 3, stakePoints: 10 });
      const id = sent.body.challenge.id as string;
      await request(app).post(`/api/challenges/${id}/accept`).set(auth(ben.token)).expect(200);

      await log(asha, byName['Wash the dishes']);
      await log(asha, byName['Sweep and mop']); // different chore, ignored
      await log(ben, byName['Wash the dishes']);

      const live = await request(app).get('/api/challenges').set(auth(asha.token));
      expect(live.body.challenges[0]).toMatchObject({ challengerScore: 1, opponentScore: 1 });

      const past = '2026-01-05';
      await col('challenges').updateOne({ _id: oid(id) }, { $set: { startDay: past, endDay: past } });
      await col('entries').updateMany({}, { $set: { dayKey: past, weekKey: weekKeyOfDay(past) } });
      await request(app).get('/api/leaderboard').set(auth(asha.token));

      const done = await request(app).get('/api/challenges').set(auth(asha.token));
      expect(done.body.challenges[0]).toMatchObject({ status: 'completed', winnerId: null });
      expect(await col('entries').countDocuments({ kind: 'bonus' })).toBe(0);
    });

    it('handles declining, cancelling, expiring and invalid invitations', async () => {
      const {
        people: [asha, ben, carl],
        byName,
      } = await flat(['Asha', 'Ben', 'Carl']);
      const send = (from: Person, to: string, extra = {}) =>
        request(app)
          .post('/api/challenges')
          .set(auth(from.token))
          .send({ opponentId: to, metric: 'points', days: 1, stakePoints: 0, ...extra });

      expect((await send(asha, asha.id)).status).toBe(400);
      expect((await send(asha, ben.id, { days: 2 })).status).toBe(400);
      expect((await send(asha, ben.id, { stakePoints: 7 })).status).toBe(400);
      expect((await send(asha, ben.id, { metric: 'activity' })).status).toBe(400);
      expect((await send(asha, ben.id, { metric: 'activity', activityId: byName['Wash the dishes'] })).status).toBe(201);
      await col('challenges').deleteMany({});

      const first = await send(asha, ben.id);
      expect(first.status).toBe(201);
      expect((await send(ben, asha.id)).status).toBe(409); // one at a time per pair

      await request(app).post(`/api/challenges/${first.body.challenge.id}/decline`).set(auth(asha.token)).expect(403);
      await request(app).post(`/api/challenges/${first.body.challenge.id}/decline`).set(auth(ben.token)).expect(200);

      const second = await send(asha, carl.id);
      await request(app).delete(`/api/challenges/${second.body.challenge.id}`).set(auth(carl.token)).expect(403);
      await request(app).delete(`/api/challenges/${second.body.challenge.id}`).set(auth(asha.token)).expect(200);

      const third = await send(asha, ben.id);
      await col('challenges').updateOne({ _id: oid(third.body.challenge.id) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      await request(app).get('/api/challenges').set(auth(asha.token));
      await request(app).post(`/api/challenges/${third.body.challenge.id}/accept`).set(auth(ben.token)).expect(409);
      const all = await request(app).get('/api/challenges').set(auth(asha.token));
      expect(all.body.challenges.map((c: { status: string }) => c.status).sort()).toEqual(['cancelled', 'declined', 'expired']);
    });
  });

  describe('weekly prizes', () => {
    /** Four roommates who each earned points in a past week. */
    async function playedWeek(week: string, scores: number[]) {
      const setup = await flat(['Asha', 'Ben', 'Carl', 'Dev']);
      await col('households').updateOne({ _id: oid(setup.householdId) }, { $set: { prizesFrom: '2026-W01' } });
      const day = '2026-01-07';
      await col('entries').insertMany(
        setup.people.map((person, i) => ({
          household: oid(setup.householdId),
          user: oid(person.id),
          kind: 'chore',
          activity: oid(setup.byName['Wash the dishes']),
          activityName: 'Wash the dishes',
          emoji: '🍽️',
          points: scores[i],
          bonusPoints: 0,
          note: '',
          status: 'counted',
          dayKey: day,
          weekKey: week,
          createdAt: new Date('2026-01-07T10:00:00Z'),
          updatedAt: new Date('2026-01-07T10:00:00Z'),
        })),
      );
      return setup;
    }

    it('pays the top 3 and makes 4th place cover it', async () => {
      const { people: [asha, ben, carl, dev] } = await playedWeek('2026-W02', [40, 30, 20, 10]);

      const res = await request(app).get('/api/prizes').set(auth(asha.token));
      expect(res.status).toBe(200);
      expect(res.body.settings).toEqual({ enabled: true, prizes: [25, 25, 25], isOwner: true });
      expect(res.body.weeks).toHaveLength(1);

      const week = res.body.weeks[0];
      expect(week.weekKey).toBe('2026-W02');
      expect(week.payouts.map((p: { name: string; prizePaise: number }) => [p.name, p.prizePaise])).toEqual([
        ['Asha', 2500],
        ['Ben', 2500],
        ['Carl', 2500],
      ]);
      const net = Object.fromEntries(week.balances.map((b: { name: string; netPaise: number }) => [b.name, b.netPaise]));
      expect(net).toEqual({ Asha: 625, Ben: 625, Carl: 625, Dev: -1875 });
      expect(week.transfers).toHaveLength(3);
      expect(week.transfers.every((t: { fromId: string }) => t.fromId === dev.id)).toBe(true);

      // Dev owes ₹18.75 in total; the winners are each owed ₹6.25.
      const devView = await request(app).get('/api/prizes').set(auth(dev.token));
      expect(devView.body.summary).toEqual({ owePaise: 1875, owedPaise: 0 });
      const benView = await request(app).get('/api/prizes').set(auth(ben.token));
      expect(benView.body.summary).toEqual({ owePaise: 0, owedPaise: 625 });
      expect((await request(app).get('/api/prizes').set(auth(carl.token))).body.weeks).toHaveLength(1);
    });

    it('settles a week only once, even when prize amounts change later', async () => {
      const { people: [asha] } = await playedWeek('2026-W02', [40, 30, 20, 10]);
      await request(app).get('/api/prizes').set(auth(asha.token));

      await request(app)
        .put('/api/prizes/settings')
        .set(auth(asha.token))
        .send({ enabled: true, prizes: [100, 50, 10] })
        .expect(200);

      const again = await request(app).get('/api/prizes').set(auth(asha.token));
      expect(again.body.weeks).toHaveLength(1);
      expect(again.body.weeks[0].prizes).toEqual([25, 25, 25]);
      expect(await col('settlements').countDocuments()).toBe(1);
    });

    it('lets either person mark a payment paid, and nobody else', async () => {
      const { people: [asha, ben, carl, dev] } = await playedWeek('2026-W02', [40, 30, 20, 10]);
      const view = await request(app).get('/api/prizes').set(auth(dev.token));
      const week = view.body.weeks[0];
      const toAsha = week.transfers.find((t: { toId: string }) => t.toId === asha.id);
      const url = `/api/prizes/${week.id}/transfers/${toAsha.id}/paid`;

      await request(app).post(url).set(auth(ben.token)).send({ paid: true }).expect(403);
      await request(app).post(url).set(auth(dev.token)).send({ paid: true }).expect(200);

      const after = await request(app).get('/api/prizes').set(auth(dev.token));
      expect(after.body.summary.owePaise).toBe(1250);
      await request(app).post(url).set(auth(asha.token)).send({ paid: false }).expect(200);
      expect((await request(app).get('/api/prizes').set(auth(dev.token))).body.summary.owePaise).toBe(1875);
      await request(app).post(url).set(auth(carl.token)).send({ paid: true }).expect(403);
    });

    it('only lets the owner change prize rules and validates them', async () => {
      const { people: [asha, ben] } = await playedWeek('2026-W02', [40, 30, 20, 10]);
      const put = (p: Person, body: unknown) => request(app).put('/api/prizes/settings').set(auth(p.token)).send(body as object);

      expect((await put(ben, { enabled: true, prizes: [25, 25, 25] })).status).toBe(403);
      expect((await put(asha, { enabled: true, prizes: [25, 25] })).status).toBe(400);
      expect((await put(asha, { enabled: true, prizes: [25, 25, -1] })).status).toBe(400);
      expect((await put(asha, { enabled: true, prizes: [25, 25, 9999] })).status).toBe(400);
      expect((await put(asha, { enabled: false, prizes: [25, 25, 25] })).status).toBe(200);
    });

    it('does not settle weeks from before prizes began, or when prizes are off', async () => {
      const { people: [asha], householdId } = await playedWeek('2026-W02', [40, 30, 20, 10]);
      await col('households').updateOne({ _id: oid(householdId) }, { $set: { prizesFrom: '2026-W40' } });
      expect((await request(app).get('/api/prizes').set(auth(asha.token))).body.weeks).toEqual([]);

      await col('households').updateOne({ _id: oid(householdId) }, { $set: { prizesFrom: '2026-W01', prizesEnabled: false } });
      expect((await request(app).get('/api/prizes').set(auth(asha.token))).body.weeks).toEqual([]);
    });

    it('gives the payer a UPI link when the winner has saved a UPI id', async () => {
      const { people: [asha, , , dev] } = await playedWeek('2026-W02', [40, 30, 20, 10]);

      const bad = await request(app).put('/api/auth/me/upi').set(auth(asha.token)).send({ upiId: 'not a upi id' });
      expect(bad.status).toBe(400);
      await request(app).put('/api/auth/me/upi').set(auth(asha.token)).send({ upiId: 'asha@okhdfcbank' }).expect(200);

      const view = await request(app).get('/api/prizes').set(auth(dev.token));
      const toAsha = view.body.weeks[0].transfers.find((t: { toId: string }) => t.toId === asha.id);
      expect(toAsha.upiId).toBe('asha@okhdfcbank');
      expect(toAsha.upiLink).toContain('upi://pay?pa=asha%40okhdfcbank');
      expect(toAsha.upiLink).toContain('am=6.25');

      // Winners looking at the same payment don't get the payer's tools or Asha's id leaked to bystanders.
      const bystander = await request(app).get('/api/prizes').set(auth(asha.token));
      const same = bystander.body.weeks[0].transfers.find((t: { toId: string }) => t.toId === asha.id);
      expect(same.upiLink).toBe('');
    });
  });

  describe('leaving a household', () => {
    it('hands ownership to the next roommate and cancels what the leaver had open', async () => {
      const { people: [asha, ben, carl], householdId } = await flat(['Asha', 'Ben', 'Carl']);
      await request(app)
        .post('/api/challenges')
        .set(auth(asha.token))
        .send({ opponentId: ben.id, metric: 'points', days: 1, stakePoints: 0 })
        .expect(201);

      await request(app).post('/api/households/leave').set(auth(asha.token)).expect(200);

      const household = await col('households').findOne({ _id: oid(householdId) });
      expect(String(household?.createdBy)).toBe(ben.id);
      expect((await request(app).put('/api/prizes/settings').set(auth(ben.token)).send({ enabled: true, prizes: [30, 20, 10] })).status).toBe(200);
      expect((await request(app).get('/api/challenges').set(auth(carl.token))).body.challenges[0].status).toBe('cancelled');
    });
  });
});
