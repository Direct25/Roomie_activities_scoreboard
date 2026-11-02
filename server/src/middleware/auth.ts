import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Types } from 'mongoose';
import { config, jwtSecret } from '../config';
import { HttpError } from '../lib/http';
import { User } from '../models/User';

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, jwtSecret(), { expiresIn: config.jwtExpiresIn });
}

/** Loads the signed-in user onto `req.user`, or responds with 401. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Please sign in');

  let subject: string | undefined;
  try {
    const payload = jwt.verify(token, jwtSecret());
    subject = typeof payload === 'object' ? payload.sub : undefined;
  } catch {
    throw new HttpError(401, 'Your session expired, please sign in again');
  }

  const user = subject ? await User.findById(subject) : null;
  if (!user) throw new HttpError(401, 'Please sign in');

  req.user = user;
  next();
}

/** The household the signed-in user belongs to, or a 403 if they haven't joined one. */
export function householdIdOf(req: Request): Types.ObjectId {
  const id = req.user?.household;
  if (!id) throw new HttpError(403, 'Create or join a household first');
  return id;
}
