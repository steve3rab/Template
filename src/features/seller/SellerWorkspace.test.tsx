import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SellerWorkspace } from './SellerWorkspace';

function apiResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SellerWorkspace translations', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders seller dashboard, product and order controls in English', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/seller/dashboard')) {
          return apiResponse({
            periodDays: 30,
            revenueCents: 0,
            orders: 0,
            paidOrders: 0,
            unitsSold: 0,
            products: 0,
            lowStockProducts: 0,
            currency: 'EUR',
          });
        }
        if (url === '/api/seller/products') return apiResponse({ products: [] });
        if (url === '/api/seller/orders') return apiResponse({ orders: [] });
        return apiResponse({ error: 'Not found.' });
      }),
    );

    render(<SellerWorkspace range="30" language="en" />);

    expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /add a product/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/product name/i)).toBeInTheDocument();
    expect(screen.getByText(/product photos/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create product/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /my products/i })).toBeInTheDocument();
    expect(screen.getByText(/no products yet/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /customer orders/i })).toBeInTheDocument();
    expect(screen.getByText(/no orders have been recorded yet/i)).toBeInTheDocument();
  });
});
