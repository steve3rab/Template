import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const parallelRequests = Math.max(2, Math.min(Number(__ENV.PARALLEL_REQUESTS || 10), 50));

// Explicitly opt into this profile only against an isolated pre-production environment.
// Each VU issues a concurrent batch to expose contention and latency spikes rather than
// measuring only sequential, low-pressure requests.
export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '2m', target: 25 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    'http_req_duration{endpoint:health}': ['p(95)<300'],
    'http_req_duration{endpoint:public-catalogue}': ['p(95)<800'],
  },
};

export default function () {
  const requests = Array.from({ length: parallelRequests }, (_, index) => {
    const health = index % 2 === 0;
    return {
      method: 'GET',
      url: health ? `${baseUrl}/api/health` : `${baseUrl}/api/products`,
      params: {
        tags: { endpoint: health ? 'health' : 'public-catalogue' },
      },
    };
  });

  const responses = http.batch(requests);
  responses.forEach((response, index) => {
    const health = index % 2 === 0;
    check(response, {
      [health ? 'health endpoint returns 200' : 'catalogue endpoint returns 200']: (result) =>
        result.status === 200,
      ...(health
        ? {}
        : {
            'catalogue response is JSON': (result) =>
              result.headers['Content-Type']?.includes('application/json') === true,
          }),
    });
  });

  sleep(1);
}
