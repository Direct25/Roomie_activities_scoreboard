import mongoose from 'mongoose';
import { createApp } from './app';
import { config, jwtSecret } from './config';

async function main() {
  jwtSecret(); // fail fast in production if the secret is missing

  await mongoose.connect(config.mongoUri);
  console.log('Connected to MongoDB');

  const server = createApp().listen(config.port, () => {
    console.log(`Roomie Scoreboard API listening on http://localhost:${config.port}`);
  });

  const shutdown = () => {
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Failed to start:', error);
  process.exit(1);
});
