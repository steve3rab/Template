import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AuthPanel } from '../features/auth/AuthPanel';
import { ResetPassword } from '../features/auth/ResetPassword';
import { SellerWorkspace } from '../features/seller/SellerWorkspace';
import { AdminWorkspace } from '../features/admin/AdminWorkspace';
import { LegalPage, type LegalPageKind } from '../features/legal/LegalPage';
import { CustomerAccountData } from '../features/account/CustomerAccountData';
import { formatCurrency } from '../shared/utils/formatCurrency';
import { readStoredJson, writeStoredJson } from '../shared/utils/safeStorage';
import { apiRequest, apiSchemas, type CustomerAddress } from '../shared/api/client';
import { PRODUCT_CATEGORIES } from '../shared/categories';

function imageForCategory(category: string): string {
  switch (category) {
    case 'Chaussures':
      return 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85';
    case 'Accessoires':
      return 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=85';
    case 'Maison':
      return 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=85';
    default:
      return 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=85';
  }
}

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

type Category = 'Tout' | (typeof PRODUCT_CATEGORIES)[number];
type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  oldPrice?: number;
  color: string;
  icon: string;
  image: string;
  tag?: string;
  description: string;
  sizes?: string[];
  dimensions?: string;
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
    image:
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=85',
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
    image:
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85',
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
    image:
      'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=85',
    description: 'Un sac compact et pratique pour garder l’essentiel à portée de main.',
  },
  {
    id: '4',
    name: 'Pull Essentiel',
    category: 'Vêtements',
    price: 65,
    color: 'lavender',
    icon: '🧶',
    image:
      'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=85',
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
    image:
      'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=85',
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
    image:
      'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=900&q=85',
    description: 'Des lignes sobres qui s’accordent avec toutes vos tenues.',
  },
  {
    id: '7',
    name: 'Chemise Relax',
    category: 'Vêtements',
    price: 48,
    color: 'blue',
    icon: '👔',
    image:
      'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=85',
    description: 'Une chemise légère pensée pour les superpositions.',
  },
  {
    id: '8',
    name: 'Casquette Club',
    category: 'Accessoires',
    price: 25,
    color: 'sand',
    icon: '🧢',
    image:
      'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=900&q=85',
    tag: 'ESSENTIEL',
    description: 'La finition simple qui change un look.',
  },
];
type View = 'shop' | 'account' | 'seller' | 'admin' | 'checkout' | 'legal' | 'reset';

export function App() {
  const [language, setLanguage] = useState<'fr' | 'en'>(() =>
    window.localStorage.getItem('template-react-language') === 'en' ? 'en' : 'fr',
  );
  const translate = useCallback(
    (fr: string, en: string) => (language === 'en' ? en : fr),
    [language],
  );
  const formatPrice = (amount: number) =>
    formatCurrency(amount, 'EUR', language === 'en' ? 'en-GB' : 'fr-FR');
  const productTag = (tag: string) => {
    if (language === 'fr') return tag;
    const labels: Record<string, string> = {
      NOUVEAU: 'NEW',
      ESSENTIEL: 'ESSENTIAL',
      'BEST-SELLER': 'BESTSELLER',
    };
    return labels[tag] ?? tag;
  };
  const productDescription = (product: Product) => {
    if (language === 'fr') return product.description;
    const demoDescriptions: Record<string, string> = {
      'Veste Studio': 'A structured cut, easy to wear from morning to evening.',
      'Sneakers Everyday': 'Everyday comfort with a minimalist silhouette.',
      'Sac Épure': 'A compact, practical bag to keep your essentials close at hand.',
      'Pull Essentiel': 'Soft knitwear with a relaxed fit.',
      'Lunettes Soleil': 'A graphic touch for sunny days.',
      'Baskets City': 'Clean lines that work with every outfit.',
      'Chemise Relax': 'A lightweight shirt designed for layering.',
      'Casquette Club': 'A simple finishing touch that transforms a look.',
    };
    return demoDescriptions[product.name] ?? product.description;
  };
  const categoryLabel = (category: string) => {
    if (language === 'fr') return category;
    const labels: Record<string, string> = {
      Vêtements: 'Clothing',
      Chaussures: 'Shoes',
      Accessoires: 'Accessories',
      Maison: 'Home',
      Tout: 'All',
    };
    return labels[category] ?? category;
  };
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
  const checkoutPendingRef = useRef(false);
  const favoriteRequests = useRef(new Set<string>());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentRole, setCurrentRole] = useState('');
  const [catalog, setCatalog] = useState<Product[]>(products);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [toastKind, setToastKind] = useState<'info' | 'success' | 'error'>('info');
  const [notice, setNotice] = useState(() => {
    if (paymentState === 'success') {
      return translate(
        'Paiement transmis. Le statut de la commande sera confirmé après vérification du prestataire.',
        'Payment submitted. The order status will be confirmed after verification by the payment provider.',
      );
    }
    if (paymentState === 'cancelled') {
      return translate(
        'Paiement annulé. Vos commandes restent disponibles dans votre compte pour réessayer.',
        'Payment cancelled. Your orders remain available in your account so you can try again.',
      );
    }
    return '';
  });
  const [checkoutDone, setCheckoutDone] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [orderEmail, setOrderEmail] = useState('');
  const [checkoutAddresses, setCheckoutAddresses] = useState<CustomerAddress[]>([]);
  const [checkoutAddressId, setCheckoutAddressId] = useState('');
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutStarting, setCheckoutStarting] = useState(false);
  const checkoutStartRef = useRef(false);
  const checkoutSubmitRef = useRef(false);
  const [sellerRange, setSellerRange] = useState('30');
  const [legalPage, setLegalPage] = useState<LegalPageKind>('terms');
  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem('template-react-language', language);
  }, [language]);
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
      const checkoutInProgress = checkoutPendingRef.current;
      const preserveCheckoutCart = checkoutInProgress;
      setCartHydrated(authenticated && preserveCheckoutCart);
      setIsAuthenticated(authenticated);
      setCurrentRole(typeof event.detail?.role === 'string' ? event.detail.role : '');
      if (!authenticated && !preserveCheckoutCart) {
        // Never carry a previous account's private cart/favorites into a guest or another account.
        setCart({});
        setFavorites([]);
        setCheckoutDone(false);
      }
    };
    window.addEventListener('template-auth-changed', onAuthChanged);
    return () => window.removeEventListener('template-auth-changed', onAuthChanged);
  }, []);
  const loadCatalog = useCallback(
    async (showProgress = true) => {
      if (showProgress) {
        setCatalogLoading(true);
        setCatalogFailed(false);
      }
      try {
        const payload = await apiRequest('/api/products', apiSchemas.products);
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
              icon: fallback?.icon ?? '🛍️',
              image: (() => {
                try {
                  const storedImages = item.imageUrls
                    ? (JSON.parse(item.imageUrls) as unknown)
                    : [];
                  return Array.isArray(storedImages) && typeof storedImages[0] === 'string'
                    ? storedImages[0]
                    : (item.imageUrl ?? fallback?.image ?? imageForCategory(item.category));
                } catch {
                  return item.imageUrl ?? fallback?.image ?? imageForCategory(item.category);
                }
              })(),
              ...(item.sizes
                ? {
                    sizes: (() => {
                      try {
                        const parsed: unknown = JSON.parse(item.sizes);
                        return Array.isArray(parsed)
                          ? parsed.filter((value): value is string => typeof value === 'string')
                          : [];
                      } catch {
                        return [];
                      }
                    })(),
                  }
                : {}),
              ...(item.dimensions ? { dimensions: item.dimensions } : {}),
              ...(fallback?.oldPrice !== undefined ? { oldPrice: fallback.oldPrice } : {}),
              ...(fallback?.tag !== undefined ? { tag: fallback.tag } : {}),
            };
          }),
        );
        setCatalogFailed(false);
      } catch {
        setCatalog([]);
        setCatalogFailed(true);
        setToastKind('error');
        setNotice(
          translate(
            'Impossible de charger le catalogue. Vérifiez votre connexion puis réessayez.',
            'Unable to load the catalogue. Check your connection and try again.',
          ),
        );
      } finally {
        setCatalogLoading(false);
      }
    },
    [translate],
  );

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadCatalog(false);
    });
    return () => {
      active = false;
    };
  }, [loadCatalog]);

  useEffect(() => {
    let active = true;
    // Resolve authentication only from explicit session outcomes. A 5xx/network
    // failure must not be interpreted as logout or overwrite a valid client state.
    void fetch('/api/auth/me', { credentials: 'include', signal: AbortSignal.timeout(15000) })
      .then(async (response) => {
        if (!active) return;
        if (response.ok) {
          setIsAuthenticated(true);
          window.dispatchEvent(
            new CustomEvent('template-auth-changed', {
              detail: {
                authenticated: true,
                role:
                  ((await response.clone().json()) as { user?: { role?: string } }).user?.role ??
                  '',
              },
            }),
          );
          return;
        }
        if (response.status === 401) {
          setIsAuthenticated(false);
          setCurrentRole('');
          window.dispatchEvent(
            new CustomEvent('template-auth-changed', { detail: { authenticated: false } }),
          );
          return;
        }
        setToastKind('error');
        setNotice(
          translate(
            'Impossible de vérifier votre session. Réessayez sans vous déconnecter.',
            'Unable to verify your session. Please try again without signing out.',
          ),
        );
      })
      .catch(() => {
        if (!active) return;
        setToastKind('error');
        setNotice(
          translate(
            'Impossible de vérifier votre session. Vérifiez votre connexion puis réessayez.',
            'Unable to verify your session. Check your connection and try again.',
          ),
        );
      });
    return () => {
      active = false;
    };
  }, [translate]);
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
          throw new Error(
            translate(
              'Impossible de synchroniser le panier avec votre compte.',
              'Unable to sync your cart with your account.',
            ),
          );
      })
      .catch(() => {
        if (epoch === authEpoch.current && version === cartSyncVersion.current) {
          setToastKind('error');
          setNotice(
            translate(
              'Le panier n’a pas pu être synchronisé. Vérifiez votre connexion puis réessayez.',
              'Your cart could not be synced. Check your connection and try again.',
            ),
          );
        }
      });
  }, [cart, isAuthenticated, cartHydrated, translate]);
  useEffect(() => {
    writeStoredJson('atelier-favorites', favorites);
  }, [favorites]);
  useEffect(() => {
    if (!isAuthenticated || checkoutPendingRef.current) return;
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
          translate(
            'Impossible de charger les données de votre compte. Vos modifications ne seront pas synchronisées tant que la connexion ne sera pas rétablie.',
            'Unable to load your account data. Your changes will not sync until the connection is restored.',
          ),
        );
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, translate]);
  async function openSeller() {
    try {
      const response = await fetch('/api/seller/me', { credentials: 'include' });
      if (!response.ok) {
        setNotice(
          response.status === 401
            ? translate(
                'Connectez-vous avec un compte vendeur autorisé pour accéder à cet espace.',
                'Sign in with an authorized seller account to access this area.',
              )
            : translate(
                'Accès refusé : cet espace est réservé aux comptes vendeurs autorisés.',
                'Access denied: this area is restricted to authorized seller accounts.',
              ),
        );
        if (response.status === 401) setView('account');
        return;
      }
      setView('seller');
    } catch {
      setNotice(
        translate(
          "Impossible de vérifier vos droits d'accès. Réessayez dans un instant.",
          'Unable to verify your access permissions. Please try again shortly.',
        ),
      );
    }
  }
  async function openAdmin() {
    try {
      const response = await fetch('/api/admin/me', { credentials: 'include' });
      if (!response.ok) {
        setNotice(
          response.status === 401
            ? translate(
                'Connectez-vous avec un compte administrateur pour accéder à cet espace.',
                'Sign in with an administrator account to access this area.',
              )
            : translate(
                'Accès refusé : cette zone est réservée aux administrateurs.',
                'Access denied: this area is restricted to administrators.',
              ),
        );
        if (response.status === 401) setView('account');
        return;
      }
      setView('admin');
    } catch {
      setNotice(
        translate(
          "Impossible de vérifier vos droits d'administration. Réessayez.",
          'Unable to verify your administrator permissions. Please try again.',
        ),
      );
    }
  }

  function addToCart(product: Product) {
    setCart((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
    setNotice(
      language === 'en' ? `${product.name} added to cart` : `${product.name} ajouté au panier`,
    );
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
            ? translate(
                'Votre session a expiré. Reconnectez-vous pour modifier vos favoris.',
                'Your session has expired. Sign in again to update your favourites.',
              )
            : translate(
                'Impossible de mettre à jour vos favoris. Réessayez.',
                'Unable to update your favourites. Please try again.',
              ),
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
        error instanceof Error
          ? error.message
          : translate(
              'Impossible de mettre à jour vos favoris.',
              'Unable to update your favourites.',
            ),
      );
    } finally {
      favoriteRequests.current.delete(productId);
    }
  }
  async function beginCheckout() {
    if (checkoutStartRef.current) return;
    checkoutStartRef.current = true;
    setCheckoutStarting(true);
    setCheckoutDone(false);
    checkoutPendingRef.current = false;
    try {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
          signal: AbortSignal.timeout(15000),
        });
        if (response.ok) {
        const payload = (await response.json()) as { user?: { email: string } };
        setOrderEmail(payload.user?.email ?? '');
        try {
          const addressPayload = await apiRequest(
            '/api/customer/addresses',
            apiSchemas.customerAddresses,
          );
          setCheckoutAddresses(addressPayload.addresses);
          setCheckoutAddressId(
            addressPayload.addresses.find((address) => address.isDefault)?.id ??
              addressPayload.addresses[0]?.id ??
              '',
          );
        } catch {
          setCheckoutAddresses([]);
          setCheckoutAddressId('');
          setToastKind('error');
          setNotice(
            translate(
              'Impossible de charger vos adresses enregistrées. Vous pouvez saisir une nouvelle adresse.',
              'Unable to load your saved addresses. You can enter a new address.',
            ),
          );
        }
          setCartOpen(false);
          setCheckoutPending(false);
          setView('checkout');
          return;
        }
      } catch {
        // Continue to account sign-in if the session cannot be verified.
      }
      setCartOpen(false);
      checkoutPendingRef.current = true;
      setCheckoutPending(true);
      setView('account');
      setNotice(
        translate(
          'Connectez-vous ou créez un compte pour finaliser votre commande.',
          'Sign in or create an account to complete your order.',
        ),
      );
    } finally {
      checkoutStartRef.current = false;
      setCheckoutStarting(false);
    }
  }
  async function completeCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checkoutSubmitRef.current) return;
    checkoutSubmitRef.current = true;
    setCheckoutSubmitting(true);
    const form = new FormData(event.currentTarget);
    const selectedAddress = checkoutAddresses.find((address) => address.id === checkoutAddressId);
    const addressValues = {
      recipient: String(form.get('recipient') ?? '').trim(),
      line1: String(form.get('line1') ?? '').trim(),
      line2: String(form.get('line2') ?? '').trim(),
      postalCode: String(form.get('postalCode') ?? '').trim(),
      city: String(form.get('city') ?? '').trim(),
    };
    if (
      !selectedAddress &&
      (addressValues.recipient.length < 2 ||
        addressValues.line1.length < 3 ||
        addressValues.postalCode.length < 2 ||
        addressValues.city.length < 2)
    ) {
      setNotice(
        translate(
          'Vérifiez le destinataire et l’adresse : chaque champ obligatoire doit être correctement renseigné.',
          'Check the recipient and address: every required field must be completed correctly.',
        ),
      );
      setCheckoutSubmitting(false);
      checkoutSubmitRef.current = false;
      return;
    }
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
        throw new Error(
          translate(
            'Impossible d’enregistrer le panier. Reconnectez-vous.',
            'Unable to save your cart. Please sign in again.',
          ),
        );
      let addressId = selectedAddress?.id ?? '';
      if (!selectedAddress) {
        const addressResponse = await fetch('/api/customer/addresses', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: 'Livraison',
            recipient: addressValues.recipient,
            line1: addressValues.line1,
            line2: addressValues.line2 || null,
            postalCode: addressValues.postalCode,
            city: addressValues.city,
            country: 'FR',
            isDefault: checkoutAddresses.length === 0,
          }),
        });
        const addressPayload = (await addressResponse.json()) as {
          address?: { id: string };
          error?: string;
        };
        if (!addressResponse.ok || !addressPayload.address)
          throw new Error(
            addressPayload.error ??
              translate('Adresse de livraison invalide.', 'Invalid delivery address.'),
          );
        addressId = addressPayload.address.id;
      }
      const orderResponse = await fetch('/api/customer/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addressId }),
      });
      const orderPayload = (await orderResponse.json()) as {
        order?: { id: string };
        orders?: { id: string }[];
        error?: string;
      };
      if (!orderResponse.ok || !orderPayload.order)
        throw new Error(
          orderPayload.error ??
            translate('Impossible d’enregistrer la commande.', 'Unable to save the order.'),
        );
      const orderIds = orderPayload.orders?.map((order) => order.id) ?? [orderPayload.order.id];
      setCart({});
      checkoutPendingRef.current = false;
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
            : translate(
                'Commande enregistrée, mais paiement indisponible.',
                'Order saved, but payment is unavailable.',
              ),
        );
        setCheckoutDone(true);
        setView('checkout');
        setCheckoutSubmitting(false);
        checkoutSubmitRef.current = false;
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : translate(
              'Erreur pendant la validation de la commande.',
              'An error occurred while validating the order.',
            ),
      );
      setCheckoutSubmitting(false);
      checkoutSubmitRef.current = false;
    }
  }
  return (
    <main className="store-app">
      <div className="announcement">
        {translate(
          'SÉLECTION ATELIER · PAIEMENT EN LIGNE · CONDITIONS DE RETOUR EN PIED DE PAGE',
          'ATELIER SELECTION · ONLINE PAYMENT · RETURNS POLICY IN THE FOOTER',
        )}
      </div>
      <header className="store-header">
        <a
          className="store-brand"
          href="#home"
          onClick={(event) => {
            event.preventDefault();
            setView('shop');
          }}
          aria-label={translate('Atelier, accueil', 'Atelier, home')}
        >
          <span className="store-brand-icon">a.</span>
          <span>
            atelier<span className="brand-period">.</span>
          </span>
        </a>
        <nav
          className="main-nav"
          aria-label={translate('Navigation principale', 'Main navigation')}
        >
          <button
            type="button"
            className={view === 'shop' && category === 'Tout' ? 'nav-link active' : 'nav-link'}
            aria-current={view === 'shop' && category === 'Tout' ? 'page' : undefined}
            onClick={() => {
              setView('shop');
              setCategory('Tout');
            }}
          >
            {translate('Collection', 'Collection')}
          </button>
          {PRODUCT_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              className={view === 'shop' && category === item ? 'nav-link active' : 'nav-link'}
              aria-current={view === 'shop' && category === item ? 'page' : undefined}
              onClick={() => {
                setView('shop');
                setCategory(item);
              }}
            >
              {categoryLabel(item)}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <div
            className="language-switcher"
            role="group"
            aria-label={translate('Choisir la langue', 'Choose language')}
          >
            <button
              className="language-button"
              type="button"
              aria-label="Français"
              aria-pressed={language === 'fr'}
              onClick={() => setLanguage('fr')}
            >
              FR
            </button>
            <button
              className="language-button"
              type="button"
              aria-label="English"
              aria-pressed={language === 'en'}
              onClick={() => setLanguage('en')}
            >
              EN
            </button>
          </div>
          <button
            className="icon-button"
            aria-label={translate('Compte client', 'Customer account')}
            onClick={() => setView('account')}
          >
            ♙
          </button>
          <button
            className="cart-button"
            onClick={() => setCartOpen((open) => !open)}
            aria-label={translate(`Panier, ${cartCount} article(s)`, `Cart, ${cartCount} item(s)`)}
          >
            {translate('Panier', 'Cart')} <span className="cart-count">{cartCount}</span>
          </button>
        </div>
      </header>
      {notice && (
        <div
          className={`toast toast-${toastKind}`}
          role={toastKind === 'error' ? 'alert' : 'status'}
        >
          {notice}
          <button
            aria-label={translate('Fermer le message', 'Dismiss message')}
            onClick={() => setNotice('')}
          >
            ×
          </button>
        </div>
      )}
      {view === 'shop' && (
        <>
          <section className="hero-banner" aria-labelledby="hero-title">
            <div className="hero-copy">
              <span className="eyebrow">
                {translate('LA SÉLECTION DE LA SAISON', 'THIS SEASON’S EDIT')}
              </span>
              <h1
                id="hero-title"
                aria-label={translate('Le style, en toute simplicité.', 'Effortless style.')}
              >
                {translate('Le style, en', 'Effortless')}
                <br />
                <em>{translate('toute simplicité.', 'by design.')}</em>
              </h1>
              <p>
                {translate(
                  'Des essentiels bien pensés, des pièces faciles à vivre. Découvrez une sélection qui vous ressemble.',
                  'Thoughtful essentials and easy-to-wear pieces. Discover a collection that feels like you.',
                )}
              </p>
              <button
                className="dark-button"
                onClick={() => {
                  setCategory('Tout');
                  document.getElementById('catalogue')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {translate('Découvrir la collection', 'Discover the collection')} <span>↗</span>
              </button>
              <div className="hero-note">
                <span className="note-star">✳</span>
                <span>
                  {translate('Une mode à porter et à reporter.', 'Style to wear, and wear again.')}
                </span>
              </div>
            </div>
            <div
              className="hero-art"
              aria-label={translate(
                'Sélection mode de la nouvelle collection',
                'Fashion selection from the new collection',
              )}
            >
              <img
                className="hero-photo"
                src="https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=1400&q=90"
                alt={translate(
                  'Silhouette en tenue contemporaine dans des tons neutres',
                  'Model wearing a contemporary outfit in neutral tones',
                )}
                loading="eager"
                decoding="async"
              />
              <div className="hero-shape shape-one" />
              <div className="hero-shape shape-two" />
              <div className="hero-sticker">
                {translate('NOUVELLE', 'NEW')}
                <br />
                {translate('COLLECTION', 'COLLECTION')} <span>✳</span>
              </div>
              <div className="hero-caption">
                {translate('LES PETITS DÉTAILS', 'THE LITTLE DETAILS')}
                <br />
                {translate('FONT LE STYLE.', 'MAKE THE STYLE.')}
              </div>
            </div>
          </section>
          <section className="catalogue-section" id="catalogue">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate('À VOUS DE CHOISIR', 'YOUR EDIT')}</span>
                <h2>
                  {translate('Les pièces du moment', 'The latest pieces')}
                  <span className="brand-period">.</span>
                </h2>
                <p>
                  {translate(
                    'Des favoris à adopter sans hésiter.',
                    'New favourites to make your own.',
                  )}
                </p>
              </div>
              <span className="product-count">
                {filteredProducts.length} {translate('articles', 'items')}
              </span>
            </div>
            <div className="catalogue-toolbar">
              <div className="catalogue-tools">
                <label className="search-box">
                  <span aria-hidden="true">⌕</span>
                  <input
                    aria-label={translate('Rechercher un produit', 'Search products')}
                    placeholder={translate('Rechercher...', 'Search...')}
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
                  <span aria-hidden="true">{favoritesOnly ? '♥' : '♡'}</span>{' '}
                  {translate('Favoris', 'Favourites')}
                </button>
                <label className="sort-label">
                  <span className="visually-hidden">
                    {translate('Trier les produits', 'Sort products')}
                  </span>
                  <select value={sort} onChange={(event) => setSort(event.target.value)}>
                    <option value="featured">{translate('À la une', 'Featured')}</option>
                    <option value="price-up">
                      {translate('Prix croissant', 'Price: low to high')}
                    </option>
                    <option value="price-down">
                      {translate('Prix décroissant', 'Price: high to low')}
                    </option>
                    <option value="name">{translate('Nom A–Z', 'Name A–Z')}</option>
                  </select>
                </label>
              </div>
            </div>
            {catalogLoading && (
              <p className="workspace-loading" role="status" aria-live="polite" aria-busy="true">
                {translate('Chargement du catalogue…', 'Loading catalogue…')}
              </p>
            )}
            {catalogFailed && (
              <div className="workspace-error" role="alert">
                <p>
                  {translate(
                    'Le catalogue n’a pas pu être chargé. Les produits affichés ne sont pas disponibles.',
                    'The catalogue could not be loaded. Products are temporarily unavailable.',
                  )}
                </p>
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => void loadCatalog()}
                  disabled={catalogLoading}
                >
                  {translate('Réessayer', 'Try again')}
                </button>
              </div>
            )}
            <div className="product-grid" aria-busy={catalogLoading}>
              {filteredProducts.map((product, index) => (
                <article className="product-card" key={product.id}>
                  <div className={`product-visual ${product.color}`}>
                    {product.tag && <span className="product-tag">{productTag(product.tag)}</span>}
                    <button
                      className={
                        favorites.includes(product.id)
                          ? 'favorite-button favorited'
                          : 'favorite-button'
                      }
                      aria-label={
                        favorites.includes(product.id)
                          ? translate(
                              `Retirer ${product.name} des favoris`,
                              `Remove ${product.name} from favourites`,
                            )
                          : translate(
                              `Ajouter ${product.name} aux favoris`,
                              `Add ${product.name} to favourites`,
                            )
                      }
                      aria-pressed={favorites.includes(product.id)}
                      onClick={() => toggleFavorite(product.id)}
                    >
                      {favorites.includes(product.id) ? '♥' : '♡'}
                    </button>
                    <span className={`product-emoji product-emoji-${index % 4}`} aria-hidden="true">
                      {product.icon}
                    </span>
                    <img
                      className="product-photo"
                      src={product.image}
                      alt={product.name}
                      loading={index < 4 ? 'eager' : 'lazy'}
                      decoding="async"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                    <span className="visual-label">
                      {categoryLabel(product.category).toUpperCase()}
                    </span>
                    <button className="quick-add" onClick={() => addToCart(product)}>
                      {translate('Ajouter au panier', 'Add to cart')} <span>＋</span>
                    </button>
                  </div>
                  <div className="product-meta">
                    <div>
                      <h3>{product.name}</h3>
                      <p>{categoryLabel(product.category)}</p>
                    </div>
                    <div className="product-price">
                      {product.oldPrice && <del>{formatPrice(product.oldPrice)}</del>}
                      <strong>{formatPrice(product.price)}</strong>
                    </div>
                  </div>
                  <p className="product-description">{productDescription(product)}</p>
                  {product.sizes && product.sizes.length > 0 && (
                    <p className="product-variants">
                      {translate('Tailles :', 'Sizes:')} {product.sizes.join(', ')}
                    </p>
                  )}
                  {product.dimensions && (
                    <p className="product-variants">
                      {translate('Dimensions :', 'Dimensions:')}{' '}
                      {(() => {
                        try {
                          const value = JSON.parse(product.dimensions) as {
                            length?: number;
                            width?: number;
                            height?: number;
                            unit?: string;
                          };
                          return (
                            [
                              value.length ? `L ${value.length}` : '',
                              value.width ? `l ${value.width}` : '',
                              value.height ? `H ${value.height}` : '',
                            ]
                              .filter(Boolean)
                              .join(' × ') + (value.unit ? ` ${value.unit}` : '')
                          );
                        } catch {
                          return '';
                        }
                      })()}
                    </p>
                  )}
                </article>
              ))}
            </div>
            {!catalogLoading && !catalogFailed && filteredProducts.length === 0 && (
              <div className="empty-state">
                <span>⌕</span>
                <h3>
                  {catalog.length === 0
                    ? translate(
                        'Aucun produit disponible pour le moment',
                        'No products available yet',
                      )
                    : translate('Aucun article trouvé', 'No items found')}
                </h3>
                <p>
                  {catalog.length === 0
                    ? translate(
                        'La boutique ne propose pas encore de produit. Revenez bientôt.',
                        'The shop has no products yet. Please check back soon.',
                      )
                    : translate(
                        'Essayez une autre recherche ou une autre catégorie.',
                        'Try another search or category.',
                      )}
                </p>
                {catalog.length > 0 && (
                  <button
                    className="outline-button"
                    onClick={() => {
                      setQuery('');
                      setCategory('Tout');
                      setFavoritesOnly(false);
                    }}
                  >
                    {translate('Réinitialiser les filtres', 'Reset filters')}
                  </button>
                )}
              </div>
            )}
          </section>
          <section className="benefits-strip">
            <div>
              <span>✳</span>
              <strong>{translate('Des essentiels durables', 'Timeless essentials')}</strong>
              <p>{translate('Des pièces pensées pour durer.', 'Pieces designed to last.')}</p>
            </div>
            <div>
              <span>↗</span>
              <strong>{translate('Paiement en ligne', 'Online payment')}</strong>
              <p>
                {translate(
                  'Le paiement est traité via Stripe lorsque le service est configuré.',
                  'Payments are processed through Stripe once the service is configured.',
                )}
              </p>
            </div>
            <div>
              <span>↺</span>
              <strong>{translate('Informations de retour', 'Returns information')}</strong>
              <p>
                {translate(
                  'Consultez les conditions applicables avant toute commande.',
                  'Review the applicable terms before placing an order.',
                )}
              </p>
            </div>
            <div>
              <span>♡</span>
              <strong>{translate('Informations utiles', 'Useful information')}</strong>
              <p>
                {translate(
                  'Conditions de vente et confidentialité accessibles en pied de page.',
                  'Sales terms and privacy information are available in the footer.',
                )}
              </p>
            </div>
          </section>
        </>
      )}
      {view === 'account' && (
        <section className="workspace-page">
          <button
            className="back-link"
            onClick={() => {
              checkoutPendingRef.current = false;
              setCheckoutPending(false);
              setView('shop');
            }}
          >
            {translate('← Retour à la boutique', '← Back to shop')}
          </button>
          <span className="eyebrow">{translate('VOTRE ESPACE PERSONNEL', 'YOUR ACCOUNT')}</span>
          <h1 className="workspace-title">
            {translate('Bonjour, bienvenue', 'Hello, welcome')}
            <span className="brand-period">.</span>
          </h1>
          <p className="workspace-intro">
            {translate(
              'Connectez-vous pour retrouver vos commandes et gérer vos informations de livraison.',
              'Sign in to view your orders and manage your delivery details.',
            )}
          </p>
          <div className="account-benefits">
            <div>
              <span>01</span>
              <strong>{translate('Vos commandes', 'Your orders')}</strong>
              <p>
                {translate(
                  'Consultez le suivi et l’historique de vos achats.',
                  'Track your orders and view your purchase history.',
                )}
              </p>
            </div>
            <div>
              <span>02</span>
              <strong>{translate('Vos adresses', 'Your addresses')}</strong>
              <p>
                {translate(
                  'Ajoutez ou supprimez vos adresses de livraison.',
                  'Add or remove your delivery addresses.',
                )}
              </p>
            </div>
            <div>
              <span>03</span>
              <strong>{translate('Votre compte', 'Your account')}</strong>
              <p>
                {translate(
                  'Gérez votre connexion et vos informations personnelles.',
                  'Manage your sign-in and personal information.',
                )}
              </p>
            </div>
          </div>
          <AuthPanel
            language={language}
            initialMode={checkoutPending ? 'login' : 'register'}
            onAuthenticated={async (user) => {
              setOrderEmail(user.email);
              if (checkoutPending) {
                try {
                  const addressPayload = await apiRequest(
                    '/api/customer/addresses',
                    apiSchemas.customerAddresses,
                  );
                  setCheckoutAddresses(addressPayload.addresses);
                  setCheckoutAddressId(
                    addressPayload.addresses.find((address) => address.isDefault)?.id ??
                      addressPayload.addresses[0]?.id ??
                      '',
                  );
                } catch {
                  setCheckoutAddresses([]);
                  setCheckoutAddressId('');
                  setToastKind('error');
                  setNotice(
                    translate(
                      'Impossible de charger vos adresses enregistrées. Vous pouvez saisir une nouvelle adresse.',
                      'Unable to load your saved addresses. You can enter a new address.',
                    ),
                  );
                }
                setCheckoutPending(false);
                setView('checkout');
              }
            }}
          />
          <CustomerAccountData language={language} />
          <p className="fine-print">
            {translate(
              'Retrouvez vos commandes et vos adresses depuis votre espace client.',
              'View your orders and addresses from your customer account.',
            )}
          </p>
        </section>
      )}
      {view === 'checkout' && (
        <section className="workspace-page checkout-page">
          <button
            className="back-link"
            onClick={() => {
              checkoutPendingRef.current = false;
              setCheckoutPending(false);
              setView('shop');
            }}
          >
            ← Continuer mes achats
          </button>
          {checkoutDone ? (
            <div className="success-panel">
              <span className="success-icon">✓</span>
              <span className="eyebrow">{translate('COMMANDE ENREGISTRÉE', 'ORDER SAVED')}</span>
              <h1>
                {translate('Merci pour votre commande', 'Thank you for your order')}
                <span className="brand-period">.</span>
              </h1>
              <p>
                {translate(
                  `Votre commande est enregistrée pour ${orderEmail}. Aucun paiement n’a été effectué pour le moment. Si le paiement n’a pas pu être préparé, retrouvez cette commande dans votre compte pour réessayer.`,
                  `Your order has been saved for ${orderEmail}. No payment has been made yet. If payment could not be prepared, you can find this order in your account and try again.`,
                )}
              </p>
              <button
                className="dark-button"
                onClick={() => {
                  setView('shop');
                  setCheckoutDone(false);
                }}
              >
                {translate('Retour à la boutique', 'Back to shop')} ↗
              </button>
            </div>
          ) : (
            <>
              <span className="eyebrow">{translate('DERNIÈRE ÉTAPE', 'FINAL STEP')}</span>
              <h1 className="workspace-title">
                {translate('Finaliser ma commande', 'Complete your order')}
                <span className="brand-period">.</span>
              </h1>
              <p className="workspace-intro">
                {translate(
                  'Votre commande sera enregistrée avant l’ouverture du paiement sécurisé Stripe. L’expédition ne démarre qu’après confirmation du paiement.',
                  'Your order will be saved before secure Stripe checkout opens. Shipment only begins after payment is confirmed.',
                )}
              </p>
              <div className="checkout-layout">
                <form
                  className="checkout-form"
                  onSubmit={completeCheckout}
                  aria-busy={checkoutSubmitting}
                >
                  <h2>{translate('Informations de livraison', 'Delivery information')}</h2>
                  {checkoutAddresses.length > 0 && (
                    <label>
                      {translate('Choisir une adresse enregistrée', 'Choose a saved address')}
                      <select
                        aria-label={translate(
                          'Choisir une adresse enregistrée',
                          'Choose a saved address',
                        )}
                        value={checkoutAddressId || '__new__'}
                        onChange={(event) =>
                          setCheckoutAddressId(
                            event.target.value === '__new__' ? '' : event.target.value,
                          )
                        }
                      >
                        {checkoutAddresses.map((address) => (
                          <option key={address.id} value={address.id}>
                            {address.label}
                            {address.isDefault
                              ? ` · ${translate('Par défaut', 'Default')}`
                              : ''} — {address.recipient}, {address.line1}, {address.postalCode}{' '}
                            {address.city}
                          </option>
                        ))}
                        <option value="__new__">
                          {translate('Utiliser une nouvelle adresse', 'Use a new address')}
                        </option>
                      </select>
                    </label>
                  )}
                  <label>
                    {translate('Adresse e-mail du compte', 'Account email address')}
                    <input type="email" autoComplete="email" value={orderEmail} readOnly />
                  </label>
                  {(!checkoutAddressId ||
                    !checkoutAddresses.some((address) => address.id === checkoutAddressId)) && (
                    <>
                      <div className="form-two-col">
                        <label>
                          {translate(
                            'Destinataire (prénom et nom)',
                            'Recipient (first and last name)',
                          )}
                          <input
                            required
                            name="recipient"
                            minLength={2}
                            maxLength={120}
                            autoComplete="name"
                            placeholder={translate(
                              'Prénom et nom du destinataire',
                              'Recipient full name',
                            )}
                          />
                        </label>
                        <label>
                          {translate(
                            'Complément d’adresse (facultatif)',
                            'Address line 2 (optional)',
                          )}
                          <input
                            name="line2"
                            maxLength={180}
                            autoComplete="address-line2"
                            placeholder={translate(
                              'Appartement, bâtiment…',
                              'Apartment, building…',
                            )}
                          />
                        </label>
                      </div>
                      <label>
                        {translate('Adresse', 'Address')}
                        <input
                          required
                          name="line1"
                          minLength={3}
                          maxLength={180}
                          autoComplete="street-address"
                          placeholder={translate('Numéro et rue', 'Street address')}
                        />
                      </label>
                      <div className="form-two-col">
                        <label>
                          Code postal
                          <input
                            required
                            name="postalCode"
                            minLength={2}
                            maxLength={20}
                            autoComplete="postal-code"
                            placeholder={translate('75000', 'Postal code')}
                          />
                        </label>
                        <label>
                          Ville
                          <input
                            required
                            name="city"
                            minLength={2}
                            maxLength={100}
                            autoComplete="address-level2"
                            placeholder={translate('Paris', 'City')}
                          />
                        </label>
                      </div>
                    </>
                  )}
                  <label className="checkbox-line">
                    <input type="checkbox" required />{' '}
                    {translate(
                      'Je confirme que les informations de livraison sont exactes.',
                      'I confirm that the delivery information is correct.',
                    )}
                  </label>
                  {checkoutSubmitting && (
                    <p className="workspace-loading" role="status" aria-live="polite">
                      {translate('Enregistrement de la commande…', 'Saving your order…')}
                    </p>
                  )}
                  <button
                    className="dark-button full-button"
                    type="submit"
                    disabled={checkoutSubmitting}
                  >
                    {checkoutSubmitting
                      ? translate('Enregistrement en cours…', 'Saving…')
                      : translate(
                          'Enregistrer la commande et continuer vers le paiement ↗',
                          'Save order and continue to payment ↗',
                        )}
                  </button>
                  <p className="fine-print">
                    {translate(
                      'Le paiement sécurisé sera effectué sur Stripe après validation de cette étape. L’expédition ne démarre qu’après confirmation du paiement.',
                      'Secure payment will be processed through Stripe after this step. Shipment only begins once payment is confirmed.',
                    )}
                  </p>
                </form>
                <aside className="order-summary">
                  <h2>{translate('Votre panier', 'Your cart')}</h2>
                  {catalog
                    .filter((product) => cart[product.id])
                    .map((product) => (
                      <div className="summary-item" key={product.id}>
                        <span className={`summary-thumb ${product.color}`}>
                          <img src={product.image} alt="" loading="lazy" />
                        </span>
                        <div>
                          <strong>{product.name}</strong>
                          <p>
                            {translate('Quantité :', 'Quantity:')} {cart[product.id] ?? 0}
                          </p>
                        </div>
                        <strong>{formatPrice(product.price * (cart[product.id] ?? 0))}</strong>
                      </div>
                    ))}
                  {cartCount === 0 && (
                    <p>
                      {translate(
                        'Votre panier est vide. Retournez au catalogue pour ajouter des articles.',
                        'Your cart is empty. Return to the catalogue to add items.',
                      )}
                    </p>
                  )}
                  <div className="summary-total">
                    <span>{translate('Sous-total', 'Subtotal')}</span>
                    <strong>{formatPrice(cartTotal)}</strong>
                  </div>
                  <div className="summary-total">
                    <span>{translate('Livraison', 'Shipping')}</span>
                    <strong>{translate('Non configurée', 'Not configured')}</strong>
                  </div>
                  <p className="summary-note">
                    {translate(
                      'Le paiement de cette version porte uniquement sur les articles affichés. Aucun frais de livraison n’est ajouté. Les conditions de retour sont disponibles en pied de page.',
                      'Payment in this version applies only to the items shown. No delivery charge is added. The returns policy is available in the footer.',
                    )}
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
              {translate('Période', 'Period')}{' '}
              <select value={sellerRange} onChange={(event) => setSellerRange(event.target.value)}>
                <option value="7">{translate('7 jours', '7 days')}</option>
                <option value="30">{translate('30 jours', '30 days')}</option>
                <option value="90">{translate('90 jours', '90 days')}</option>
              </select>
            </label>
          </div>
          <SellerWorkspace range={sellerRange} language={language} />
        </>
      )}
      {view === 'admin' && (
        <section className="workspace-page">
          <button className="back-link" onClick={() => setView('shop')}>
            {translate('← Retour à la boutique', '← Back to shop')}
          </button>
          <AdminWorkspace language={language} />
        </section>
      )}
      {view === 'legal' && (
        <LegalPage page={legalPage} language={language} onBack={() => setView('shop')} />
      )}
      {view === 'reset' && (
        <ResetPassword
          language={language}
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
        <p>{translate('Des essentiels pour votre quotidien.', 'Everyday essentials.')}</p>
        <div className="footer-links">
          <button onClick={() => setView('account')}>
            {translate('Mon compte', 'My account')}
          </button>
          <button
            onClick={() =>
              setNotice(
                translate(
                  'Le centre d’aide sera bientôt disponible.',
                  'The help centre will be available soon.',
                ),
              )
            }
          >
            {translate('Aide & contact', 'Help & contact')}
          </button>
          <button
            onClick={() => {
              setLegalPage('terms');
              setView('legal');
            }}
          >
            {translate('Conditions générales de vente', 'Terms and conditions')}
          </button>
          <button
            onClick={() => {
              setLegalPage('privacy');
              setView('legal');
            }}
          >
            {translate('Confidentialité', 'Privacy')}
          </button>
          <button
            onClick={() => {
              setLegalPage('returns');
              setView('legal');
            }}
          >
            {translate('Retours et remboursements', 'Returns and refunds')}
          </button>
        </div>
        <span className="copyright">© 2026 atelier. · {translate('Démonstration', 'Demo')}</span>
      </footer>
      {currentRole === 'SELLER' && view !== 'seller' && (
        <button className="seller-entry" onClick={openSeller}>
          <span>▦</span> {translate('Espace vendeur', 'Seller area')}
        </button>
      )}
      {currentRole === 'ADMIN' && view !== 'admin' && (
        <button className="admin-entry" onClick={openAdmin}>
          <span>⚙</span> {translate('Administration', 'Administration')}
        </button>
      )}
      {view === 'seller' && (
        <button className="seller-exit" onClick={() => setView('shop')}>
          {translate('← Retour à la boutique', '← Back to shop')}
        </button>
      )}
      {cartOpen && (
        <div className="drawer-backdrop">
          <button
            type="button"
            className="drawer-dismiss"
            aria-label={translate('Fermer le panier', 'Close cart')}
            onClick={() => setCartOpen(false)}
          />
          <aside className="cart-drawer" aria-label={translate('Votre panier', 'Your cart')}>
            <div className="drawer-heading">
              <div>
                <span className="eyebrow">{translate('VOTRE SÉLECTION', 'YOUR SELECTION')}</span>
                <h2>
                  {translate('Mon panier', 'My cart')} <span>({cartCount})</span>
                </h2>
              </div>
              <button
                className="close-drawer"
                aria-label={translate('Fermer le panier', 'Close cart')}
                onClick={() => setCartOpen(false)}
              >
                ×
              </button>
            </div>
            {cartCount === 0 ? (
              <div className="empty-cart">
                <span>♡</span>
                <h3>{translate('Votre panier est vide', 'Your cart is empty')}</h3>
                <p>
                  {translate(
                    'Vos prochains coups de cœur sont ici.',
                    'Your next favourites are waiting here.',
                  )}
                </p>
                <button className="dark-button" onClick={() => setCartOpen(false)}>
                  {translate('Continuer mes achats', 'Continue shopping')}
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
                          <img src={product.image} alt="" loading="lazy" />
                        </span>
                        <div className="drawer-product-info">
                          <strong>{product.name}</strong>
                          <span>{formatPrice(product.price)}</span>
                          <div className="quantity-control">
                            <button
                              aria-label={translate(
                                `Retirer un ${product.name}`,
                                `Remove one ${product.name}`,
                              )}
                              onClick={() => changeQuantity(product.id, -1)}
                            >
                              −
                            </button>
                            <span>{cart[product.id] ?? 0}</span>
                            <button
                              aria-label={translate(
                                `Ajouter un ${product.name}`,
                                `Add one ${product.name}`,
                              )}
                              onClick={() => changeQuantity(product.id, 1)}
                            >
                              ＋
                            </button>
                          </div>
                        </div>
                        <strong>{formatPrice(product.price * (cart[product.id] ?? 0))}</strong>
                      </div>
                    ))}
                </div>
                <div className="drawer-total">
                  <div>
                    <span>{translate('Sous-total', 'Subtotal')}</span>
                    <strong>{formatPrice(cartTotal)}</strong>
                  </div>
                  <p>
                    {translate(
                      'Livraison non configurée : aucun frais de livraison n’est ajouté au montant des articles.',
                      'Shipping is not configured: no delivery charge is added to the item total.',
                    )}
                  </p>
                  <button
                    className="dark-button full-button"
                    onClick={() => void beginCheckout()}
                    disabled={checkoutStarting}
                  >
                    {checkoutStarting
                      ? translate('Préparation…', 'Preparing…')
                      : translate('Passer à la commande', 'Proceed to checkout') + ' ↗'}
                  </button>
                  <button className="continue-link" onClick={() => setCartOpen(false)}>
                    {translate('Continuer mes achats', 'Continue shopping')}
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
