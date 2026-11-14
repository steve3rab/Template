import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { formatCents } from '../../shared/utils/formatCurrency';
import { PRODUCT_CATEGORIES } from '../../shared/categories';
import { translateText, type Language } from '../../shared/i18n';
import { DataTable } from '../../shared/components/DataTable';
import { compressImage } from '../../shared/utils/compressImage';

import {
  apiRequest,
  ApiError,
  apiSchemas,
  orderStatusSchema,
  type OrderStatus,
  type SellerDashboard as Dashboard,
  type SellerOrder as Order,
  type SellerProduct as Product,
} from '../../shared/api/client';

export function SellerWorkspace({
  range,
  language = 'fr',
}: {
  range: string;
  language?: Language;
}) {
  const t = useCallback((fr: string, en: string) => translateText(language, fr, en), [language]);
  const formatMoney = (amount: number, currency = 'EUR') =>
    formatCents(amount, currency, language === 'en' ? 'en-GB' : 'fr-FR');
  const categoryLabel = (value: string) => {
    if (language === 'fr') return value;
    const labels: Record<string, string> = {
      Vêtements: 'Clothing',
      Chaussures: 'Shoes',
      Accessoires: 'Accessories',
      Maison: 'Home',
    };
    return labels[value] ?? value;
  };
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Vêtements');
  const [price, setPrice] = useState('29.90');
  const [stock, setStock] = useState('10');
  const [images, setImages] = useState<string[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [sizes, setSizes] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [dimensionUnit, setDimensionUnit] = useState('cm');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productFilter, setProductFilter] = useState<'all' | 'published' | 'hidden' | 'low-stock'>(
    'all',
  );
  const [orderSearch, setOrderSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState<'all' | Order['status']>('all');
  const visibleProducts = products.filter((product) => {
    const query = productSearch.trim().toLocaleLowerCase();
    const matchesSearch = `${product.name} ${product.category}`.toLocaleLowerCase().includes(query);
    const matchesFilter =
      productFilter === 'all' ||
      (productFilter === 'published' && product.active) ||
      (productFilter === 'hidden' && !product.active) ||
      (productFilter === 'low-stock' && product.stock <= 5);
    return matchesSearch && matchesFilter;
  });
  const visibleOrders = orders.filter((order) => {
    const query = orderSearch.trim().toLocaleLowerCase();
    const haystack =
      `${order.id} ${order.customer?.email ?? ''} ${order.items.map((item) => item.productName).join(' ')}`.toLocaleLowerCase();
    return haystack.includes(query) && (orderFilter === 'all' || order.status === orderFilter);
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [stats, productPayload, orderPayload] = await Promise.all([
        apiRequest(`/api/seller/dashboard?days=${range}`, apiSchemas.sellerDashboard),
        apiRequest('/api/seller/products', apiSchemas.products),
        apiRequest('/api/seller/orders', apiSchemas.sellerOrders),
      ]);
      setDashboard(stats);
      setProducts(productPayload.products);
      setOrders(orderPayload.orders);
      setLoadError(false);
    } catch (error) {
      setLoadError(true);
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        window.dispatchEvent(
          new CustomEvent('template-toast', {
            detail: {
              message: t(
                'Votre session ou vos droits vendeur ne sont plus valides. Reconnectez-vous.',
                'Your session or seller permissions are no longer valid. Please sign in again.',
              ),
              type: 'error',
            },
          }),
        );
        return;
      }
      window.dispatchEvent(
        new CustomEvent('template-toast', {
          detail: {
            message:
              error instanceof Error
                ? error.message
                : t('Impossible de charger les données du vendeur.', 'Unable to load seller data.'),
            type: 'error',
          },
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [range, t]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => load())
      .catch(() =>
        window.dispatchEvent(
          new CustomEvent('template-toast', {
            detail: {
              message: t(
                'Erreur réseau pendant le chargement du tableau de bord.',
                'Network error while loading the dashboard.',
              ),
              type: 'error',
            },
          }),
        ),
      );
  }, [load, t]);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const normalizedName = name.trim();
    const parsedPrice = Number(price);
    const parsedStock = Number(stock);
    const dimensions = [length, width, height];
    const invalidDimension = dimensions.some(
      (value) => value.trim() !== '' && (!Number.isFinite(Number(value)) || Number(value) <= 0),
    );
    if (
      normalizedName.length < 2 ||
      !Number.isFinite(parsedPrice) ||
      parsedPrice <= 0 ||
      parsedPrice > 1_000_000 ||
      !Number.isSafeInteger(parsedStock) ||
      parsedStock < 0 ||
      parsedStock > 1_000_000 ||
      invalidDimension
    ) {
      window.dispatchEvent(
        new CustomEvent('template-toast', {
          detail: {
            message: t(
              'Vérifiez le nom, le prix, le stock et les dimensions du produit.',
              'Check the product name, price, stock and dimensions.',
            ),
            type: 'error',
          },
        }),
      );
      return;
    }

    setBusy(true);
    try {
      await apiRequest('/api/seller/products', apiSchemas.productResult, {
        method: 'POST',
        body: JSON.stringify({
          name: normalizedName,
          description: description.trim(),
          category,
          priceCents: Math.round(Number(price) * 100),
          stock: Number(stock),
          imageUrls: images,
          sizes: sizes
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          dimensions:
            length || width || height
              ? {
                  ...(length ? { length: Number(length) } : {}),
                  ...(width ? { width: Number(width) } : {}),
                  ...(height ? { height: Number(height) } : {}),
                  unit: dimensionUnit,
                }
              : undefined,
          active: true,
        }),
      });
      setName('');
      setDescription('');
      setPrice('29.90');
      setStock('10');
      setImages([]);
      setSizes('');
      setLength('');
      setWidth('');
      setHeight('');
      setDimensionUnit('cm');
      window.dispatchEvent(
        new CustomEvent('template-toast', {
          detail: { message: t('Produit créé.', 'Product created.'), type: 'success' },
        }),
      );
      await load();
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent('template-toast', {
          detail: {
            message:
              error instanceof Error
                ? error.message
                : t('Erreur lors de la création.', 'Error creating the product.'),
            type: 'error',
          },
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateProduct(product: Product, changes: Partial<Product>) {
    try {
      await apiRequest(`/api/seller/products/${product.id}`, apiSchemas.productResult, {
        method: 'PATCH',
        body: JSON.stringify({
          name: product.name,
          description: product.description,
          category: product.category,
          priceCents: product.priceCents,
          stock: product.stock,
          active: product.active,
          ...changes,
        }),
      });
      await load();
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent('template-toast', {
          detail: {
            message: error instanceof Error ? error.message : t('Erreur réseau.', 'Network error.'),
            type: 'error',
          },
        }),
      );
    }
  }

  async function updateOrder(orderId: string, status: OrderStatus) {
    try {
      await apiRequest(`/api/seller/orders/${orderId}/status`, apiSchemas.orderResult, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent('template-toast', {
          detail: {
            message:
              error instanceof Error
                ? error.message
                : t(
                    'Impossible de modifier le statut de cette commande.',
                    'Unable to update this order status.',
                  ),
            type: 'error',
          },
        }),
      );
    }
  }

  if (loading && !dashboard) {
    return (
      <section className="seller-page" aria-busy="true">
        <h1>{t('Tableau de bord', 'Dashboard')}</h1>
        <p className="workspace-loading" role="status" aria-live="polite">
          {t('Chargement des données vendeur…', 'Loading seller data…')}
        </p>
      </section>
    );
  }

  if (loadError && !dashboard) {
    return (
      <section className="seller-page">
        <h1>{t('Tableau de bord', 'Dashboard')}</h1>
        <div className="workspace-error" role="alert">
          <p>
            {t(
              'Impossible de charger les données vendeur. Vérifiez votre connexion puis réessayez.',
              'Unable to load seller data. Check your connection and try again.',
            )}
          </p>
          <button
            type="button"
            className="outline-button"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? t('Chargement…', 'Loading…') : t('Réessayer', 'Try again')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="seller-page">
      <div className="seller-topline">
        <div>
          <span className="eyebrow">{t('ATELIER · ESPACE VENDEUR', 'ATELIER · SELLER SPACE')}</span>
          <h1>
            {t('Tableau de bord', 'Dashboard')}
            <span className="brand-period">.</span>
          </h1>
          <p>
            {t(
              'Indicateurs calculés à partir des commandes et produits enregistrés.',
              'Metrics calculated from recorded orders and products.',
            )}
          </p>
        </div>
      </div>
      {loadError && (
        <div className="workspace-error" role="alert">
          <span>
            {t(
              'Actualisation impossible. Les dernières données chargées sont conservées.',
              'Refresh failed. The last successfully loaded data is still shown.',
            )}
          </span>
          <button
            type="button"
            className="outline-button"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? t('Chargement…', 'Loading…') : t('Réessayer', 'Try again')}
          </button>
        </div>
      )}
      <div className="kpi-grid">
        <article className="kpi-card">
          <div className="kpi-label">{t('Chiffre d’affaires payé', 'Paid revenue')}</div>
          <strong>{dashboard ? formatMoney(dashboard.revenueCents) : '—'}</strong>
          <p>
            {dashboard?.paidOrders ?? 0} {t('commandes payées sur', 'paid orders out of')}{' '}
            {dashboard?.periodDays ?? Number(range)} jours
          </p>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">{t('Commandes', 'Orders')}</div>
          <strong>{dashboard?.orders ?? '—'}</strong>
          <p>{t('Commandes sur la période sélectionnée', 'Orders in the selected period')}</p>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">{t('Unités vendues', 'Units sold')}</div>
          <strong>{dashboard?.unitsSold ?? '—'}</strong>
          <p>{t('Basé sur les lignes de commande', 'Based on order line items')}</p>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">{t('Catalogue', 'Catalogue')}</div>
          <strong>{dashboard?.products ?? '—'}</strong>
          <p>
            {t(
              `${dashboard?.lowStockProducts ?? 0} produit(s) avec stock inférieur ou égal à 5`,
              `${dashboard?.lowStockProducts ?? 0} product(s) with stock of 5 or less`,
            )}
          </p>
        </article>
      </div>
      <section className="seller-panel" style={{ marginTop: 24 }}>
        <div className="panel-heading">
          <div>
            <h2>{t('Ajouter un produit', 'Add a product')}</h2>
            <p>
              {t(
                'Les prix sont saisis en euros et enregistrés en centimes.',
                'Prices are entered in euros and stored in cents.',
              )}
            </p>
          </div>
        </div>
        <form
          className="checkout-form"
          onSubmit={(event) => void createProduct(event)}
          aria-busy={busy}
        >
          <label>
            {t('Nom du produit', 'Product name')}
            <input
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            {t('Description', 'Description')}
            <textarea
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="product-image-upload">
            {t('Photos du produit (5 maximum)', 'Product photos (up to 5)')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event) => {
                const input = event.currentTarget;
                const selectedFiles = Array.from(input.files ?? []);
                const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
                if (
                  selectedFiles.length > 5 ||
                  selectedFiles.some((file) => !allowedTypes.includes(file.type))
                ) {
                  window.dispatchEvent(
                    new CustomEvent('template-toast', {
                      detail: {
                        message: t(
                          'Sélectionnez au maximum 5 images PNG, JPEG ou WebP.',
                          'Select up to 5 PNG, JPEG or WebP images.',
                        ),
                        type: 'error',
                      },
                    }),
                  );
                  input.value = '';
                  return;
                }
                if (selectedFiles.some((file) => file.size > 15 * 1024 * 1024)) {
                  window.dispatchEvent(
                    new CustomEvent('template-toast', {
                      detail: {
                        message: t(
                          'Chaque photo doit faire moins de 15 Mo avant compression.',
                          'Each image must be smaller than 15 MB before compression.',
                        ),
                        type: 'error',
                      },
                    }),
                  );
                  input.value = '';
                  return;
                }

                setImagesLoading(true);
                void (async () => {
                  try {
                    const optimizedImages: string[] = [];
                    for (const file of selectedFiles) {
                      const optimized = await compressImage(file);
                      optimizedImages.push(optimized.dataUrl);
                    }
                    setImages(optimizedImages);
                  } catch (error) {
                    window.dispatchEvent(
                      new CustomEvent('template-toast', {
                        detail: {
                          message:
                            error instanceof Error
                              ? error.message
                              : t('Compression de photo impossible.', 'Unable to compress image.'),
                          type: 'error',
                        },
                      }),
                    );
                  } finally {
                    setImagesLoading(false);
                    input.value = '';
                  }
                })();
              }}
            />
            <span className="field-hint">
              {t(
                'PNG, JPEG ou WebP · 1,2 Mo maximum par photo.',
                'PNG, JPEG or WebP · 1.2 MB maximum per image.',
              )}
            </span>
            {imagesLoading && (
              <span className="workspace-loading" role="status" aria-live="polite">
                {t('Préparation des photos…', 'Preparing images…')}
              </span>
            )}
            {images.length > 0 && (
              <div className="product-image-previews">
                {images.map((image, index) => (
                  <div className="product-image-preview" key={index}>
                    <img
                      src={image}
                      alt={t(
                        `Aperçu du produit ${index + 1}`,
                        `Product image preview ${index + 1}`,
                      )}
                    />
                    <button
                      type="button"
                      aria-label={t(`Retirer la photo ${index + 1}`, `Remove photo ${index + 1}`)}
                      onClick={() =>
                        setImages((current) => current.filter((_, item) => item !== index))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </label>
          <label>
            {t('Tailles disponibles', 'Available sizes')}
            <input
              value={sizes}
              placeholder={t(
                'Ex. XS, S, M, L, XL ou 38, 39, 40',
                'E.g. XS, S, M, L, XL or 38, 39, 40',
              )}
              onChange={(event) => setSizes(event.target.value)}
            />
            <span className="field-hint">
              {t('Séparez les tailles par des virgules.', 'Separate sizes with commas.')}
            </span>
          </label>
          <div className="form-two-col product-dimensions">
            <label>
              {t('Longueur', 'Length')}
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={length}
                onChange={(event) => setLength(event.target.value)}
              />
            </label>
            <label>
              {t('Largeur', 'Width')}
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={width}
                onChange={(event) => setWidth(event.target.value)}
              />
            </label>
            <label>
              {t('Hauteur', 'Height')}
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={height}
                onChange={(event) => setHeight(event.target.value)}
              />
            </label>
            <label>
              {t('Unité', 'Unit')}
              <select
                value={dimensionUnit}
                onChange={(event) => setDimensionUnit(event.target.value)}
              >
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
                <option value="in">in</option>
              </select>
            </label>
          </div>
          <div className="form-two-col">
            <label>
              {t('Catégorie', 'Category')}
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {PRODUCT_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {categoryLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('Prix (€)', 'Price (€)')}
              <input
                required
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </label>
            <label>
              {t('Stock initial', 'Initial stock')}
              <input
                required
                type="number"
                min="0"
                max="1000000"
                step="1"
                value={stock}
                onChange={(event) => setStock(event.target.value)}
              />
            </label>
          </div>
          <button className="dark-button" type="submit" disabled={busy || imagesLoading}>
            {busy
              ? t('Enregistrement…', 'Saving…')
              : imagesLoading
                ? t('Préparation des photos…', 'Preparing images…')
                : t('Créer le produit', 'Create product')}
          </button>
        </form>
      </section>
      <section className="seller-panel" style={{ marginTop: 24 }}>
        <div className="panel-heading">
          <div>
            <h2>{t('Mes produits', 'My products')}</h2>
            <p>
              {t(
                `${products.length} produit(s) géré(s) par ce compte`,
                `${products.length} product(s) managed by this account`,
              )}
            </p>
          </div>
        </div>
        <div className="workspace-filters">
          <label>
            {t('Rechercher un produit', 'Search products')}
            <input
              type="search"
              aria-label={t('Rechercher un produit', 'Search products')}
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder={t('Nom ou catégorie', 'Name or category')}
            />
          </label>
          <label>
            {t('Afficher', 'Show')}
            <select
              aria-label={t('Filtrer les produits', 'Filter products')}
              value={productFilter}
              onChange={(event) => setProductFilter(event.target.value as typeof productFilter)}
            >
              <option value="all">{t('Tous', 'All')}</option>
              <option value="published">{t('Publiés', 'Published')}</option>
              <option value="hidden">{t('Masqués', 'Hidden')}</option>
              <option value="low-stock">{t('Stock faible (≤ 5)', 'Low stock (≤ 5)')}</option>
            </select>
          </label>
          <span className="field-hint">
            {visibleProducts.length} / {products.length}
          </span>
        </div>
        <DataTable
          ariaLabel={t('Mes produits', 'My products')}
          data={visibleProducts}
          rowKey={(product) => product.id}
          emptyMessage={
            products.length === 0
              ? t(
                  'Aucun produit pour le moment. Ajoutez votre premier produit ci-dessus.',
                  'No products yet. Add your first product above.',
                )
              : t('Aucun produit ne correspond à ces filtres.', 'No products match these filters.')
          }
          labels={{
            pageSize: t('Lignes par page', 'Rows per page'),
            previous: t('Précédent', 'Previous'),
            next: t('Suivant', 'Next'),
            page: t('Page', 'Page'),
            of: t('sur', 'of'),
            rows: t('lignes', 'rows'),
          }}
          columns={[
            {
              key: 'product',
              header: t('Produit', 'Product'),
              sortValue: (product) => product.name,
              render: (product) => (
                <div className="data-table__stack">
                  <strong>{product.name}</strong>
                  <input
                    aria-label={t(`Nom ${product.name}`, `Name ${product.name}`)}
                    defaultValue={product.name}
                    maxLength={120}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value.length >= 2 && value !== product.name)
                        void updateProduct(product, { name: value });
                    }}
                  />
                </div>
              ),
            },
            {
              key: 'price',
              header: t('Prix (€)', 'Price (€)'),
              sortValue: (product) => product.priceCents,
              align: 'right',
              render: (product) => (
                <input
                  aria-label={t(`Prix ${product.name}`, `Price ${product.name}`)}
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  defaultValue={(product.priceCents / 100).toFixed(2)}
                  onBlur={(event) => {
                    const value = Number(event.target.value);
                    const cents = Math.round(value * 100);
                    if (Number.isFinite(value) && cents > 0 && cents !== product.priceCents)
                      void updateProduct(product, { priceCents: cents });
                  }}
                />
              ),
            },
            {
              key: 'stock',
              header: t('Stock', 'Stock'),
              sortValue: (product) => product.stock,
              align: 'right',
              render: (product) => (
                <input
                  aria-label={t(`Stock ${product.name}`, `Stock ${product.name}`)}
                  type="number"
                  min="0"
                  max="1000000"
                  defaultValue={product.stock}
                  onBlur={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isInteger(value) && value >= 0 && value !== product.stock)
                      void updateProduct(product, { stock: value });
                  }}
                />
              ),
            },
            {
              key: 'visibility',
              header: t('Visibilité', 'Visibility'),
              sortValue: (product) => (product.active ? 1 : 0),
              render: (product) => (
                <div className="data-table__stack">
                  <span>{product.active ? t('Publié', 'Published') : t('Masqué', 'Hidden')}</span>
                  <button
                    className="text-action"
                    type="button"
                    onClick={() => void updateProduct(product, { active: !product.active })}
                  >
                    {product.active ? t('Masquer', 'Hide') : t('Publier', 'Publish')}
                  </button>
                </div>
              ),
            },
          ]}
        />
      </section>
      <section className="seller-panel" style={{ marginTop: 24 }}>
        <div className="panel-heading">
          <div>
            <h2>{t('Commandes clients', 'Customer orders')}</h2>
            <p>
              {t(
                'Suivez la préparation et l’expédition des commandes contenant vos produits.',
                'Track the preparation and shipment of orders containing your products.',
              )}
            </p>
          </div>
        </div>
        <div className="workspace-filters">
          <label>
            {t('Rechercher une commande', 'Search orders')}
            <input
              type="search"
              aria-label={t('Rechercher une commande', 'Search orders')}
              value={orderSearch}
              onChange={(event) => setOrderSearch(event.target.value)}
              placeholder={t('N° commande, client ou produit', 'Order, customer or product')}
            />
          </label>
          <label>
            {t('Statut', 'Status')}
            <select
              aria-label={t('Filtrer les commandes', 'Filter orders')}
              value={orderFilter}
              onChange={(event) => setOrderFilter(event.target.value as typeof orderFilter)}
            >
              <option value="all">{t('Tous les statuts', 'All statuses')}</option>
              <option value="PENDING">{t('En attente', 'Pending')}</option>
              <option value="PROCESSING">{t('En préparation', 'Processing')}</option>
              <option value="SHIPPED">{t('Expédiées', 'Shipped')}</option>
              <option value="DELIVERED">{t('Livrées', 'Delivered')}</option>
              <option value="CANCELLED">{t('Annulées', 'Cancelled')}</option>
            </select>
          </label>
          <span className="field-hint">
            {visibleOrders.length} / {orders.length}
          </span>
        </div>
        <DataTable
          ariaLabel={t('Commandes clients', 'Customer orders')}
          data={visibleOrders}
          rowKey={(order) => order.id}
          emptyMessage={
            orders.length === 0
              ? t(
                  'Aucune commande enregistrée pour le moment.',
                  'No orders have been recorded yet.',
                )
              : t('Aucune commande ne correspond à ces filtres.', 'No orders match these filters.')
          }
          labels={{
            pageSize: t('Lignes par page', 'Rows per page'),
            previous: t('Précédent', 'Previous'),
            next: t('Suivant', 'Next'),
            page: t('Page', 'Page'),
            of: t('sur', 'of'),
            rows: t('lignes', 'rows'),
          }}
          columns={[
            {
              key: 'order',
              header: t('Commande', 'Order'),
              sortValue: (order) => order.id,
              render: (order) => <strong>{order.id.slice(-8)}</strong>,
            },
            {
              key: 'customer',
              header: t('Client et articles', 'Customer and items'),
              sortValue: (order) => order.customer?.email ?? '',
              render: (order) => (
                <div className="data-table__stack">
                  <strong>{order.customer?.email ?? t('Client', 'Customer')}</strong>
                  <span>
                    {order.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ')}
                  </span>
                </div>
              ),
            },
            {
              key: 'createdAt',
              header: t('Date', 'Date'),
              sortValue: (order) => order.createdAt,
              render: (order) =>
                new Date(order.createdAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR'),
            },
            {
              key: 'payment',
              header: t('Paiement', 'Payment'),
              sortValue: (order) => order.paymentStatus,
              render: (order) =>
                (
                  ({
                    PAID: t('Payé', 'Paid'),
                    UNPAID: t('À régler', 'Unpaid'),
                    REFUNDED: t('Remboursé', 'Refunded'),
                    PARTIALLY_REFUNDED: t('Partiellement remboursé', 'Partially refunded'),
                    FAILED: t('Échec du paiement', 'Payment failed'),
                  }) as Record<string, string>
                )[order.paymentStatus] ?? order.paymentStatus,
            },
            {
              key: 'total',
              header: t('Total', 'Total'),
              sortValue: (order) => order.totalCents,
              align: 'right',
              render: (order) => formatMoney(order.totalCents),
            },
            {
              key: 'status',
              header: t('Statut', 'Status'),
              sortValue: (order) => order.status,
              render: (order) => (
                <select
                  aria-label={t(`Statut commande ${order.id}`, `Order status ${order.id}`)}
                  value={order.status}
                  disabled={loading || order.status === 'DELIVERED' || order.status === 'CANCELLED'}
                  onChange={(event) => {
                    const parsedStatus = orderStatusSchema.safeParse(event.target.value);
                    if (parsedStatus.success) void updateOrder(order.id, parsedStatus.data);
                  }}
                >
                  <option value="PENDING">{t('En attente', 'Pending')}</option>
                  <option value="PROCESSING" disabled={order.paymentStatus !== 'PAID'}>
                    {t('En préparation', 'Processing')}
                  </option>
                  <option value="SHIPPED" disabled={order.paymentStatus !== 'PAID'}>
                    {t('Expédiée', 'Shipped')}
                  </option>
                  <option value="DELIVERED" disabled={order.paymentStatus !== 'PAID'}>
                    {t('Livrée', 'Delivered')}
                  </option>
                  <option value="CANCELLED">{t('Annulée', 'Cancelled')}</option>
                </select>
              ),
            },
          ]}
        />
      </section>
      <p className="fine-print">
        {t(
          'Le paiement en ligne et les webhooks de confirmation ne sont pas encore configurés ; le chiffre d’affaires payé reste à zéro tant qu’aucun paiement n’est confirmé.',
          'Online payments and confirmation webhooks are not configured yet; paid revenue remains zero until a payment is confirmed.',
        )}
      </p>
    </section>
  );
}
