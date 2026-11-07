// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpstashRateLimitStore } from './upstashRateLimitStore.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('UpstashRateLimitStore', () => {
  it('uses one atomic Redis command and returns the shared counter and TTL', async () => {
    vi.stubEnv('RATE_LIMIT_REDIS_REST_URL', 'https://redis.example.test');
    vi.stubEnv('RATE_LIMIT_REDIS_REST_TOKEN', 'test-token');
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ result: [4, 52_000] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const store = new UpstashRateLimitStore({ timeWindow: 60_000 } as never);

    const result = await new Promise<{ current: number; ttl: number }>((resolve, reject) => {
      store.incr('hmac-client-key', (error, value) => {
        if (error) reject(error);
        else if (value) resolve(value);
        else reject(new Error('Missing counter result'));
      });
    });

    expect(result).toEqual({ current: 4, ttl: 52_000 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://redis.example.test');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-token' });
    const command = JSON.parse(String(init.body)) as string[];
    expect(command[0]).toBe('EVAL');
    expect(command[2]).toBe('1');
    expect(command[3]).toBe('fastify-rate-limit-hmac-client-key');
    expect(command[4]).toBe('60000');
  });

  it('propagates shared storage failures instead of allowing the request', async () => {
    vi.stubEnv('RATE_LIMIT_REDIS_REST_URL', 'https://redis.example.test');
    vi.stubEnv('RATE_LIMIT_REDIS_REST_TOKEN', 'test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    const store = new UpstashRateLimitStore({ timeWindow: 60_000 } as never);

    const error = await new Promise<Error>((resolve) => {
      store.incr('hmac-client-key', (caught) => {
        if (caught) resolve(caught);
      });
    });

    expect(error.message).toContain('HTTP 503');
  });
});
