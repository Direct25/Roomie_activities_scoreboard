import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/roomie_scoreboard',
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Set TRUST_PROXY=1 when running behind a reverse proxy (Render, Railway, Nginx...)
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 0,
  jwtExpiresIn: '30d' as const,
};

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (isProd) {
    throw new Error('JWT_SECRET must be set (16+ characters) in production');
  }
  return 'dev-only-secret-do-not-use-in-production';
}
