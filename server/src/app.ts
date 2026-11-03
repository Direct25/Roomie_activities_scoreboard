import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { authLimiter } from './middleware/limits';
import { errorHandler, notFound } from './middleware/errors';
import { activitiesRouter } from './routes/activities';
import { authRouter } from './routes/auth';
import { badgesRouter } from './routes/badges';
import { bountiesRouter } from './routes/bounties';
import { challengesRouter } from './routes/challenges';
import { prizesRouter } from './routes/prizes';
import { entriesRouter } from './routes/entries';
import { householdsRouter } from './routes/households';
import { leaderboardRouter } from './routes/leaderboard';

export function createApp() {
  const app = express();

  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: config.clientOrigins }));
  app.use(express.json({ limit: '20kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/households', householdsRouter);
  app.use('/api/activities', activitiesRouter);
  app.use('/api/entries', entriesRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/bounties', bountiesRouter);
  app.use('/api/challenges', challengesRouter);
  app.use('/api/prizes', prizesRouter);
  app.use('/api/badges', badgesRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
