import type { FastifyRateLimitOptions, FastifyRateLimitStore } from '@fastify/rate-limit';
import type { RouteOptions } from 'fastify';

type CounterResult = { current: number; ttl: number };
type CounterCallback = (error: Error | null, result?: CounterResult) => void;

type RouteAwareOptions = {
  timeWindow?: number;
  nameSpace?: string;
  routeInfo?: RouteOptions & { path?: string };
};

const INCREMENT_SCRIPT = [
  "local current = redis.call('INCR', KEYS[1])",
  "if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
  "return { current, redis.call('PTTL', KEYS[1]) }",
].join('\n');

/**
 * Atomic shared counter backed by an Upstash-compatible Redis REST endpoint.
 * Client identifiers passed by the app are HMACs, never raw IP addresses.
 */
export class UpstashRateLimitStore implements FastifyRateLimitStore {
  private readonly options: RouteAwareOptions;

  constructor(options: FastifyRateLimitOptions) {
    this.options = options as unknown as RouteAwareOptions;
  }

  incr(key: string, callback: CounterCallback, suppliedTimeWindow?: number, _max?: number): void {
    void _max;
    void this.increment(key, suppliedTimeWindow).then(
      (result) => callback(null, result),
      (error: unknown) =>
        callback(error instanceof Error ? error : new Error('Shared rate-limit storage failed.')),
    );
  }

  child(routeOptions: RouteOptions & { path: string; prefix: string }): UpstashRateLimitStore {
    return new UpstashRateLimitStore({
      ...this.options,
      ...routeOptions,
    } as FastifyRateLimitOptions);
  }

  private async increment(key: string, suppliedTimeWindow?: number): Promise<CounterResult> {
    const url = process.env.RATE_LIMIT_REDIS_REST_URL;
    const token = process.env.RATE_LIMIT_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error('Shared rate-limit Redis REST credentials are not configured.');
    }

    const timeWindow =
      suppliedTimeWindow ??
      (typeof this.options.timeWindow === 'number' ? this.options.timeWindow : 60_000);
    if (!Number.isSafeInteger(timeWindow) || timeWindow < 1) {
      throw new Error('Rate-limit time window must be a positive integer in milliseconds.');
    }

    const route = this.options.routeInfo;
    const routePrefix =
      route && (route.method || route.url || route.path)
        ? `${route.method ?? 'ALL'}:${route.url ?? route.path ?? 'route'}:`
        : '';
    const namespace = this.options.nameSpace ?? 'fastify-rate-limit-';
    const redisKey = `${namespace}${routePrefix}${key}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['EVAL', INCREMENT_SCRIPT, '1', redisKey, String(timeWindow)]),
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) {
      throw new Error(`Shared rate-limit Redis REST returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as { result?: unknown; error?: string };
    if (payload.error) throw new Error('Shared rate-limit Redis REST command failed.');
    if (
      !Array.isArray(payload.result) ||
      payload.result.length !== 2 ||
      !Number.isSafeInteger(Number(payload.result[0])) ||
      !Number.isFinite(Number(payload.result[1]))
    ) {
      throw new Error('Shared rate-limit Redis REST returned an invalid counter response.');
    }

    return {
      current: Number(payload.result[0]),
      ttl: Math.max(0, Number(payload.result[1])),
    };
  }
}
