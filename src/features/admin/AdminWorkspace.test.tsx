import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminWorkspace } from './AdminWorkspace';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('AdminWorkspace', () => {
  it('loads global KPIs and exposes account, product and order management sections', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          users: 8,
          sellers: 2,
          products: 14,
          activeProducts: 11,
          orders: 6,
          paidOrders: 3,
          revenueCents: 12900,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          users: [
            {
              id: 'u-1',
              publicId: 'USR-1001',
              email: 'seller@example.test',
              role: 'SELLER',
              createdAt: '2026-11-01T00:00:00.000Z',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          products: [
            {
              id: 'p-1',
              name: 'Sac',
              description: '',
              category: 'Accessoires',
              priceCents: 2500,
              stock: 4,
              active: true,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          orders: [
            {
              id: 'order-12345678',
              status: 'PENDING',
              paymentStatus: 'UNPAID',
              totalCents: 2500,
              createdAt: '2026-11-01T00:00:00.000Z',
              customer: { email: 'client@example.test' },
              items: [{ id: 'item-1', productName: 'Sac', quantity: 1 }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ transactions: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          checkedAt: '2026-11-06T12:00:00.000Z',
          checkedOrders: 1,
          matched: 1,
          discrepancies: 0,
          unverified: 0,
          results: [{ orderId: 'order-12345678', state: 'MATCHED', issues: [] }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminWorkspace />);

    expect(await screen.findByRole('heading', { name: /centre de gestion/i })).toBeInTheDocument();
    expect(await screen.findByText('8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /utilisateurs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /produits/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /commandes/i })).toBeInTheDocument();
    expect(screen.getByText('seller@example.test')).toBeInTheDocument();

    await screen.getByRole('button', { name: /produits/i }).click();
    await waitFor(() => expect(screen.getByText('Sac')).toBeInTheDocument());

    await screen.getByRole('button', { name: /commandes/i }).click();
    await waitFor(() => expect(screen.getByText(/client@example.test/i)).toBeInTheDocument());
    await screen.getByRole('button', { name: /finances/i }).click();
    expect(screen.getByRole('heading', { name: /historique financier/i })).toBeInTheDocument();
    expect(screen.getByText(/aucune transaction financière/i)).toBeInTheDocument();
    await screen.getByRole('button', { name: /rapprocher avec stripe/i }).click();
    expect(
      await screen.findByText(/1 rapprochées · 0 écarts · 0 non vérifiées/i),
    ).toBeInTheDocument();
  });

  it('renders administrator navigation and sections in English', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            users: 0,
            sellers: 0,
            products: 0,
            activeProducts: 0,
            orders: 0,
            paidOrders: 0,
            revenueCents: 0,
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ users: [] }))
        .mockResolvedValueOnce(jsonResponse({ products: [] }))
        .mockResolvedValueOnce(jsonResponse({ orders: [] }))
        .mockResolvedValueOnce(jsonResponse({ transactions: [] })),
    );
    render(<AdminWorkspace language="en" />);
    expect(await screen.findByRole('heading', { name: /management centre/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /users/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /products/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /orders/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /account management/i })).toBeInTheDocument();
    expect(screen.getByText(/no users/i)).toBeInTheDocument();
  });
});
