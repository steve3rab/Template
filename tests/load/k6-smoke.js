import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3001';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '60s', target: 25 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const health = http.get(baseUrl + '/api/health');
  check(health, { 'health is 200': (r) => r.status === 200 });
  const products = http.get(baseUrl + '/api/products');
  check(products, { 'public product list is 200': (r) => r.status === 200 });
  sleep(1);
}
