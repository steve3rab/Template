import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
                id: 'order-paid-pending-11223344',
                status: 'PENDING',
                paymentStatus: 'PAID',
                totalCents: 6500,
                createdAt: '2026-11-01T12:00:00.000Z',
                items: [{ id: 'item-3', productName: 'Pull Essentiel', quantity: 1 }],
              },
              {
                id: 'order-shipped-87654321',
                status: 'SHIPPED',
                paymentStatus: 'PARTIALLY_REFUNDED',
                totalCents: 7400,
                createdAt: '2026-11-01T12:00:00.000Z',
                items: [{ id: 'item-2', productName: 'Sneakers Everyday', quantity: 1 }],
                refundedCents: 1200,
                financialTransactions: [
                  {
                    id: 'transaction-payment-1',
                    orderId: 'order-shipped-87654321',
                    stripeObjectId: 'pi_test_123',
                    type: 'PAYMENT',
                    status: 'SUCCEEDED',
                    amountCents: 7400,
                    currency: 'EUR',
                    createdAt: '2026-11-01T12:00:00.000Z',
                  },
                  {
                    id: 'transaction-refund-1',
                    orderId: 'order-shipped-87654321',
                    stripeObjectId: 're_test_123',
                    type: 'REFUND',
                    status: 'SUCCEEDED',
                    amountCents: 1200,
                    currency: 'EUR',
                    createdAt: '2026-11-02T12:00:00.000Z',
                  },
                ],
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
    expect(screen.getByText(/01\/11\/2026\s*·\s*Expédiée/)).toBeInTheDocument();
    expect(screen.getByText(/Paiement confirmé · préparation à venir/)).toBeInTheDocument();
    expect(screen.getAllByText(/Paiement : Payé/)).toHaveLength(1);
    expect(screen.getByText(/Partiellement remboursé/)).toBeInTheDocument();
    expect(screen.getByText(/Remboursement · 12,00/)).toBeInTheDocument();
    expect(screen.queryByText('UNPAID')).not.toBeInTheDocument();
    expect(screen.queryByText('SHIPPED')).not.toBeInTheDocument();
  });

  it('localizes the signed-out account prompt in English', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(apiResponse({ error: 'Not authenticated.' }, 401)),
    );
    render(<CustomerAccountData language="en" />);
    expect(
      await screen.findByText(/sign in to view your order history and saved addresses/i),
    ).toBeInTheDocument();
  });

  it('shows a recoverable loading error and retries without treating it as an empty account', async () => {
    let orderRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/auth/me') return apiResponse({ user: { email: 'client@example.com' } });
        if (url === '/api/customer/addresses') return apiResponse({ addresses: [] });
        if (url === '/api/customer/orders') {
          orderRequests += 1;
          if (orderRequests === 1) return apiResponse({ error: 'Temporary failure.' }, 503);
          return apiResponse({ orders: [] });
        }
        return apiResponse({ error: 'Not found.' }, 404);
      }),
    );

    const user = userEvent.setup();
    render(<CustomerAccountData language="en" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /unable to load your orders and addresses/i,
    );
    expect(screen.queryByText(/you have no orders yet/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText(/you have no orders yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no saved addresses yet/i)).toBeInTheDocument();
    expect(orderRequests).toBe(2);
  });

  it('lets a customer promote an owned saved address to the default address', async () => {
    let currentDefault = false;
    const address = {
      id: 'address-2',
      label: 'Work',
      recipient: 'Alex Martin',
      line1: '2 avenue du Test',
      postalCode: '75002',
      city: 'Paris',
      country: 'FR',
      isDefault: false,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') return apiResponse({ user: { email: 'client@example.com' } });
      if (url === '/api/customer/addresses/address-2/default' && init?.method === 'PATCH') {
        currentDefault = true;
        return apiResponse({ address: { ...address, isDefault: true } });
      }
      if (url === '/api/customer/addresses')
        return apiResponse({ addresses: [{ ...address, isDefault: currentDefault }] });
      if (url === '/api/customer/orders') return apiResponse({ orders: [] });
      return apiResponse({ error: 'Not found.' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<CustomerAccountData language="en" />);
    expect(await screen.findByText('Work')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /set as default/i }));
    expect(await screen.findByText(/default address updated/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/customer/addresses/address-2/default',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(screen.getByText(/Work · Default/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /set as default/i })).not.toBeInTheDocument();
  });

  it('rejects whitespace-only address fields and submits normalized values once', async () => {
    let submittedAddress: unknown;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') {
        return apiResponse({ user: { email: 'client@example.com' } });
      }
      if (url === '/api/customer/addresses' && init?.method === 'POST') {
        submittedAddress = JSON.parse(String(init.body));
        return apiResponse({
          address: {
            id: 'address-1',
            label: 'Home',
            recipient: 'Alex Martin',
            line1: '12 rue des Fleurs',
            postalCode: '75001',
            city: 'Paris',
            country: 'FR',
            isDefault: true,
          },
        });
      }
      if (url === '/api/customer/addresses') return apiResponse({ addresses: [] });
      if (url === '/api/customer/orders') return apiResponse({ orders: [] });
      return apiResponse({ error: 'Not found.' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<CustomerAccountData language="en" />);
    expect(await screen.findByText(/no saved addresses yet/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^recipient$/i), '  ');
    await user.type(screen.getByLabelText(/^address$/i), '   ');
    await user.type(screen.getByLabelText(/^postal code$/i), '  ');
    await user.type(screen.getByLabelText(/^city$/i), '  ');
    await user.click(screen.getByRole('button', { name: /save address/i }));

    expect(
      await screen.findByText(
        /recipient, address, postal code and city must be completed correctly/i,
      ),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await user.clear(screen.getByLabelText(/^recipient$/i));
    await user.type(screen.getByLabelText(/^recipient$/i), '  Alex Martin  ');
    await user.clear(screen.getByLabelText(/^address$/i));
    await user.type(screen.getByLabelText(/^address$/i), '  12 rue des Fleurs  ');
    await user.clear(screen.getByLabelText(/^postal code$/i));
    await user.type(screen.getByLabelText(/^postal code$/i), ' 75001 ');
    await user.clear(screen.getByLabelText(/^city$/i));
    await user.type(screen.getByLabelText(/^city$/i), ' Paris ');
    await user.click(screen.getByRole('button', { name: /save address/i }));

    expect(await screen.findByText('Address saved.')).toBeInTheDocument();
    expect(submittedAddress).toEqual({
      label: 'Home',
      recipient: 'Alex Martin',
      line1: '12 rue des Fleurs',
      postalCode: '75001',
      city: 'Paris',
      country: 'FR',
      isDefault: true,
    });
  });
});
