import type { UserDoc } from './models/User';

declare global {
  namespace Express {
    interface Request {
      user?: UserDoc;
    }
  }
}

export {};
