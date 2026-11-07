import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const catalogue = [
  {
    id: '1',
    name: 'Veste Studio',
    description: 'Une coupe structurée, facile à porter du matin au soir.',
    category: 'Vêtements',
    priceCents: 8900,
    stock: 10,
    active: true,
  },
  {
    id: '2',
    name: 'Sneakers Everyday',
    description: 'Le confort au quotidien, avec une silhouette minimaliste.',
    category: 'Chaussures',
    priceCents: 7400,
    stock: 10,
    active: true,
  },
  {
    id: '3',
    name: 'Sac Épure',
    description: 'Un sac compact et pratique.',
    category: 'Accessoires',
    priceCents: 5900,
    stock: 10,
    active: true,
  },
  {
    id: '4',
    name: 'Pull Essentiel',
    description: 'Une maille douce et une coupe décontractée.',
    category: 'Vêtements',
    priceCents: 6500,
    stock: 10,
    active: true,
  },
  {
    id: '5',
    name: 'Lunettes Soleil',
    description: 'Une touche graphique pour les journées ensoleillées.',
    category: 'Accessoires',
    priceCents: 3500,
    stock: 10,
    active: true,
  },
  {
    id: '6',
    name: 'Baskets City',
    description: 'Des lignes sobres qui s’accordent avec toutes vos tenues.',
    category: 'Chaussures',
    priceCents: 9200,
    stock: 10,
    active: true,
  },
  {
    id: '7',
    name: 'Chemise Relax',
    description: 'Une chemise légère pensée pour les superpositions.',
    category: 'Vêtements',
    priceCents: 4800,
    stock: 10,
    active: true,
  },
  {
    id: '8',
    name: 'Casquette Club',
    description: 'La finition simple qui change un look.',
    category: 'Accessoires',
    priceCents: 2500,
    stock: 10,
    active: true,
  },
];

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Fashion storefront', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/products') return apiResponse({ products: catalogue });
        if (url === '/api/auth/me') return apiResponse({ error: 'Not authenticated.' }, 401);
        return apiResponse({ error: 'Not authenticated.' }, 401);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the public catalogue and product categories', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /le style, en toute simplicité/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /les pièces du moment/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Veste Studio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Espace vendeur/ })).not.toBeInTheDocument();
  });

  it('uses product photography with accessible text alternatives', () => {
    render(<App />);
    const photo = screen.getByRole('img', { name: 'Veste Studio' });
    expect(photo.getAttribute('src')).toBe('/images/seed/veste-studio.svg');
    expect(photo).toHaveAttribute('loading', 'eager');
  });

  it('offers the Maison category in the storefront navigation', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Maison' }));
    expect(screen.getByRole('button', { name: 'Maison' })).toHaveClass('active');
  });

  it('filters the catalogue by category and search query', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Chaussures' }));
    expect(screen.getByRole('heading', { name: 'Sneakers Everyday' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Veste Studio' })).not.toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Rechercher un produit' }));
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un produit' }), 'Baskets');
    expect(screen.getByRole('heading', { name: 'Baskets City' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sneakers Everyday' })).not.toBeInTheDocument();
  });

  it('filters out-of-stock products and prevents adding unavailable items', async () => {
    const user = userEvent.setup();
    const productsWithOutOfStock = catalogue.map((product) =>
      product.id === '1' ? { ...product, stock: 0 } : product,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/products') return apiResponse({ products: productsWithOutOfStock });
        if (url === '/api/auth/me') return apiResponse({ error: 'Not authenticated.' }, 401);
        return apiResponse({ error: 'Not authenticated.' }, 401);
      }),
    );

    render(<App />);
    await user.click(screen.getByRole('checkbox', { name: 'En stock uniquement' }));
    expect(screen.queryByRole('heading', { name: 'Veste Studio' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sneakers Everyday' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'En stock uniquement' }));
    expect(screen.getByRole('button', { name: /épuisé/i })).toBeDisabled();
  });

  it('adds a product to the cart and allows quantity changes', async () => {
    const user = userEvent.setup();
    render(<App />);
    const product = screen.getByRole('heading', { name: 'Veste Studio' }).closest('article');
    if (!product) throw new Error('Product card not found');
    await user.click(within(product).getByRole('button', { name: /ajouter au panier/i }));
    expect(screen.getByRole('heading', { name: /mon panier/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Panier, 1 article(s)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter un Veste Studio' }));
    expect(screen.getByRole('button', { name: 'Panier, 2 article(s)' })).toBeInTheDocument();
  });

  it('toggles a product favorite', async () => {
    const user = userEvent.setup();
    render(<App />);
    const favorite = screen.getByRole('button', { name: 'Ajouter Veste Studio aux favoris' });
    await user.click(favorite);
    expect(
      screen.getByRole('button', { name: 'Retirer Veste Studio des favoris' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not open the seller dashboard when the server denies access', async () => {
    const user = userEvent.setup();
    window.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/products') return apiResponse({ products: catalogue });
      if (url === '/api/auth/me') {
        return apiResponse({
          user: {
            id: 'seller-1',
            publicId: 'USR-SELLER0001',
            email: 'seller@example.test',
            role: 'SELLER',
            createdAt: new Date().toISOString(),
          },
        });
      }
      if (url === '/api/seller/me') {
        return apiResponse({ error: 'Seller access required.' }, 403);
      }
      return apiResponse({ error: 'Not found.' }, 404);
    }) as typeof fetch;
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Espace vendeur/ }));
    expect(screen.queryByRole('heading', { name: /vue d’ensemble/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/accès refusé : cet espace est réservé aux comptes vendeurs autorisés/i),
    ).toBeInTheDocument();
  });

  it('switches language preferences and updates the document language', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('template-react-language')).toBe('en');
    expect(screen.getByText(/Effortless/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search products' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shoes' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Terms and conditions' }));
    expect(
      screen.getByRole('heading', { name: /terms and conditions of sale/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Français' }));
    expect(document.documentElement.lang).toBe('fr');
    expect(
      screen.getByRole('heading', { name: /conditions générales de vente/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retour à la boutique/i }));
    expect(screen.getByText(/Le style, en/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Rechercher un produit' })).toBeInTheDocument();
  });

  it('reuses a saved delivery address and explains the shipping amount', async () => {
    const user = userEvent.setup();
    const address = {
      id: 'address-1',
      label: 'Domicile',
      recipient: 'Camille Martin',
      line1: '12 rue des Fleurs',
      postalCode: '75011',
      city: 'Paris',
      country: 'FR',
      isDefault: true,
    };
    const requests: { url: string; method: string; body?: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        requests.push({
          url,
          method,
          ...(typeof init?.body === 'string' ? { body: init.body } : {}),
        });
        if (url === '/api/products') return apiResponse({ products: catalogue });
        if (url === '/api/auth/me') {
          return apiResponse({ user: { email: 'client@example.com' } });
        }
        if (url === '/api/customer/cart' && method === 'GET')
          return apiResponse({ items: [{ productId: '1', quantity: 1 }] });
        if (url === '/api/customer/favorites') return apiResponse({ favorites: [] });
        if (url === '/api/customer/addresses' && method === 'GET')
          return apiResponse({ addresses: [address] });
        if (url === '/api/customer/cart' && method === 'PUT') return apiResponse({ ok: true });
        if (url === '/api/customer/orders' && method === 'POST')
          return apiResponse({ order: { id: 'order-1' }, orders: [{ id: 'order-1' }] }, 201);
        if (url === '/api/customer/checkout')
          return apiResponse({ error: 'Le paiement en ligne n’est pas encore configuré.' }, 503);
        if (url === '/api/customer/addresses' && method === 'POST')
          return apiResponse({ address }, 201);
        return apiResponse({ error: 'Not found.' }, 404);
      }),
    );

    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Panier, 1 article(s)' }));
    await user.click(screen.getByRole('button', { name: /passer à la commande/i }));
    expect(
      await screen.findByRole('heading', { name: /finaliser ma commande/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Choisir une adresse enregistrée' })).toHaveValue(
      'address-1',
    );
    expect(screen.getByDisplayValue('client@example.com')).toHaveAttribute('readOnly');
    expect(screen.queryByPlaceholderText('Numéro et rue')).not.toBeInTheDocument();
    expect(screen.getByText(/aucun frais de livraison n’est ajouté/i)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /enregistrer la commande et continuer/i }));
    expect(
      await screen.findByRole('heading', { name: /merci pour votre commande/i }),
    ).toBeInTheDocument();
    expect(
      requests.some(
        (request) => request.url === '/api/customer/addresses' && request.method === 'POST',
      ),
    ).toBe(false);
    const orderRequest = requests.find(
      (request) => request.url === '/api/customer/orders' && request.method === 'POST',
    );
    expect(orderRequest?.body).toContain('"addressId":"address-1"');
  });

  it('shows that checkout is a demo rather than a real payment', async () => {
    const user = userEvent.setup();
    render(<App />);
    const product = screen.getByRole('heading', { name: 'Veste Studio' }).closest('article');
    if (!product) throw new Error('Product card not found');
    await user.click(within(product).getByRole('button', { name: /ajouter au panier/i }));
    await user.click(screen.getByRole('button', { name: /passer à la commande/i }));
    expect(screen.getByRole('heading', { name: /bonjour, bienvenue/i })).toBeInTheDocument();
    expect(
      screen.getByText(/connectez-vous ou créez un compte pour finaliser votre commande/i),
    ).toBeInTheDocument();
  });

  it('explains when the live catalogue is empty instead of suggesting filter changes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/products') return apiResponse({ products: [] });
        if (url === '/api/auth/me') return apiResponse({ error: 'Not authenticated.' }, 401);
        return apiResponse({ error: 'Not found.' }, 404);
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /aucun produit disponible pour le moment/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /réinitialiser les filtres/i }),
    ).not.toBeInTheDocument();
  });

  it('shows a catalogue loading error and retries instead of showing an empty shop', async () => {
    let productRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/products') {
        productRequests += 1;
        if (productRequests === 1) return apiResponse({ error: 'Temporary failure.' }, 503);
        return apiResponse({ products: catalogue });
      }
      if (url === '/api/auth/me') return apiResponse({ error: 'Not authenticated.' }, 401);
      return apiResponse({ error: 'Not authenticated.' }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText(/catalogue.*chargé/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Veste Studio' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /réessayer/i }));
    expect(await screen.findByRole('heading', { name: 'Veste Studio' })).toBeInTheDocument();
    expect(productRequests).toBe(2);
  });

  it('rejects whitespace-only checkout addresses before persisting the cart', async () => {
    const user = userEvent.setup();
    const requests: { url: string; method: string; body?: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        requests.push({
          url,
          method,
          ...(typeof init?.body === 'string' ? { body: init.body } : {}),
        });
        if (url === '/api/products') return apiResponse({ products: catalogue });
        if (url === '/api/auth/me') return apiResponse({ user: { email: 'client@example.com' } });
        if (url === '/api/customer/cart' && method === 'GET') {
          return apiResponse({ items: [{ productId: '1', quantity: 1 }] });
        }
        if (url === '/api/customer/favorites') return apiResponse({ favorites: [] });
        if (url === '/api/customer/addresses') return apiResponse({ addresses: [] });
        return apiResponse({ error: 'Unexpected request.' }, 500);
      }),
    );

    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Panier, 1 article(s)' }));
    await user.click(screen.getByRole('button', { name: /passer à la commande/i }));
    expect(
      await screen.findByRole('heading', { name: /finaliser ma commande/i }),
    ).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Prénom et nom du destinataire'), '  ');
    await user.type(screen.getByPlaceholderText('Numéro et rue'), '   ');
    await user.type(screen.getByPlaceholderText('75000'), '  ');
    await user.type(screen.getByPlaceholderText('Paris'), '  ');
    await user.click(screen.getByRole('checkbox'));
    const cartWritesBeforeSubmit = requests.filter(
      (request) => request.url === '/api/customer/cart' && request.method === 'PUT',
    ).length;
    await user.click(screen.getByRole('button', { name: /enregistrer la commande et continuer/i }));

    expect(
      await screen.findByText(/chaque champ obligatoire doit être correctement renseigné/i),
    ).toBeInTheDocument();
    expect(
      requests.filter(
        (request) => request.url === '/api/customer/cart' && request.method === 'PUT',
      ),
    ).toHaveLength(cartWritesBeforeSubmit);
    expect(
      requests.some(
        (request) => request.url === '/api/customer/addresses' && request.method === 'POST',
      ),
    ).toBe(false);
  });
});
