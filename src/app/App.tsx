import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AuthPanel } from '../features/auth/AuthPanel';
import { ResetPassword } from '../features/auth/ResetPassword';
import { SellerWorkspace } from '../features/seller/SellerWorkspace';
import { LegalPage, type LegalPageKind } from '../features/legal/LegalPage';
import { CustomerAccountData } from '../features/account/CustomerAccountData';
import { useTranslation } from '../shared/i18n';
import type { Language } from '../shared/i18n';
import { formatCurrency } from '../shared/utils/formatCurrency';
import { readStoredJson, writeStoredJson } from '../shared/utils/safeStorage';
import { apiRequest, apiSchemas } from '../shared/api/client';

function isCart(value: unknown): value is Record<string, number> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.entries(value).every(([id, quantity]) => id.length > 0 && Number.isInteger(quantity) && quantity >= 0);
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
  const { language, setLanguage } = useTranslation();
  const [view, setView] = useState<View>(() => window.location.pathname === '/reset-password' ? 'reset' : 'shop');
  const [category, setCategory] = useState<Category>('Tout');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('featured');
  const [cart, setCart] = useState<Record<string, number>>(() => readStoredJson('atelier-cart', {}, isCart));
  const [favorites, setFavorites] = useState<string[]>(() => readStoredJson('atelier-favorites', [], isFavorites));
  const [cartHydrated, setCartHydrated] = useState(false);
  const [favoritesHydrated, setFavoritesHydrated] = useState(false);
  const [catalog, setCatalog] = useState<Product[]>(products);
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [checkoutDone, setCheckoutDone] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [orderEmail, setOrderEmail] = useState('');
  const [sellerRange, setSellerRange] = useState('30');
  const [legalPage, setLegalPage] = useState<LegalPageKind>('terms');
  useEffect(() => {
    const paymentState = new URLSearchParams(window.location.search).get('payment');
    if (paymentState !== 'success' && paymentState !== 'cancelled') return;
    setView('account');
    setNotice(paymentState === 'success'
      ? 'Paiement transmis. Le statut de la commande sera confirmé après vérification du prestataire.'
      : 'Paiement annulé. Vos commandes restent disponibles dans votre compte pour réessayer.');
    window.history.replaceState({}, '', window.location.pathname);
  }, []);
  const filteredProducts = useMemo(() => {
    const result = catalog.filter(
      (product) =>
        (category === 'Tout' || product.category === category) &&
        `${product.name} ${product.category} ${product.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    if (sort === 'price-up') result.sort((a, b) => a.price - b.price);
    if (sort === 'price-down') result.sort((a, b) => b.price - a.price);
    if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return result;
  }, [catalog, category, query, sort]);
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const cartTotal = catalog.reduce(
    (sum, product) => sum + product.price * (cart[product.id] ?? 0),
    0,
  );
  useEffect(() => {
    let active = true;
    void apiRequest('/api/products', apiSchemas.products)
      .then((payload) => {
        if (!active) return;
        setCatalog(payload.products.map((item) => {
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
        }));
      })
      .catch(() => undefined);
    void apiRequest('/api/customer/cart', apiSchemas.customerCart)
      .then((payload) => {
        if (!active) return;
        const next: Record<string, number> = {};
        for (const item of payload.items) next[item.productId] = item.quantity;
        setCart((current) => ({ ...next, ...current }));
      })
      .catch(() => undefined)
      .finally(() => { if (active) setCartHydrated(true); });
    void apiRequest('/api/customer/favorites', apiSchemas.customerFavorites)
      .then((payload) => {
        if (active) setFavorites((current) => [...new Set([...payload.favorites.map((item) => item.productId), ...current])]);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setFavoritesHydrated(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!cartHydrated) return;
    writeStoredJson('atelier-cart', cart);
    void fetch('/api/customer/cart', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity })) }) }).catch(() => undefined);
  }, [cart, cartHydrated]);
  useEffect(() => {
    if (!favoritesHydrated) return;
    writeStoredJson('atelier-favorites', favorites);
  }, [favorites, favoritesHydrated]);
  useEffect(() => {
    const syncGuestData = () => {
      void fetch('/api/customer/cart', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity })) }),
      }).catch(() => undefined);
      for (const productId of favorites) {
        void fetch('/api/customer/favorites/' + productId, { method: 'POST', credentials: 'include' }).catch(() => undefined);
      }
    };
    window.addEventListener('template-auth-changed', syncGuestData);
    return () => window.removeEventListener('template-auth-changed', syncGuestData);
  }, [cart, favorites]);
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
  function toggleFavorite(id: string) {
    const productId = id;
    const isFavorite = favorites.includes(productId);
    setFavorites((current) => isFavorite ? current.filter((item) => item !== productId) : [...current, productId]);
    void fetch('/api/customer/favorites/' + productId, { method: isFavorite ? 'DELETE' : 'POST', credentials: 'include' }).catch(() => undefined);
  }
  async function beginCheckout() {
    setCartOpen(false);
    setCheckoutDone(false);
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (response.ok) {
        const payload = await response.json() as { user?: { email: string } };
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
  async function completeDemoOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setNotice('');
    try {
      const cartResponse = await fetch('/api/customer/cart', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: Object.entries(cart).map(([productId, quantity]) => ({ productId: String(productId), quantity })) }),
      });
      if (!cartResponse.ok) throw new Error('Impossible d’enregistrer le panier. Reconnectez-vous.');
      const addressResponse = await fetch('/api/customer/addresses', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'Livraison', recipient: String(form.get('recipient') ?? ''),
          line1: String(form.get('line1') ?? ''), line2: String(form.get('line2') ?? '') || null, postalCode: String(form.get('postalCode') ?? ''),
          city: String(form.get('city') ?? ''), country: 'FR', isDefault: true,
        }),
      });
      const addressPayload = await addressResponse.json() as { address?: { id: string }; error?: string };
      if (!addressResponse.ok || !addressPayload.address) throw new Error(addressPayload.error ?? 'Adresse de livraison invalide.');
      const orderResponse = await fetch('/api/customer/orders', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addressId: addressPayload.address.id }),
      });
      const orderPayload = await orderResponse.json() as { order?: { id: string }; orders?: { id: string }[]; error?: string };
      if (!orderResponse.ok || !orderPayload.order) throw new Error(orderPayload.error ?? 'Impossible d’enregistrer la commande.');
      const orderIds = orderPayload.orders?.map((order) => order.id) ?? [orderPayload.order.id];
      setCart({});
      try {
        const checkoutPayload = await apiRequest('/api/customer/checkout', apiSchemas.checkoutSession, {
          method: 'POST',
          body: JSON.stringify({ orderIds }),
        });
        window.location.assign(checkoutPayload.checkoutUrl);
      } catch (error) {
        // The order has already been persisted. Keep it visible and explain that
        // payment still needs to be completed instead of reporting order creation as failed.
        setNotice(error instanceof Error ? error.message : 'Commande enregistrée, mais paiement indisponible.');
        setCheckoutDone(true);
        setView('checkout');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Erreur pendant la validation de la commande.');
    }
  }
  return (
    <main className="store-app">
      <div className="announcement">LIVRAISON OFFERTE DÈS 80 € · DROIT DE RÉTRACTATION DE 14 JOURS</div>
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
            Nouveautés
          </button>
          <button
            className="nav-link"
            onClick={() => {
              setView('shop');
              setCategory('Vêtements');
            }}
          >
            Vêtements
          </button>
          <button
            className="nav-link"
            onClick={() => {
              setView('shop');
              setCategory('Chaussures');
            }}
          >
            Chaussures
          </button>
          <button
            className="nav-link"
            onClick={() => {
              setView('shop');
              setCategory('Accessoires');
            }}
          >
            Accessoires
          </button>
        </nav>
        <div className="header-actions">
          <div className="language-switcher" role="group" aria-label="Langue">
            {(['fr', 'en'] as const).map((option: Language) => (
              <button
                className="language-button"
                type="button"
                key={option}
                aria-pressed={language === option}
                aria-label={option === 'fr' ? 'Français' : 'English'}
                onClick={() => setLanguage(option)}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
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
        <div className="toast" role="status">
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
              <div className="category-filters" role="group" aria-label="Filtrer par catégorie">
                {(['Tout', 'Vêtements', 'Chaussures', 'Accessoires'] as const).map((item) => (
                  <button
                    key={item}
                    className={category === item ? 'filter-chip selected' : 'filter-chip'}
                    aria-pressed={category === item}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
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
              <strong>Livraison offerte</strong>
              <p>Dès 80 € d’achat en France.</p>
            </div>
            <div>
              <span>↺</span>
              <strong>Retours encadrés</strong>
              <p>Le droit de rétractation légal s’applique, sous réserve des exceptions prévues.</p>
            </div>
            <div>
              <span>♡</span>
              <strong>À votre écoute</strong>
              <p>Une équipe là pour vous aider.</p>
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
            Connectez-vous pour retrouver vos commandes, vos favoris et vos informations de
            livraison.
          </p>
          <div className="account-benefits">
            <div>
              <span>01</span>
              <strong>Vos commandes</strong>
              <p>Consultez le suivi et l’historique de vos achats.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Vos favoris</strong>
              <p>Gardez vos pièces préférées à portée de main.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Vos informations</strong>
              <p>Retrouvez vos coordonnées et adresses.</p>
            </div>
          </div>
          <AuthPanel
            language={language}
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
                Votre commande est enregistrée pour {orderEmail}. Aucun paiement n’a été effectué pour le moment.
                Si le paiement n’a pas pu être préparé, retrouvez cette commande dans votre compte pour réessayer.
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
                Votre commande sera enregistrée avant l’ouverture du paiement sécurisé Stripe. L’expédition ne démarre qu’après confirmation du paiement.
              </p>
              <div className="checkout-layout">
                <form className="checkout-form" onSubmit={completeDemoOrder}>
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
                      <input required name="recipient" autoComplete="name" placeholder="Prénom et nom du destinataire" />
                    </label>
                    <label>
                      Complément d’adresse (facultatif)
                      <input name="line2" autoComplete="address-line2" placeholder="Appartement, bâtiment…" />
                    </label>
                  </div>
                  <label>
                    Adresse
                    <input required name="line1" autoComplete="street-address" placeholder="Numéro et rue" />
                  </label>
                  <div className="form-two-col">
                    <label>
                      Code postal
                      <input required name="postalCode" autoComplete="postal-code" placeholder="75000" />
                    </label>
                    <label>
                      Ville
                      <input required name="city" autoComplete="address-level2" placeholder="Paris" />
                    </label>
                  </div>
                  <label className="checkbox-line">
                    <input type="checkbox" required /> Je confirme les informations saisies pour
                    cette démonstration.
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
                    Les frais de livraison ne sont pas encore calculés automatiquement.
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
            <label>Période <select value={sellerRange} onChange={(event) => setSellerRange(event.target.value)}><option value="7">7 jours</option><option value="30">30 jours</option><option value="90">90 jours</option></select></label>
          </div>
          <SellerWorkspace range={sellerRange} />
        </>
      )}
      {view === 'legal' && <LegalPage page={legalPage} onBack={() => setView('shop')} />}
      {view === 'reset' && <ResetPassword onDone={() => { window.history.replaceState({}, '', '/'); setView('account'); }} />}
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
          <button onClick={() => { setLegalPage('terms'); setView('legal'); }}>Conditions générales de vente</button>
          <button onClick={() => { setLegalPage('privacy'); setView('legal'); }}>Confidentialité</button>
          <button onClick={() => { setLegalPage('returns'); setView('legal'); }}>Retours et remboursements</button>
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
        <div className="drawer-backdrop" onClick={() => setCartOpen(false)}>
          <aside
            className="cart-drawer"
            aria-label="Votre panier"
            onClick={(event) => event.stopPropagation()}
          >
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
                  <p>
                    {cartTotal >= 80
                      ? 'La livraison est offerte !'
                      : `Plus que ${formatCurrency(80 - cartTotal)} pour la livraison offerte.`}
                  </p>
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
