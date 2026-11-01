import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without global APIs, so React Testing Library cannot register
// automatic cleanup on its own. Unmount each render to isolate tests.
afterEach(() => {
  cleanup();
});
