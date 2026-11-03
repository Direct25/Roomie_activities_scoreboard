/**
 * Weekly prize money, in paise (₹1 = 100 paise) so nothing is ever a float.
 *
 * Funding is a shared pot: the week's prizes are split equally across every
 * member, so people who win more than their share receive money and everyone
 * else pays. With ₹25 for the top 3, a 4-person flat means the 4th place pays
 * ₹18.75 in total, and a 3-person flat settles at zero.
 */

export interface RankedMember {
  userId: string;
  points: number;
  rank: number;
}

export interface Payout {
  userId: string;
  rank: number;
  prizePaise: number;
}

export interface Balance {
  userId: string;
  prizePaise: number;
  sharePaise: number;
  netPaise: number;
}

export interface Transfer {
  from: string;
  to: string;
  amountPaise: number;
}

export const toPaise = (rupees: number) => Math.round(rupees * 100);

/** Prize for each ranked member. Ties share a rank, and so share that rank's prize. */
export function computePayouts(standings: RankedMember[], prizesRupees: number[]): Payout[] {
  const payouts: Payout[] = [];
  for (const member of standings) {
    const prize = prizesRupees[member.rank - 1];
    if (member.points > 0 && prize && prize > 0) {
      payouts.push({ userId: member.userId, rank: member.rank, prizePaise: toPaise(prize) });
    }
  }
  return payouts;
}

/** Everyone's equal share of the pot, with leftover paise handed out one by one. */
function splitEvenly(totalPaise: number, userIds: string[]): Map<string, number> {
  const ordered = [...userIds].sort();
  const base = Math.floor(totalPaise / ordered.length);
  let remainder = totalPaise - base * ordered.length;
  const shares = new Map<string, number>();
  for (const id of ordered) {
    shares.set(id, base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder -= 1;
  }
  return shares;
}

export function computeBalances(memberIds: string[], payouts: Payout[]): Balance[] {
  if (memberIds.length === 0) return [];
  const pot = payouts.reduce((sum, p) => sum + p.prizePaise, 0);
  const shares = splitEvenly(pot, memberIds);
  const won = new Map(payouts.map((p) => [p.userId, p.prizePaise]));

  return memberIds.map((userId) => {
    const prizePaise = won.get(userId) ?? 0;
    const sharePaise = shares.get(userId) ?? 0;
    return { userId, prizePaise, sharePaise, netPaise: prizePaise - sharePaise };
  });
}

/**
 * Fewest-ish payments that settle everyone up: the biggest debtor pays the
 * biggest creditor until the money is square. Deterministic for equal amounts.
 */
export function computeTransfers(balances: Balance[]): Transfer[] {
  const byAmount = (a: { id: string; amount: number }, b: { id: string; amount: number }) =>
    b.amount - a.amount || a.id.localeCompare(b.id);

  const debtors = balances
    .filter((b) => b.netPaise < 0)
    .map((b) => ({ id: b.userId, amount: -b.netPaise }))
    .sort(byAmount);
  const creditors = balances
    .filter((b) => b.netPaise > 0)
    .map((b) => ({ id: b.userId, amount: b.netPaise }))
    .sort(byAmount);

  const transfers: Transfer[] = [];
  while (debtors.length && creditors.length) {
    const debtor = debtors[0];
    const creditor = creditors[0];
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ from: debtor.id, to: creditor.id, amountPaise: amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtors.shift();
    if (creditor.amount === 0) creditors.shift();
    debtors.sort(byAmount);
    creditors.sort(byAmount);
  }
  return transfers;
}

export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return Number.isInteger(rupees) ? `₹${rupees}` : `₹${rupees.toFixed(2)}`;
}

export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,31}$/;

/** A UPI deep link that opens the payer's UPI app with everything filled in. */
export function upiLink(opts: { upiId: string; name: string; amountPaise: number; note: string }): string {
  const params = new URLSearchParams({
    pa: opts.upiId,
    pn: opts.name,
    am: (opts.amountPaise / 100).toFixed(2),
    cu: 'INR',
    tn: opts.note,
  });
  return `upi://pay?${params.toString()}`;
}
