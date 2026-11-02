import { rateLimit } from 'express-rate-limit';

const skipInTests = () => process.env.NODE_ENV === 'test';

/** Brute-force protection for sign in / sign up. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipInTests,
  message: { error: 'Too many attempts, try again in a few minutes' },
});

/** Join codes are short, so guessing them needs to be slow. */
export const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipInTests,
  message: { error: 'Too many join attempts, try again in a few minutes' },
});
