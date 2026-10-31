import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

describe('Fashion storefront', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the public catalogue and product categories', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /le style, en toute simplicité/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /les pièces du moment/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Veste Studio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Espace vendeur' })).toBeInTheDocument();
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
    const product = screen.getByRole('article', { name: /veste studio/i });
    await user.click(within(product).getByRole('button', { name: /ajouter au panier/i }));
    expect(screen.getByRole('heading', { name: /mon panier/i })).toBeInTheDocument();
    expect(screen.getByText('89 €')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter un Veste Studio' }));
    expect(screen.getByText('178 €')).toBeInTheDocument();
  });

  it('toggles a product favorite', async () => {
    const user = userEvent.setup();
    render(<App />);
    const favorite = screen.getByRole('button', { name: 'Ajouter Veste Studio aux favoris' });
    await user.click(favorite);
    expect(screen.getByRole('button', { name: 'Retirer Veste Studio des favoris' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens the seller dashboard with demo KPIs', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Espace vendeur' }));
    expect(screen.getByRole('heading', { name: /vue d’ensemble/i })).toBeInTheDocument();
    expect(screen.getByText('APERÇU AVEC DONNÉES FICTIVES')).toBeInTheDocument();
    expect(screen.getByText('Taux de conversion')).toBeInTheDocument();
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
    const product = screen.getByRole('article', { name: /veste studio/i });
    await user.click(within(product).getByRole('button', { name: /ajouter au panier/i }));
    await user.click(screen.getByRole('button', { name: /passer à la commande/i }));
    expect(screen.getByRole('heading', { name: /finaliser ma commande/i })).toBeInTheDocument();
    expect(screen.getByText(/le paiement en ligne n’est pas encore connecté/i)).toBeInTheDocument();
  });
});
