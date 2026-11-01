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
    expect(screen.getByRole('button', { name: /Espace vendeur/ })).toBeInTheDocument();
  });

  it('uses product photography with accessible text alternatives', () => {
    render(<App />);
    const photo = screen.getByRole('img', { name: 'Veste Studio' });
    expect(photo).toHaveAttribute('src', expect.stringContaining('images.unsplash.com'));
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
    window.fetch = (async () =>
      new Response(JSON.stringify({ error: 'Seller access required.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Espace vendeur/ }));
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
    await user.click(screen.getByRole('button', { name: 'French' }));
    expect(document.documentElement.lang).toBe('fr');
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
});
