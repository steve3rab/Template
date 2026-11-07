import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { formatCents } from '../../shared/utils/formatCurrency';
import { apiRequest, apiSchemas } from '../../shared/api/client';
import { translateText, type Language } from '../../shared/i18n';
import { DataTable } from '../../shared/components/DataTable';

type AdminUser = {
  id: string;
  publicId: string;
  email: string;
  role: string;
  createdAt: string;
};

type AdminProduct = z.infer<typeof apiSchemas.adminProducts>['products'][number];

type AdminOrder = z.infer<typeof apiSchemas.adminOrders>['orders'][number];
type AdminFinancialTransaction = z.infer<
  typeof apiSchemas.adminFinancialTransactions
>['transactions'][number];

type Section = 'users' | 'products' | 'orders' | 'finances';

const roleResult = z.object({
  user: z.object({ id: z.string(), email: z.string(), role: z.string() }),
});

export function AdminWorkspace({ language = 'fr' }: { language?: Language }) {
  const t = useCallback((fr: string, en: string) => translateText(language, fr, en), [language]);
  const formatMoney = (amount: number, currency = 'EUR') =>
    formatCents(amount, currency, language === 'en' ? 'en-GB' : 'fr-FR');
  const [dashboard, setDashboard] = useState<z.infer<typeof apiSchemas.adminDashboard> | null>(
    null,
  );
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [financialTransactions, setFinancialTransactions] = useState<AdminFinancialTransaction[]>(
    [],
  );
  const [refundRequestKeys, setRefundRequestKeys] = useState<Record<string, string>>({});
  const [reconciliation, setReconciliation] = useState<z.infer<
    typeof apiSchemas.reconciliationResult
  > | null>(null);
  const [section, setSection] = useState<Section>('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [productVisibilityFilter, setProductVisibilityFilter] = useState('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');

  const visibleUsers = users.filter(
    (user) =>
      `${user.email} ${user.publicId}`
        .toLocaleLowerCase()
        .includes(userSearch.trim().toLocaleLowerCase()) &&
      (userRoleFilter === 'all' || user.role === userRoleFilter),
  );
  const visibleProducts = products.filter(
    (product) =>
      `${product.name} ${product.seller?.email ?? ''} ${product.category}`
        .toLocaleLowerCase()
        .includes(productSearch.trim().toLocaleLowerCase()) &&
      (productVisibilityFilter === 'all' ||
        (productVisibilityFilter === 'active' && product.active) ||
        (productVisibilityFilter === 'hidden' && !product.active)),
  );
  const visibleOrders = orders.filter(
    (order) =>
      `${order.id} ${order.customer?.email ?? ''} ${order.items.map((item) => item.productName).join(' ')}`
        .toLocaleLowerCase()
        .includes(orderSearch.trim().toLocaleLowerCase()) &&
      (orderStatusFilter === 'all' || order.status === orderStatusFilter),
  );

  const load = useCallback(
    async (showProgress = true) => {
      if (showProgress) {
        setLoading(true);
        setError('');
      }
      try {
        const [stats, userData, productData, orderData, financialData] = await Promise.all([
          apiRequest('/api/admin/dashboard', apiSchemas.adminDashboard),
          apiRequest('/api/admin/users', apiSchemas.adminUsers),
          apiRequest('/api/admin/products', apiSchemas.adminProducts),
          apiRequest('/api/admin/orders', apiSchemas.adminOrders),
          apiRequest('/api/admin/financial-transactions', apiSchemas.adminFinancialTransactions),
        ]);
        setDashboard(stats);
        setUsers(userData.users);
        setProducts(productData.products);
        setOrders(orderData.orders);
        setFinancialTransactions(financialData.transactions);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : t(
                'Impossible de charger les données administrateur.',
                'Unable to load administrator data.',
              ),
        );
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load(false);
    });
    return () => {
      active = false;
    };
  }, [load]);

  async function retryPendingRefund(transaction: AdminFinancialTransaction) {
    if (!transaction.requestKey) {
      setError(
        t(
          'Cette demande de remboursement ne possède pas de clé de reprise.',
          'This refund request has no retry key.',
        ),
      );
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest(
        `/api/admin/orders/${encodeURIComponent(transaction.order.id)}/refund`,
        apiSchemas.refundResult,
        {
          method: 'POST',
          body: JSON.stringify({
            requestKey: transaction.requestKey,
            amountCents: transaction.amountCents,
          }),
        },
      );
      setError(
        'pending' in result
          ? result.message
          : `${t('Remboursement confirmé :', 'Refund confirmed:')} ${formatMoney(result.refund.amountCents)}.`,
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Impossible de reprendre le remboursement.', 'Unable to retry the refund.'),
      );
      setLoading(false);
    }
  }

  async function reconcilePayments() {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest(
        '/api/admin/payments/reconciliation',
        apiSchemas.reconciliationResult,
      );
      setReconciliation(result);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'Impossible de rapprocher les paiements Stripe.',
              'Unable to reconcile Stripe payments.',
            ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function refundOrder(order: AdminOrder, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const requestKey =
      String(form.get('requestKey') ?? '') || refundRequestKeys[order.id] || crypto.randomUUID();
    setRefundRequestKeys((current) => ({ ...current, [order.id]: requestKey }));
    const rawAmount = String(form.get('amountCents') ?? '').trim();
    const amountCents = rawAmount ? Number(rawAmount) : undefined;
    if (amountCents !== undefined && (!Number.isSafeInteger(amountCents) || amountCents < 1)) {
      setError(
        t(
          'Le montant du remboursement doit être un nombre entier de centimes positif.',
          'The refund amount must be a positive whole number of cents.',
        ),
      );
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest(
        `/api/admin/orders/${encodeURIComponent(order.id)}/refund`,
        apiSchemas.refundResult,
        {
          method: 'POST',
          body: JSON.stringify({
            requestKey,
            ...(amountCents === undefined ? {} : { amountCents }),
          }),
        },
      );
      if ('pending' in result) {
        setError(result.message);
      } else {
        setError(
          `${t('Remboursement confirmé :', 'Refund confirmed:')} ${formatMoney(result.refund.amountCents)}.`,
        );
        setRefundRequestKeys((current) => {
          const next = { ...current };
          delete next[order.id];
          return next;
        });
      }
      await load();
    } catch (cause) {
      setRefundRequestKeys((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
      setError(
        cause instanceof Error
          ? cause.message
          : t('Impossible de traiter le remboursement.', 'Unable to process the refund.'),
      );
      setLoading(false);
    }
  }

  async function updateRole(user: AdminUser, role: 'CUSTOMER' | 'SELLER') {
    setLoading(true);
    setError('');
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/role`, roleResult, {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Impossible de modifier ce rôle.', 'Unable to change this role.'),
      );
      setLoading(false);
    }
  }

  async function toggleProduct(product: AdminProduct) {
    setLoading(true);
    setError('');
    try {
      await apiRequest(
        `/api/admin/products/${encodeURIComponent(product.id)}/visibility`,
        apiSchemas.productResult,
        {
          method: 'PATCH',
          body: JSON.stringify({ active: !product.active }),
        },
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'Impossible de modifier la visibilité du produit.',
              'Unable to change product visibility.',
            ),
      );
      setLoading(false);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-heading">
        <div>
          <span className="eyebrow">ATELIER · {t('ADMINISTRATION', 'ADMIN')}</span>
          <h1>
            {t('Centre de gestion', 'Management centre')}
            <span className="brand-period">.</span>
          </h1>
          <p>
            {t(
              'Vue globale de la boutique, des comptes, du catalogue et des commandes.',
              'Overview of the store, accounts, catalogue and orders.',
            )}
          </p>
        </div>
        <button
          className="outline-button"
          type="button"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? t('Actualisation…', 'Refreshing…') : t('Actualiser', 'Refresh')}
        </button>
      </header>

      <div className="admin-kpis">
        <article className="kpi-card">
          <span>{t('Utilisateurs', 'Users')}</span>
          <strong>{dashboard?.users ?? '—'}</strong>
          <small>
            {dashboard?.sellers ?? 0} {t('vendeurs', 'sellers')}
          </small>
        </article>
        <article className="kpi-card">
          <span>{t('Catalogue', 'Catalogue')}</span>
          <strong>{dashboard?.products ?? '—'}</strong>
          <small>
            {dashboard?.activeProducts ?? 0} {t('produits publiés', 'published products')}
          </small>
        </article>
        <article className="kpi-card">
          <span>{t('Commandes', 'Orders')}</span>
          <strong>{dashboard?.orders ?? '—'}</strong>
          <small>
            {dashboard?.paidOrders ?? 0} {t('paiements confirmés', 'confirmed payments')}
          </small>
        </article>
        <article className="kpi-card">
          <span>{t('Chiffre d’affaires encaissé', 'Collected revenue')}</span>
          <strong>{dashboard ? formatMoney(dashboard.revenueCents) : '—'}</strong>
          <small>{t('Commandes payées uniquement', 'Paid orders only')}</small>
        </article>
      </div>

      <nav
        className="admin-tabs"
        aria-label={t('Sections administrateur', 'Administrator sections')}
      >
        <button
          type="button"
          className={section === 'users' ? 'active' : ''}
          onClick={() => setSection('users')}
        >
          {t('Utilisateurs', 'Users')} ({users.length})
        </button>
        <button
          type="button"
          className={section === 'products' ? 'active' : ''}
          onClick={() => setSection('products')}
        >
          {t('Produits', 'Products')} ({products.length})
        </button>
        <button
          type="button"
          className={section === 'orders' ? 'active' : ''}
          onClick={() => setSection('orders')}
        >
          {t('Commandes', 'Orders')} ({orders.length})
        </button>
        <button
          type="button"
          className={section === 'finances' ? 'active' : ''}
          onClick={() => setSection('finances')}
        >
          {t('Finances', 'Finances')} ({financialTransactions.length})
        </button>
      </nav>

      {loading && (
        <p className="workspace-loading" role="status" aria-live="polite" aria-busy="true">
          {dashboard
            ? t('Actualisation des données…', 'Refreshing data…')
            : t('Chargement des données…', 'Loading data…')}
        </p>
      )}
      {error && (
        <div className="workspace-error" role="alert">
          <p>{error}</p>
          {!dashboard && (
            <button
              type="button"
              className="outline-button"
              onClick={() => void load()}
              disabled={loading}
            >
              {t('Réessayer', 'Try again')}
            </button>
          )}
        </div>
      )}
      {dashboard && (
        <section className="seller-panel admin-data-panel" aria-busy={loading}>
          {section === 'users' && (
            <>
              <h2>{t('Gestion des comptes', 'Account management')}</h2>
              <div className="workspace-filters">
                <label>
                  {t('Rechercher un compte', 'Search accounts')}
                  <input
                    type="search"
                    aria-label={t('Rechercher un compte', 'Search accounts')}
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder={t('E-mail ou identifiant', 'Email or ID')}
                  />
                </label>
                <label>
                  {t('Rôle', 'Role')}
                  <select
                    aria-label={t('Filtrer les rôles', 'Filter roles')}
                    value={userRoleFilter}
                    onChange={(event) => setUserRoleFilter(event.target.value)}
                  >
                    <option value="all">{t('Tous', 'All')}</option>
                    <option value="CUSTOMER">{t('Clients', 'Customers')}</option>
                    <option value="SELLER">{t('Vendeurs', 'Sellers')}</option>
                    <option value="ADMIN">{t('Administrateurs', 'Administrators')}</option>
                  </select>
                </label>
                <span className="field-hint">
                  {visibleUsers.length} / {users.length}
                </span>
              </div>
              <DataTable
                ariaLabel={t('Comptes utilisateurs', 'User accounts')}
                data={visibleUsers}
                rowKey={(user) => user.id}
                emptyMessage={
                  users.length === 0
                    ? t('Aucun utilisateur.', 'No users.')
                    : t(
                        'Aucun compte ne correspond à ces filtres.',
                        'No accounts match these filters.',
                      )
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
                    key: 'email',
                    header: t('Compte', 'Account'),
                    sortValue: (user) => user.email,
                    render: (user) => (
                      <div className="data-table__stack">
                        <strong>{user.email}</strong>
                        <span>{user.publicId}</span>
                      </div>
                    ),
                  },
                  {
                    key: 'createdAt',
                    header: t('Date de création', 'Created'),
                    sortValue: (user) => user.createdAt,
                    render: (user) =>
                      new Date(user.createdAt).toLocaleDateString(
                        language === 'en' ? 'en-GB' : 'fr-FR',
                      ),
                  },
                  {
                    key: 'role',
                    header: t('Rôle', 'Role'),
                    sortValue: (user) => user.role,
                    render: (user) =>
                      user.role === 'ADMIN' ? (
                        <strong className="admin-role">
                          {t('Administrateur', 'Administrator')}
                        </strong>
                      ) : (
                        <select
                          aria-label={t(`Rôle de ${user.email}`, `Role for ${user.email}`)}
                          value={user.role}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === 'CUSTOMER' || value === 'SELLER')
                              void updateRole(user, value);
                          }}
                        >
                          <option value="CUSTOMER">{t('Client', 'Customer')}</option>
                          <option value="SELLER">{t('Vendeur', 'Seller')}</option>
                        </select>
                      ),
                  },
                ]}
              />
            </>
          )}

          {section === 'products' && (
            <>
              <h2>{t('Modération du catalogue', 'Catalogue moderation')}</h2>
              <div className="workspace-filters">
                <label>
                  {t('Rechercher un produit', 'Search products')}
                  <input
                    type="search"
                    aria-label={t('Rechercher un produit', 'Search products')}
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder={t('Nom, vendeur ou catégorie', 'Name, seller or category')}
                  />
                </label>
                <label>
                  {t('Visibilité', 'Visibility')}
                  <select
                    aria-label={t('Filtrer la visibilité', 'Filter visibility')}
                    value={productVisibilityFilter}
                    onChange={(event) => setProductVisibilityFilter(event.target.value)}
                  >
                    <option value="all">{t('Toutes', 'All')}</option>
                    <option value="active">{t('Publiés', 'Published')}</option>
                    <option value="hidden">{t('Masqués', 'Hidden')}</option>
                  </select>
                </label>
                <span className="field-hint">
                  {visibleProducts.length} / {products.length}
                </span>
              </div>
              <DataTable
                ariaLabel={t('Modération des produits', 'Product moderation')}
                data={visibleProducts}
                rowKey={(product) => product.id}
                emptyMessage={
                  products.length === 0
                    ? t('Aucun produit.', 'No products.')
                    : t(
                        'Aucun produit ne correspond à ces filtres.',
                        'No products match these filters.',
                      )
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
                    key: 'name',
                    header: t('Produit', 'Product'),
                    sortValue: (product) => product.name,
                    render: (product) => <strong>{product.name}</strong>,
                  },
                  {
                    key: 'seller',
                    header: t('Vendeur', 'Seller'),
                    sortValue: (product) => product.seller?.email ?? '',
                    render: (product) => product.seller?.email ?? t('Sans vendeur', 'No seller'),
                  },
                  {
                    key: 'price',
                    header: t('Prix', 'Price'),
                    sortValue: (product) => product.priceCents,
                    align: 'right',
                    render: (product) => formatMoney(product.priceCents),
                  },
                  {
                    key: 'stock',
                    header: t('Stock', 'Stock'),
                    sortValue: (product) => product.stock,
                    align: 'right',
                    render: (product) => product.stock,
                  },
                  {
                    key: 'visibility',
                    header: t('Visibilité', 'Visibility'),
                    sortValue: (product) => (product.active ? 1 : 0),
                    render: (product) => (
                      <button
                        className="text-action"
                        type="button"
                        onClick={() => void toggleProduct(product)}
                      >
                        {product.active ? t('Masquer', 'Hide') : t('Publier', 'Publish')}
                      </button>
                    ),
                  },
                ]}
              />
            </>
          )}

          {section === 'orders' && (
            <>
              <h2>{t('Suivi des commandes', 'Order tracking')}</h2>
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
                    value={orderStatusFilter}
                    onChange={(event) => setOrderStatusFilter(event.target.value)}
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
                ariaLabel={t('Suivi des commandes', 'Order tracking')}
                data={visibleOrders}
                rowKey={(order) => order.id}
                emptyMessage={
                  orders.length === 0
                    ? t('Aucune commande.', 'No orders.')
                    : t(
                        'Aucune commande ne correspond à ces filtres.',
                        'No orders match these filters.',
                      )
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
                    header: t('Client', 'Customer'),
                    sortValue: (order) => order.customer?.email ?? '',
                    render: (order) => order.customer?.email ?? t('Client', 'Customer'),
                  },
                  {
                    key: 'items',
                    header: t('Articles', 'Items'),
                    render: (order) =>
                      order.items
                        .map((item) => `${item.productName} × ${item.quantity}`)
                        .join(', '),
                  },
                  {
                    key: 'createdAt',
                    header: t('Date', 'Date'),
                    sortValue: (order) => order.createdAt,
                    render: (order) =>
                      new Date(order.createdAt).toLocaleDateString(
                        language === 'en' ? 'en-GB' : 'fr-FR',
                      ),
                  },
                  {
                    key: 'status',
                    header: t('Statut', 'Status'),
                    sortValue: (order) => order.status,
                    render: (order) => (
                      <div className="data-table__stack">
                        <span>
                          {(
                            {
                              PENDING: t('En attente', 'Pending'),
                              PROCESSING: t('En préparation', 'Processing'),
                              SHIPPED: t('Expédiée', 'Shipped'),
                              DELIVERED: t('Livrée', 'Delivered'),
                              CANCELLED: t('Annulée', 'Cancelled'),
                            } as Record<string, string>
                          )[order.status] ?? order.status}
                        </span>
                        <small>
                          {(
                            {
                              PAID: t('Payé', 'Paid'),
                              UNPAID: t('À régler', 'Unpaid'),
                              REFUNDED: t('Remboursé', 'Refunded'),
                              PARTIALLY_REFUNDED: t(
                                'Partiellement remboursé',
                                'Partially refunded',
                              ),
                              FAILED: t('Échec', 'Failed'),
                            } as Record<string, string>
                          )[order.paymentStatus] ?? order.paymentStatus}
                        </small>
                      </div>
                    ),
                  },
                  {
                    key: 'total',
                    header: t('Total', 'Total'),
                    sortValue: (order) => order.totalCents,
                    align: 'right',
                    render: (order) => (
                      <div className="data-table__stack">
                        <strong>{formatMoney(order.totalCents)}</strong>
                        {['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus) && (
                          <form
                            key={`${order.id}:${refundRequestKeys[order.id] ?? 'new'}`}
                            onSubmit={(event) => void refundOrder(order, event)}
                          >
                            <input
                              type="hidden"
                              name="requestKey"
                              defaultValue={refundRequestKeys[order.id] ?? ''}
                            />
                            <label>
                              {t('Montant en centimes (facultatif)', 'Amount in cents (optional)')}
                              <input
                                name="amountCents"
                                type="number"
                                min="1"
                                max={Math.max(0, order.totalCents - (order.refundedCents ?? 0))}
                                step="1"
                                placeholder={t('Solde complet', 'Full balance')}
                              />
                            </label>
                            <button className="text-action" type="submit" disabled={loading}>
                              {t('Rembourser', 'Refund')}
                            </button>
                          </form>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </>
          )}

          {section === 'finances' && (
            <>
              <h2>{t('Historique financier', 'Financial history')}</h2>
              <button
                className="outline-button"
                type="button"
                onClick={() => void reconcilePayments()}
                disabled={loading}
              >
                {t('Rapprocher avec Stripe', 'Reconcile with Stripe')}
              </button>
              {reconciliation && (
                <div className="financial-reconciliation" role="status">
                  <strong>
                    {reconciliation.matched} {t('rapprochées', 'matched')} ·{' '}
                    {reconciliation.discrepancies} {t('écarts', 'discrepancies')} ·{' '}
                    {reconciliation.unverified} {t('non vérifiées', 'unverified')}
                  </strong>
                  <span>
                    {t('Vérification du', 'Checked on')}{' '}
                    {new Date(reconciliation.checkedAt).toLocaleString(
                      language === 'en' ? 'en-GB' : 'fr-FR',
                    )}{' '}
                    · {reconciliation.checkedOrders} {t('commandes contrôlées', 'orders checked')}
                  </span>
                  {reconciliation.results
                    .filter((result) => result.state !== 'MATCHED')
                    .map((result) => (
                      <article key={result.orderId}>
                        <strong>
                          {t('Commande', 'Order')} {result.orderId.slice(-8)}
                        </strong>
                        {result.issues.map((issue) => (
                          <span key={issue}>{issue}</span>
                        ))}
                      </article>
                    ))}
                </div>
              )}
              <DataTable
                ariaLabel={t('Transactions financières', 'Financial transactions')}
                data={financialTransactions}
                rowKey={(transaction) => transaction.id}
                emptyMessage={t('Aucune transaction financière.', 'No financial transactions.')}
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
                    key: 'type',
                    header: t('Opération', 'Transaction'),
                    sortValue: (transaction) => transaction.type,
                    render: (transaction) => (
                      <div className="data-table__stack">
                        <strong>
                          {transaction.type === 'REFUND'
                            ? t('Remboursement', 'Refund')
                            : t('Paiement', 'Payment')}
                        </strong>
                        <span>
                          {t('Commande', 'Order')} {transaction.order.id.slice(-8)}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: 'status',
                    header: t('Statut / Référence', 'Status / Reference'),
                    sortValue: (transaction) => transaction.status,
                    render: (transaction) => (
                      <div className="data-table__stack">
                        <span>
                          {transaction.status === 'PENDING'
                            ? t('En attente de confirmation', 'Awaiting confirmation')
                            : transaction.status === 'FAILED'
                              ? t('Échec', 'Failed')
                              : t('Confirmé', 'Confirmed')}
                        </span>
                        <small>{transaction.stripeObjectId}</small>
                      </div>
                    ),
                  },
                  {
                    key: 'createdAt',
                    header: t('Date', 'Date'),
                    sortValue: (transaction) => transaction.createdAt,
                    render: (transaction) =>
                      new Date(transaction.createdAt).toLocaleString(
                        language === 'en' ? 'en-GB' : 'fr-FR',
                      ),
                  },
                  {
                    key: 'amount',
                    header: t('Montant', 'Amount'),
                    sortValue: (transaction) => transaction.amountCents,
                    align: 'right',
                    render: (transaction) => (
                      <div className="data-table__stack">
                        <strong>
                          {formatMoney(transaction.amountCents, transaction.currency)}
                        </strong>
                        {transaction.type === 'REFUND' && transaction.status === 'PENDING' && (
                          <button
                            className="text-action"
                            type="button"
                            onClick={() => void retryPendingRefund(transaction)}
                            disabled={loading}
                          >
                            {t('Reprendre', 'Retry')}
                          </button>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </>
          )}
        </section>
      )}
    </section>
  );
}
