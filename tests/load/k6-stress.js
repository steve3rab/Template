import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');

// Explicitly opt into this profile only against an isolated pre-production environment.
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
  },
};

export default function () {
  const health = http.get(`${baseUrl}/api/health`, { tags: { endpoint: 'health' } });
  check(health, { 'health endpoint returns 200': (response) => response.status === 200 });

  const catalogue = http.get(`${baseUrl}/api/products`, {
    tags: { endpoint: 'public-catalogue' },
  });
  check(catalogue, {
    'catalogue endpoint returns 200': (response) => response.status === 200,
    'catalogue response is JSON': (response) =>
      response.headers['Content-Type']?.includes('application/json') === true,
  });
  sleep(1);
}
