import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerAccountData } from './CustomerAccountData';

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('CustomerAccountData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows customer-friendly order and payment statuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/auth/me') {
          return apiResponse({ user: { email: 'client@example.com' } });
        }
        if (url === '/api/customer/addresses') return apiResponse({ addresses: [] });
        if (url === '/api/customer/orders') {
          return apiResponse({
            orders: [
              {
                id: 'order-pending-12345678',
                status: 'PENDING',
                paymentStatus: 'UNPAID',
                totalCents: 8900,
                createdAt: '2026-11-01T12:00:00.000Z',
                items: [{ id: 'item-1', productName: 'Veste Studio', quantity: 1 }],
              },
              {
                id: 'order-shipped-87654321',
                status: 'SHIPPED',
                paymentStatus: 'PAID',
                totalCents: 7400,
                createdAt: '2026-11-01T12:00:00.000Z',
                items: [{ id: 'item-2', productName: 'Sneakers Everyday', quantity: 1 }],
              },
            ],
          });
        }
        return apiResponse({ error: 'Not found.' }, 404);
      }),
    );

    render(<CustomerAccountData />);

    expect(await screen.findByText(/En attente de paiement/)).toBeInTheDocument();
    expect(screen.getByText(/Paiement : À régler/)).toBeInTheDocument();
    expect(screen.getByText(/Expédiée/)).toBeInTheDocument();
    expect(screen.getByText(/Paiement : Payé/)).toBeInTheDocument();
    expect(screen.queryByText('UNPAID')).not.toBeInTheDocument();
    expect(screen.queryByText('SHIPPED')).not.toBeInTheDocument();
  });
});
