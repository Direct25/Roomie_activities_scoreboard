import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  const e = err as { code?: number; type?: string };
  if (e?.code === 11000) return res.status(409).json({ error: 'That already exists' });
  if (e?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (e?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });

  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}
