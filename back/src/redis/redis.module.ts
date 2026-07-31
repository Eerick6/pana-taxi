import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL;
  const client = url
    ? new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false })
    : new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        maxRetriesPerRequest: 3,
      });

  client.on('error', (err) => console.error('[Redis] Error:', err.message));
  client.on('connect', () => console.log('[Redis] Connected'));
  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => createRedisClient(),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
