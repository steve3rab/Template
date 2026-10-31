import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, apiRequestVoid, apiSchemas } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('typed API client', () => {
  it('validates a successful JSON response and includes session credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ products: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/api/products', apiSchemas.products)).resolves.toEqual({ products: [] });
    expect(fetchMock).toHaveBeenCalledWith('/api/products', expect.objectContaining({ credentials: 'include' }));
  });

  it('rejects malformed response data instead of trusting a type assertion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ products: [{ id: 42 }] }), { status: 200 }),
    ));

    await expect(apiRequest('/api/products', apiSchemas.products)).rejects.toThrow(
      'The server returned an unexpected response.',
    );
  });

  it('surfaces structured API errors and HTTP status codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Not authenticated.' }), { status: 401 }),
    ));

    await expect(apiRequest('/api/products', apiSchemas.products)).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Not authenticated.',
      status: 401,
    });
  });

  it('supports successful empty responses such as HTTP 204', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequestVoid('/api/customer/addresses/address-1', { method: 'DELETE' })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/customer/addresses/address-1',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
  });

  it('adds a JSON content type only when a request body exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ products: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/api/products', apiSchemas.products, { method: 'POST', body: JSON.stringify({}) });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).get('Content-Type')).toBe('application/json');
  });

  it('exposes a typed error class for callers that need status-based handling', () => {
    expect(new ApiError('No access', 403)).toMatchObject({ name: 'ApiError', status: 403 });
  });
});
