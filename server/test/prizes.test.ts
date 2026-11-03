import { describe, expect, it } from 'vitest';
import {
  UPI_ID_PATTERN,
  computeBalances,
  computePayouts,
  computeTransfers,
  formatRupees,
  upiLink,
} from '../src/lib/prizes';

const m = (userId: string, points: number, rank: number) => ({ userId, points, rank });

describe('computePayouts', () => {
  it('pays the top 3 and skips people with no points', () => {
    const payouts = computePayouts(
      [m('a', 50, 1), m('b', 30, 2), m('c', 10, 3), m('d', 5, 4), m('e', 0, 5)],
      [25, 25, 25],
    );
    expect(payouts.map((p) => [p.userId, p.prizePaise])).toEqual([
      ['a', 2500],
      ['b', 2500],
      ['c', 2500],
    ]);
  });

  it('does not pay someone for a rank they only share with zero points', () => {
    expect(computePayouts([m('a', 0, 1), m('b', 0, 1)], [25, 25, 25])).toEqual([]);
  });

  it('gives tied members the same rank and prize', () => {
    const payouts = computePayouts([m('a', 40, 1), m('b', 40, 1), m('c', 10, 3)], [50, 30, 10]);
    expect(payouts.map((p) => p.prizePaise)).toEqual([5000, 5000, 1000]);
  });

  it('supports tiered prizes and ignores zero-rupee tiers', () => {
    const payouts = computePayouts([m('a', 9, 1), m('b', 8, 2), m('c', 7, 3)], [40, 25, 0]);
    expect(payouts.map((p) => p.userId)).toEqual(['a', 'b']);
  });
});

describe('balances and transfers', () => {
  it('makes the 4th place pay in a 4-person flat', () => {
    const payouts = computePayouts([m('a', 9, 1), m('b', 8, 2), m('c', 7, 3), m('d', 1, 4)], [25, 25, 25]);
    const balances = computeBalances(['a', 'b', 'c', 'd'], payouts);
    const net = Object.fromEntries(balances.map((b) => [b.userId, b.netPaise]));
    expect(net).toEqual({ a: 625, b: 625, c: 625, d: -1875 });

    const transfers = computeTransfers(balances);
    expect(transfers).toEqual([
      { from: 'd', to: 'a', amountPaise: 625 },
      { from: 'd', to: 'b', amountPaise: 625 },
      { from: 'd', to: 'c', amountPaise: 625 },
    ]);
  });

  it('settles to zero when everyone wins (3-person flat)', () => {
    const payouts = computePayouts([m('a', 9, 1), m('b', 8, 2), m('c', 7, 3)], [25, 25, 25]);
    const balances = computeBalances(['a', 'b', 'c'], payouts);
    expect(balances.every((b) => b.netPaise === 0)).toBe(true);
    expect(computeTransfers(balances)).toEqual([]);
  });

  it('never creates or loses a paisa, even with awkward splits', () => {
    const payouts = computePayouts([m('a', 9, 1), m('b', 8, 2), m('c', 7, 3)], [10, 10, 10]);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const balances = computeBalances(ids, payouts);
    expect(balances.reduce((s, b) => s + b.netPaise, 0)).toBe(0);

    const transfers = computeTransfers(balances);
    const settled = new Map(balances.map((b) => [b.userId, b.netPaise]));
    for (const t of transfers) {
      settled.set(t.from, settled.get(t.from)! + t.amountPaise);
      settled.set(t.to, settled.get(t.to)! - t.amountPaise);
    }
    expect([...settled.values()].every((v) => v === 0)).toBe(true);
  });

  it('pays nothing out when nobody earned a prize', () => {
    expect(computeTransfers(computeBalances(['a', 'b'], []))).toEqual([]);
  });
});

describe('formatting and UPI', () => {
  it('formats rupees without trailing zeros for whole amounts', () => {
    expect(formatRupees(2500)).toBe('₹25');
    expect(formatRupees(1875)).toBe('₹18.75');
  });

  it('validates UPI ids', () => {
    expect(UPI_ID_PATTERN.test('aaru@okhdfcbank')).toBe(true);
    expect(UPI_ID_PATTERN.test('9876543210@ybl')).toBe(true);
    expect(UPI_ID_PATTERN.test('no-at-sign')).toBe(false);
    expect(UPI_ID_PATTERN.test('a b@upi')).toBe(false);
  });

  it('builds a UPI deep link', () => {
    const link = upiLink({ upiId: 'ben@upi', name: 'Ben', amountPaise: 1875, note: 'Roomie week' });
    expect(link.startsWith('upi://pay?')).toBe(true);
    expect(link).toContain('pa=ben%40upi');
    expect(link).toContain('am=18.75');
    expect(link).toContain('cu=INR');
  });
});
