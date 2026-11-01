import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AuthPanel } from '../features/auth/AuthPanel';
import { ResetPassword } from '../features/auth/ResetPassword';
import { SellerWorkspace } from '../features/seller/SellerWorkspace';
import { LegalPage, type LegalPageKind } from '../features/legal/LegalPage';
import { CustomerAccountData } from '../features/account/CustomerAccountData';
import { formatCurrency } from '../shared/utils/formatCurrency';
import { readStoredJson, writeStoredJson } from '../shared/utils/safeStorage';
import { apiRequest, apiSchemas } from '../shared/api/client';

function isCart(value: unknown): value is Record<string, number> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([id, quantity]) => id.length > 0 && Number.isInteger(quantity) && quantity >= 0,
    )
  );
}

function isFavorites(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

type Category = 'Tout' | 'Vêtements' | 'Chaussures' | 'Accessoires';
type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  oldPrice?: number;
  color: string;
  icon: string;
  tag?: string;
  description: string;
};
const products: Product[] = [
  {
    id: '1',
    name: 'Veste Studio',
    category: 'Vêtements',
    price: 89,
    oldPrice: 120,
    color: 'sand',
    icon: '🧥',
    tag: 'BEST-SELLER',
    description: 'Une coupe structurée, facile à porter du matin au soir.',
  },
  {
    id: '2',
    name: 'Sneakers Everyday',
    category: 'Chaussures',
    price: 74,
    color: 'mint',
    icon: '👟',
    tag: 'NOUVEAU',
    description: 'Le confort au quotidien, avec une silhouette minimaliste.',
  },
  {
    id: '3',
    name: 'Sac Épure',
    category: 'Accessoires',
    price: 59,
    color: 'rose',
    icon: '👜',
    description: 'Un sac compact et pratique pour garder l’essentiel à portée de main.',
  },
  {
    id: '4',
    name: 'Pull Essentiel',
    category: 'Vêtements',
    price: 65,
    color: 'lavender',
    icon: '🧶',
    description: 'Une maille douce et une coupe décontractée.',
  },
  {
    id: '5',
    name: 'Lunettes Soleil',
    category: 'Accessoires',
    price: 35,
    oldPrice: 45,
    color: 'blue',
    icon: '🕶️',
    tag: '-22 %',
    description: 'Une touche graphique pour les journées ensoleillées.',
  },
  {
    id: '6',
    name: 'Baskets City',
    category: 'Chaussures',
    price: 92,
    color: 'peach',
    icon: '👞',
    description: 'Des lignes sobres qui s’accordent avec toutes vos tenues.',
  },
  {
    id: '7',
    name: 'Chemise Relax',
    category: 'Vêtements',
    price: 48,
    color: 'blue',
    icon: '👔',
    description: 'Une chemise légère pensée pour les superpositions.',
  },
  {
    id: '8',
    name: 'Casquette Club',
    category: 'Accessoires',
    price: 25,
    color: 'sand',
    icon: '🧢',
    tag: 'ESSENTIEL',
    description: 'La finition simple qui change un look.',
  },
];
type View = 'shop' | 'account' | 'seller' | 'checkout' | 'legal' | 'reset';

export function App() {
  const language = 'fr' as const;
  const paymentState = new URLSearchParams(window.location.search).get('payment');
  const [view, setView] = useState<View>(() => {
    if (window.location.pathname === '/reset-password') return 'reset';
    return paymentState === 'success' || paymentState === 'cancelled' ? 'account' : 'shop';
  });
  const [category, setCategory] = useState<Category>('Tout');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('featured');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>(() =>
    readStoredJson('atelier-cart', {}, isCart),
  );
  const [favorites, setFavorites] = useState<string[]>(() =>
    readStoredJson('atelier-favorites', [], isFavorites),
  );
  const [cartHydrated, setCartHydrated] = useState(false);
  const cartSyncQueue = useRef<Promise<void>>(Promise.resolve());
  const cartSyncVersion = useRef(0);
  const authEpoch = useRef(0);
  const favoriteRequests = useRef(new Set<string>());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [catalog, setCatalog] = useState<Product[]>(products);
  const [cartOpen, setCartOpen] = useState(false);
  const [toastKind, setToastKind] = useState<'info' | 'success' | 'error'>('info');
  const [notice, setNotice] = useState(() => {
    if (paymentState === 'success') {
      return 'Paiement transmis. Le statut de la commande sera confirmé après vérification du prestataire.';
    }
    if (paymentState === 'cancelled') {
      return 'Paiement annulé. Vos commandes restent disponibles dans votre compte pour réessayer.';
    }
    return '';
  });
  const [checkoutDone, setCheckoutDone] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [orderEmail, setOrderEmail] = useState('');
  const [sellerRange, setSellerRange] = useState('30');
  const [legalPage, setLegalPage] = useState<LegalPageKind>('terms');
  useEffect(() => {
    const onToast = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as { message?: unknown; type?: unknown };
      if (typeof detail.message !== 'string' || !detail.message) return;
      setToastKind(detail.type === 'error' || detail.type === 'success' ? detail.type : 'info');
      setNotice(detail.message);
    };
    window.addEventListener('template-toast', onToast);
    return () => window.removeEventListener('template-toast', onToast);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);
  useEffect(() => {
    const currentPaymentState = new URLSearchParams(window.location.search).get('payment');
    if (currentPaymentState === 'success' || currentPaymentState === 'cancelled') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  const filteredProducts = useMemo(() => {
    const result = catalog.filter(
      (product) =>
        (category === 'Tout' || product.category === category) &&
        (!favoritesOnly || favorites.includes(product.id)) &&
        `${product.name} ${product.category} ${product.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    if (sort === 'price-up') result.sort((a, b) => a.price - b.price);
    if (sort === 'price-down') result.sort((a, b) => b.price - a.price);
    if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return result;
  }, [catalog, category, favorites, favoritesOnly, query, sort]);
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const cartTotal = catalog.reduce(
    (sum, product) => sum + product.price * (cart[product.id] ?? 0),
    0,
  );
  useEffect(() => {
    const onAuthChanged = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const authenticated = event.detail?.authenticated === true;
      authEpoch.current += 1;
      cartSyncVersion.current += 1;
      // Every account transition requires a fresh server hydration before cart writes.
      setCartHydrated(false);
      setIsAuthenticated(authenticated);
      if (!authenticated) {
        // Never carry a previous account's private cart/favorites into a guest or another account.
        setCart({});
        setFavorites([]);
        setCheckoutDone(false);
      }
    };
    window.addEventListener('template-auth-changed', onAuthChanged);
    return () => window.removeEventListener('template-auth-changed', onAuthChanged);
  }, []);
  useEffect(() => {
    let active = true;
    void apiRequest('/api/products', apiSchemas.products)
      .then((payload) => {
        if (!active) return;
        setCatalog(
          payload.products.map((item) => {
            const fallback = products.find((product) => product.id === item.id);
            return {
              id: item.id,
              name: item.name,
              description: item.description,
              category: item.category,
              price: item.priceCents / 100,
              color: fallback?.color ?? 'sand',
              icon: fallback?.icon ?? '📦',
              ...(fallback?.oldPrice !== undefined ? { oldPrice: fallback.oldPrice } : {}),
              ...(fallback?.tag !== undefined ? { tag: fallback.tag } : {}),
            };
          }),
        );
      })
      .catch(() => {
        // Never present hard-coded demo products as if they came from the live catalogue.
        if (!active) return;
        setCatalog([]);
        setToastKind('error');
        setNotice(
          'Impossible de charger le catalogue. Vérifiez votre connexion puis actualisez la page.',
        );
      });
    // Resolve authentication only from explicit session outcomes. A 5xx/network
    // failure must not be interpreted as logout or overwrite a valid client state.
    void fetch('/api/auth/me', { credentials: 'include', signal: AbortSignal.timeout(15000) })
      .then((response) => {
        if (!active) return;
        if (response.ok) {
          setIsAuthenticated(true);
          window.dispatchEvent(
            new CustomEvent('template-auth-changed', { detail: { authenticated: true } }),
          );
          return;
        }
        if (response.status === 401) {
          setIsAuthenticated(false);
          window.dispatchEvent(
            new CustomEvent('template-auth-changed', { detail: { authenticated: false } }),
          );
          return;
        }
        setToastKind('error');
        setNotice('Impossible de vérifier votre session. Réessayez sans vous déconnecter.');
      })
      .catch(() => {
        if (!active) return;
        setToastKind('error');
        setNotice('Impossible de vérifier votre session. Vérifiez votre connexion puis réessayez.');
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    writeStoredJson('atelier-cart', cart);
    if (!isAuthenticated || !cartHydrated) return;
    const version = ++cartSyncVersion.current;
    const epoch = authEpoch.current;
    const snapshot = Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity }));
    // Serialize writes: slower older requests must never overwrite a newer cart.
    cartSyncQueue.current = cartSyncQueue.current
      .catch(() => undefined)
      .then(async () => {
        // A queued write belongs to the session that created it. Never send it
        // after logout/account switching, when the browser cookie may have changed.
        if (epoch !== authEpoch.current || !isAuthenticated) return;
        const response = await fetch('/api/customer/cart', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: snapshot }),
        });
        if (!response.ok)
          throw new Error('Impossible de synchroniser le panier avec votre compte.');
      })
      .catch(() => {
        if (epoch === authEpoch.current && version === cartSyncVersion.current) {
          setToastKind('error');
          setNotice(
            'Le panier n’a pas pu être synchronisé. Vérifiez votre connexion puis réessayez.',
          );
        }
      });
  }, [cart, isAuthenticated, cartHydrated]);
  useEffect(() => {
    writeStoredJson('atelier-favorites', favorites);
  }, [favorites]);
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    void Promise.all([
      apiRequest('/api/customer/cart', apiSchemas.customerCart),
      apiRequest('/api/customer/favorites', apiSchemas.customerFavorites),
    ])
      .then(([cartPayload, favoritePayload]) => {
        if (!active) return;
        // The authenticated account is the source of truth. Do not merge data left in
        // localStorage by a guest or a previous account.
        const serverCart: Record<string, number> = {};
        for (const item of cartPayload.items) serverCart[item.productId] = item.quantity;
        setCart(serverCart);
        setFavorites([...new Set(favoritePayload.favorites.map((item) => item.productId))]);
        setCartHydrated(true);
      })
      .catch(() => {
        if (!active) return;
        setCartHydrated(false);
        setToastKind('error');
        setNotice(
          'Impossible de charger les données de votre compte. Vos modifications ne seront pas synchronisées tant que la connexion ne sera pas rétablie.',
        );
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated]);
  async function openSeller() {
    try {
      const response = await fetch('/api/seller/me', { credentials: 'include' });
      if (!response.ok) {
        setNotice(
          response.status === 401
            ? 'Connectez-vous avec un compte vendeur autorisé pour accéder à cet espace.'
            : 'Accès refusé : cet espace est réservé aux comptes vendeurs autorisés.',
        );
        if (response.status === 401) setView('account');
        return;
      }
      setView('seller');
    } catch {
      setNotice("Impossible de vérifier vos droits d'accès. Réessayez dans un instant.");
    }
  }
  function addToCart(product: Product) {
    setCart((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
    setNotice(`${product.name} ajouté au panier`);
    setCartOpen(true);
  }
  function changeQuantity(id: string, amount: number) {
    setCart((current) => {
      const next = { ...current, [id]: (current[id] ?? 0) + amount };
      if ((next[id] ?? 0) <= 0) delete next[id];
      return next;
    });
  }
  async function toggleFavorite(id: string) {
    const productId = id;
    if (favoriteRequests.current.has(productId)) return;
    const isFavorite = favorites.includes(productId);
    const epoch = authEpoch.current;
    if (!isAuthenticated) {
      setFavorites((current) =>
        isFavorite
          ? current.filter((item) => item !== productId)
          : [...new Set([...current, productId])],
      );
      return;
    }

    // Do not report a favorite change until the server confirms it.
    favoriteRequests.current.add(productId);
    try {
      const response = await fetch('/api/customer/favorites/' + encodeURIComponent(productId), {
        method: isFavorite ? 'DELETE' : 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? 'Votre session a expiré. Reconnectez-vous pour modifier vos favoris.'
            : 'Impossible de mettre à jour vos favoris. Réessayez.',
        );
      }
      if (epoch !== authEpoch.current) return;
      setFavorites((current) =>
        isFavorite
          ? current.filter((item) => item !== productId)
          : [...new Set([...current, productId])],
      );
    } catch (error) {
      if (epoch !== authEpoch.current) return;
      setToastKind('error');
      setNotice(
        error instanceof Error ? error.message : 'Impossible de mettre à jour vos favoris.',
      );
    } finally {
      favoriteRequests.current.delete(productId);
    }
  }
  async function beginCheckout() {
    setCartOpen(false);
    setCheckoutDone(false);
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (response.ok) {
        const payload = (await response.json()) as { user?: { email: string } };
        setOrderEmail(payload.user?.email ?? '');
        setCheckoutPending(false);
        setView('checkout');
        return;
      }
    } catch {
      // Continue to account sign-in if the session cannot be verified.
    }
    setCheckoutPending(true);
    setView('account');
    setNotice('Connectez-vous ou créez un compte pour finaliser votre commande.');
  }
  async function completeCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setNotice('');
    try {
      const cartResponse = await fetch('/api/customer/cart', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: Object.entries(cart).map(([productId, quantity]) => ({
            productId: String(productId),
            quantity,
          })),
        }),
      });
      if (!cartResponse.ok)
        throw new Error('Impossible d’enregistrer le panier. Reconnectez-vous.');
      const addressResponse = await fetch('/api/customer/addresses', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'Livraison',
          recipient: String(form.get('recipient') ?? ''),
          line1: String(form.get('line1') ?? ''),
          line2: String(form.get('line2') ?? '') || null,
          postalCode: String(form.get('postalCode') ?? ''),
          city: String(form.get('city') ?? ''),
          country: 'FR',
          isDefault: true,
        }),
      });
      const addressPayload = (await addressResponse.json()) as {
        address?: { id: string };
        error?: string;
      };
      if (!addressResponse.ok || !addressPayload.address)
        throw new Error(addressPayload.error ?? 'Adresse de livraison invalide.');
      const orderResponse = await fetch('/api/customer/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addressId: addressPayload.address.id }),
      });
      const orderPayload = (await orderResponse.json()) as {
        order?: { id: string };
        orders?: { id: string }[];
        error?: string;
      };
      if (!orderResponse.ok || !orderPayload.order)
        throw new Error(orderPayload.error ?? 'Impossible d’enregistrer la commande.');
      const orderIds = orderPayload.orders?.map((order) => order.id) ?? [orderPayload.order.id];
      setCart({});
      try {
        const checkoutPayload = await apiRequest(
          '/api/customer/checkout',
          apiSchemas.checkoutSession,
          {
            method: 'POST',
            body: JSON.stringify({ orderIds }),
          },
        );
        window.location.assign(checkoutPayload.checkoutUrl);
      } catch (error) {
        // The order has already been persisted. Keep it visible and explain that
        // payment still needs to be completed instead of reporting order creation as failed.
        setNotice(
          error instanceof Error
            ? error.message
            : 'Commande enregistrée, mais paiement indisponible.',
        );
        setCheckoutDone(true);
        setView('checkout');
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Erreur pendant la validation de la commande.',
      );
    }
  }
  return (
    <main className="store-app">
      <div className="announcement">
        SÉLECTION ATELIER · PAIEMENT EN LIGNE · CONDITIONS DE RETOUR EN PIED DE PAGE
      </div>
      <header className="store-header">
        <a
          className="store-brand"
          href="#home"
          onClick={(event) => {
            event.preventDefault();
            setView('shop');
          }}
          aria-label="Atelier, accueil"
        >
          <span className="store-brand-icon">a.</span>
          <span>
            atelier<span className="brand-period">.</span>
          </span>
        </a>
        <nav className="main-nav" aria-label="Navigation principale">
          <button
            className={view === 'shop' && category === 'Tout' ? 'nav-link active' : 'nav-link'}
            onClick={() => {
              setView('shop');
              setCategory('Tout');
            }}
          >
            Collection
          </button>
          <button
            className={view === 'shop' && category === 'Vêtements' ? 'nav-link active' : 'nav-link'}
            onClick={() => {
              setView('shop');
              setCategory('Vêtements');
            }}
          >
            Vêtements
          </button>
          <button
            className={
              view === 'shop' && category === 'Chaussures' ? 'nav-link active' : 'nav-link'
            }
            onClick={() => {
              setView('shop');
              setCategory('Chaussures');
            }}
          >
            Chaussures
          </button>
          <button
            className={
              view === 'shop' && category === 'Accessoires' ? 'nav-link active' : 'nav-link'
            }
            onClick={() => {
              setView('shop');
              setCategory('Accessoires');
            }}
          >
            Accessoires
          </button>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label="Compte client"
            onClick={() => setView('account')}
          >
            ♙
          </button>
          <button
            className="cart-button"
            onClick={() => setCartOpen((open) => !open)}
            aria-label={`Panier, ${cartCount} article(s)`}
          >
            Panier <span className="cart-count">{cartCount}</span>
          </button>
        </div>
      </header>
      {notice && (
        <div
          className={`toast toast-${toastKind}`}
          role={toastKind === 'error' ? 'alert' : 'status'}
        >
          {notice}
          <button aria-label="Fermer le message" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
      {view === 'shop' && (
        <>
          <section className="hero-banner" aria-labelledby="hero-title">
            <div className="hero-copy">
              <span className="eyebrow">LA SÉLECTION DE LA SAISON</span>
              <h1 id="hero-title">
                Le style, en
                <br />
                <em>toute simplicité.</em>
              </h1>
              <p>
                Des essentiels bien pensés, des pièces faciles à vivre. Découvrez une sélection qui
                vous ressemble.
              </p>
              <button
                className="dark-button"
                onClick={() => {
                  setCategory('Tout');
                  document.getElementById('catalogue')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Découvrir la collection <span>↗</span>
              </button>
              <div className="hero-note">
                <span className="note-star">✳</span>
                <span>
                  Une mode à porter
                  <br />
                  et à reporter.
                </span>
              </div>
            </div>
            <div className="hero-art" aria-label="Illustration de pièces mode">
              <div className="hero-shape shape-one" />
              <div className="hero-shape shape-two" />
              <div className="hero-product">🧥</div>
              <div className="hero-sticker">
                NOUVELLE
                <br />
                COLLECTION <span>✳</span>
              </div>
              <div className="hero-caption">
                LES PETITS DÉTAILS
                <br />
                FONT LE STYLE.
              </div>
            </div>
          </section>
          <section className="catalogue-section" id="catalogue">
            <div className="section-heading">
              <div>
                <span className="eyebrow">À VOUS DE CHOISIR</span>
                <h2>
                  Les pièces du moment<span className="brand-period">.</span>
                </h2>
                <p>Des favoris à adopter sans hésiter.</p>
              </div>
              <span className="product-count">{filteredProducts.length} articles</span>
            </div>
            <div className="catalogue-toolbar">
              <div className="catalogue-tools">
                <label className="search-box">
                  <span aria-hidden="true">⌕</span>
                  <input
                    aria-label="Rechercher un produit"
                    placeholder="Rechercher..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={favoritesOnly ? 'favorite-filter selected' : 'favorite-filter'}
                  aria-pressed={favoritesOnly}
                  onClick={() => setFavoritesOnly((current) => !current)}
                >
                  <span aria-hidden="true">{favoritesOnly ? '♥' : '♡'}</span> Favoris
                </button>
                <label className="sort-label">
                  <span className="visually-hidden">Trier les produits</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value)}>
                    <option value="featured">À la une</option>
                    <option value="price-up">Prix croissant</option>
                    <option value="price-down">Prix décroissant</option>
                    <option value="name">Nom A–Z</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="product-grid">
              {filteredProducts.map((product, index) => (
                <article className="product-card" key={product.id}>
                  <div className={`product-visual ${product.color}`}>
                    {product.tag && <span className="product-tag">{product.tag}</span>}
                    <button
                      className={
                        favorites.includes(product.id)
                          ? 'favorite-button favorited'
                          : 'favorite-button'
                      }
                      aria-label={
                        favorites.includes(product.id)
                          ? `Retirer ${product.name} des favoris`
                          : `Ajouter ${product.name} aux favoris`
                      }
                      aria-pressed={favorites.includes(product.id)}
                      onClick={() => toggleFavorite(product.id)}
                    >
                      {favorites.includes(product.id) ? '♥' : '♡'}
                    </button>
                    <span className={`product-emoji product-emoji-${index % 4}`} aria-hidden="true">
                      {product.icon}
                    </span>
                    <span className="visual-label">{product.category.toUpperCase()}</span>
                    <button className="quick-add" onClick={() => addToCart(product)}>
                      Ajouter au panier <span>＋</span>
                    </button>
                  </div>
                  <div className="product-meta">
                    <div>
                      <h3>{product.name}</h3>
                      <p>{product.category}</p>
                    </div>
                    <div className="product-price">
                      {product.oldPrice && <del>{formatCurrency(product.oldPrice)}</del>}
                      <strong>{formatCurrency(product.price)}</strong>
                    </div>
                  </div>
                  <p className="product-description">{product.description}</p>
                </article>
              ))}
            </div>
            {filteredProducts.length === 0 && (
              <div className="empty-state">
                <span>⌕</span>
                <h3>Aucun article trouvé</h3>
                <p>Essayez une autre recherche ou une autre catégorie.</p>
                <button
                  className="outline-button"
                  onClick={() => {
                    setQuery('');
                    setCategory('Tout');
                    setFavoritesOnly(false);
                  }}
                >
                  Réinitialiser les filtres
                </button>
              </div>
            )}
          </section>
          <section className="benefits-strip">
            <div>
              <span>✳</span>
              <strong>Des essentiels durables</strong>
              <p>Des pièces pensées pour durer.</p>
            </div>
            <div>
              <span>↗</span>
              <strong>Paiement en ligne</strong>
              <p>Le paiement est traité via Stripe lorsque le service est configuré.</p>
            </div>
            <div>
              <span>↺</span>
              <strong>Informations de retour</strong>
              <p>Consultez les conditions applicables avant toute commande.</p>
            </div>
            <div>
              <span>♡</span>
              <strong>Informations utiles</strong>
              <p>Conditions de vente et confidentialité accessibles en pied de page.</p>
            </div>
          </section>
        </>
      )}
      {view === 'account' && (
        <section className="workspace-page">
          <button className="back-link" onClick={() => setView('shop')}>
            ← Retour à la boutique
          </button>
          <span className="eyebrow">VOTRE ESPACE PERSONNEL</span>
          <h1 className="workspace-title">
            Bonjour, bienvenue<span className="brand-period">.</span>
          </h1>
          <p className="workspace-intro">
            Connectez-vous pour retrouver vos commandes et gérer vos informations de livraison.
          </p>
          <div className="account-benefits">
            <div>
              <span>01</span>
              <strong>Vos commandes</strong>
              <p>Consultez le suivi et l’historique de vos achats.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Vos adresses</strong>
              <p>Ajoutez ou supprimez vos adresses de livraison.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Votre compte</strong>
              <p>Gérez votre connexion et vos informations personnelles.</p>
            </div>
          </div>
          <AuthPanel
            language={language}
            initialMode={checkoutPending ? 'login' : 'register'}
            onAuthenticated={() => {
              if (checkoutPending) {
                setCheckoutPending(false);
                setView('checkout');
              }
            }}
          />
          <CustomerAccountData />
          <p className="fine-print">
            La création de compte et la connexion utilisent le service d’authentification existant.
          </p>
        </section>
      )}
      {view === 'checkout' && (
        <section className="workspace-page checkout-page">
          <button className="back-link" onClick={() => setView('shop')}>
            ← Continuer mes achats
          </button>
          {checkoutDone ? (
            <div className="success-panel">
              <span className="success-icon">✓</span>
              <span className="eyebrow">COMMANDE ENREGISTRÉE</span>
              <h1>
                Merci pour votre commande<span className="brand-period">.</span>
              </h1>
              <p>
                Votre commande est enregistrée pour {orderEmail}. Aucun paiement n’a été effectué
                pour le moment. Si le paiement n’a pas pu être préparé, retrouvez cette commande
                dans votre compte pour réessayer.
              </p>
              <button
                className="dark-button"
                onClick={() => {
                  setView('shop');
                  setCheckoutDone(false);
                }}
              >
                Retour à la boutique ↗
              </button>
            </div>
          ) : (
            <>
              <span className="eyebrow">DERNIÈRE ÉTAPE</span>
              <h1 className="workspace-title">
                Finaliser ma commande<span className="brand-period">.</span>
              </h1>
              <p className="workspace-intro">
                Votre commande sera enregistrée avant l’ouverture du paiement sécurisé Stripe.
                L’expédition ne démarre qu’après confirmation du paiement.
              </p>
              <div className="checkout-layout">
                <form className="checkout-form" onSubmit={completeCheckout}>
                  <h2>Informations de livraison</h2>
                  <label>
                    Adresse e-mail
                    <input
                      required
                      type="email"
                      autoComplete="email"
                      value={orderEmail}
                      onChange={(event) => setOrderEmail(event.target.value)}
                      placeholder="vous@exemple.fr"
                    />
                  </label>
                  <div className="form-two-col">
                    <label>
                      Destinataire (prénom et nom)
                      <input
                        required
                        name="recipient"
                        autoComplete="name"
                        placeholder="Prénom et nom du destinataire"
                      />
                    </label>
                    <label>
                      Complément d’adresse (facultatif)
                      <input
                        name="line2"
                        autoComplete="address-line2"
                        placeholder="Appartement, bâtiment…"
                      />
                    </label>
                  </div>
                  <label>
                    Adresse
                    <input
                      required
                      name="line1"
                      autoComplete="street-address"
                      placeholder="Numéro et rue"
                    />
                  </label>
                  <div className="form-two-col">
                    <label>
                      Code postal
                      <input
                        required
                        name="postalCode"
                        autoComplete="postal-code"
                        placeholder="75000"
                      />
                    </label>
                    <label>
                      Ville
                      <input
                        required
                        name="city"
                        autoComplete="address-level2"
                        placeholder="Paris"
                      />
                    </label>
                  </div>
                  <label className="checkbox-line">
                    <input type="checkbox" required /> Je confirme que les informations de livraison
                    sont exactes.
                  </label>
                  <button className="dark-button full-button" type="submit">
                    Enregistrer la commande ↗
                  </button>
                  <p className="fine-print">
                    Le paiement sécurisé sera effectué sur Stripe après validation de cette étape.
                    L’expédition ne démarre qu’après confirmation du paiement.
                  </p>
                </form>
                <aside className="order-summary">
                  <h2>Votre panier</h2>
                  {catalog
                    .filter((product) => cart[product.id])
                    .map((product) => (
                      <div className="summary-item" key={product.id}>
                        <span className={`summary-thumb ${product.color}`}>{product.icon}</span>
                        <div>
                          <strong>{product.name}</strong>
                          <p>Quantité : {cart[product.id] ?? 0}</p>
                        </div>
                        <strong>{formatCurrency(product.price * (cart[product.id] ?? 0))}</strong>
                      </div>
                    ))}
                  {cartCount === 0 && (
                    <p>Votre panier est vide. Retournez au catalogue pour ajouter des articles.</p>
                  )}
                  <div className="summary-total">
                    <span>Sous-total</span>
                    <strong>{formatCurrency(cartTotal)}</strong>
                  </div>
                  <p className="summary-note">
                    Les frais de livraison ne sont pas encore configurés pour cette boutique de
                    démonstration.
                  </p>
                </aside>
              </div>
            </>
          )}
        </section>
      )}
      {view === 'seller' && (
        <>
          <div className="seller-range-control">
            <label>
              Période{' '}
              <select value={sellerRange} onChange={(event) => setSellerRange(event.target.value)}>
                <option value="7">7 jours</option>
                <option value="30">30 jours</option>
                <option value="90">90 jours</option>
              </select>
            </label>
          </div>
          <SellerWorkspace range={sellerRange} />
        </>
      )}
      {view === 'legal' && <LegalPage page={legalPage} onBack={() => setView('shop')} />}
      {view === 'reset' && (
        <ResetPassword
          onDone={() => {
            window.history.replaceState({}, '', '/');
            setView('account');
          }}
        />
      )}
      <footer className="store-footer">
        <a
          className="store-brand"
          href="#home"
          onClick={(event) => {
            event.preventDefault();
            setView('shop');
          }}
        >
          <span className="store-brand-icon">a.</span>
          <span>
            atelier<span className="brand-period">.</span>
          </span>
        </a>
        <p>Des essentiels pour votre quotidien.</p>
        <div className="footer-links">
          <button onClick={() => setView('account')}>Mon compte</button>
          <button onClick={() => setNotice('Le centre d’aide sera bientôt disponible.')}>
            Aide & contact
          </button>
          <button
            onClick={() => {
              setLegalPage('terms');
              setView('legal');
            }}
          >
            Conditions générales de vente
          </button>
          <button
            onClick={() => {
              setLegalPage('privacy');
              setView('legal');
            }}
          >
            Confidentialité
          </button>
          <button
            onClick={() => {
              setLegalPage('returns');
              setView('legal');
            }}
          >
            Retours et remboursements
          </button>
        </div>
        <span className="copyright">© 2026 atelier. · Démonstration</span>
      </footer>
      {view !== 'seller' && (
        <button className="seller-entry" onClick={openSeller}>
          <span>▦</span> Espace vendeur
        </button>
      )}
      {view === 'seller' && (
        <button className="seller-exit" onClick={() => setView('shop')}>
          ← Retour à la boutique
        </button>
      )}
      {cartOpen && (
        <div className="drawer-backdrop">
          <button
            type="button"
            className="drawer-dismiss"
            aria-label="Fermer le panier"
            onClick={() => setCartOpen(false)}
          />
          <aside className="cart-drawer" aria-label="Votre panier">
            <div className="drawer-heading">
              <div>
                <span className="eyebrow">VOTRE SÉLECTION</span>
                <h2>
                  Mon panier <span>({cartCount})</span>
                </h2>
              </div>
              <button
                className="close-drawer"
                aria-label="Fermer le panier"
                onClick={() => setCartOpen(false)}
              >
                ×
              </button>
            </div>
            {cartCount === 0 ? (
              <div className="empty-cart">
                <span>♡</span>
                <h3>Votre panier est vide</h3>
                <p>Vos prochains coups de cœur sont ici.</p>
                <button className="dark-button" onClick={() => setCartOpen(false)}>
                  Continuer mes achats
                </button>
              </div>
            ) : (
              <>
                <div className="drawer-items">
                  {catalog
                    .filter((product) => cart[product.id])
                    .map((product) => (
                      <div className="drawer-item" key={product.id}>
                        <span className={`drawer-product-icon ${product.color}`}>
                          {product.icon}
                        </span>
                        <div className="drawer-product-info">
                          <strong>{product.name}</strong>
                          <span>{formatCurrency(product.price)}</span>
                          <div className="quantity-control">
                            <button
                              aria-label={`Retirer un ${product.name}`}
                              onClick={() => changeQuantity(product.id, -1)}
                            >
                              −
                            </button>
                            <span>{cart[product.id] ?? 0}</span>
                            <button
                              aria-label={`Ajouter un ${product.name}`}
                              onClick={() => changeQuantity(product.id, 1)}
                            >
                              ＋
                            </button>
                          </div>
                        </div>
                        <strong>{formatCurrency(product.price * (cart[product.id] ?? 0))}</strong>
                      </div>
                    ))}
                </div>
                <div className="drawer-total">
                  <div>
                    <span>Sous-total</span>
                    <strong>{formatCurrency(cartTotal)}</strong>
                  </div>
                  <p>'Les frais de livraison ne sont pas encore configurés pour cette boutique.'</p>
                  <button className="dark-button full-button" onClick={() => void beginCheckout()}>
                    Passer à la commande ↗
                  </button>
                  <button className="continue-link" onClick={() => setCartOpen(false)}>
                    Continuer mes achats
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
