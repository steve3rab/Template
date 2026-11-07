import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SellerWorkspace } from './SellerWorkspace';

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
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

    expect(await screen.findByRole('heading', { name: /add a product/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /add a product/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/product name/i)).toBeInTheDocument();
    expect(screen.getByText(/product photos/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create product/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /my products/i })).toBeInTheDocument();
    expect(screen.getByText(/no products yet/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /customer orders/i })).toBeInTheDocument();
    expect(screen.getByText(/no orders have been recorded yet/i)).toBeInTheDocument();
  });

  it('shows a recoverable loading error instead of a false empty state and retries', async () => {
    let dashboardRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/seller/dashboard')) {
          dashboardRequests += 1;
          if (dashboardRequests === 1) return apiResponse({ error: 'Temporary failure.' }, 503);
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
        return apiResponse({ error: 'Not found.' }, 404);
      }),
    );

    const user = userEvent.setup();
    render(<SellerWorkspace range="30" language="en" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to load seller data/i);
    expect(screen.queryByText(/no products yet/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { name: /add a product/i })).toBeInTheDocument();
    expect(screen.getByText(/no products yet/i)).toBeInTheDocument();
    expect(dashboardRequests).toBe(2);
  });

  it('filters the seller catalogue by search and low-stock status', async () => {
    const products = [
      { id: 'p-1', name: 'Sac en cuir', description: '', category: 'Accessoires', priceCents: 4500, stock: 2, active: true },
      { id: 'p-2', name: 'Veste coton', description: '', category: 'Vêtements', priceCents: 7900, stock: 12, active: true },
      { id: 'p-3', name: 'Ancien sac', description: '', category: 'Accessoires', priceCents: 2500, stock: 0, active: false },
    ];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/seller/dashboard')) return apiResponse({ periodDays: 30, revenueCents: 0, orders: 0, paidOrders: 0, unitsSold: 0, products: 3, lowStockProducts: 2, currency: 'EUR' });
      if (url === '/api/seller/products') return apiResponse({ products });
      if (url === '/api/seller/orders') return apiResponse({ orders: [] });
      return apiResponse({ error: 'Unexpected request.' }, 500);
    }));
    const user = userEvent.setup();
    render(<SellerWorkspace range="30" language="en" />);
    expect(await screen.findByText('Sac en cuir')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: /filter products/i }), 'low-stock');
    expect(screen.getByText('Sac en cuir')).toBeInTheDocument();
    expect(screen.getByText('Ancien sac')).toBeInTheDocument();
    expect(screen.queryByText('Veste coton')).not.toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: /search products/i }), 'ancien');
    expect(screen.getByText('Ancien sac')).toBeInTheDocument();
    expect(screen.queryByText('Sac en cuir')).not.toBeInTheDocument();
  });

  it('rejects whitespace-only product names before calling the API', async () => {
    const toastMessages: string[] = [];
    const onToast = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail?.message === 'string') {
        toastMessages.push(event.detail.message);
      }
    };
    window.addEventListener('template-toast', onToast);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
      return apiResponse({ error: 'Unexpected request.' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<SellerWorkspace range="30" language="en" />);
    await screen.findByRole('heading', { name: /add a product/i });

    await user.clear(screen.getByLabelText(/product name/i));
    await user.type(screen.getByLabelText(/product name/i), '  ');
    await user.click(screen.getByRole('button', { name: /create product/i }));

    expect(toastMessages).toContain('Check the product name, price, stock and dimensions.');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    window.removeEventListener('template-toast', onToast);
  });
});
