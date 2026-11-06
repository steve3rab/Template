import { useCallback, useEffect, useState, useRef, type FormEvent } from 'react';
import { z } from 'zod';
import { formatCents } from '../../shared/utils/formatCurrency';
import { apiRequest, apiSchemas } from '../../shared/api/client';
import { translateText, type Language } from '../../shared/i18n';

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
  const languageRef = useRef(language);
  languageRef.current = language;
  const t = (fr: string, en: string) => translateText(languageRef.current, fr, en);
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

  const load = useCallback(async () => {
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
          : t('Impossible de charger les données administrateur.', 'Unable to load administrator data.'),
      );
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest('/api/admin/dashboard', apiSchemas.adminDashboard),
      apiRequest('/api/admin/users', apiSchemas.adminUsers),
      apiRequest('/api/admin/products', apiSchemas.adminProducts),
      apiRequest('/api/admin/orders', apiSchemas.adminOrders),
      apiRequest('/api/admin/financial-transactions', apiSchemas.adminFinancialTransactions),
    ])
      .then(([stats, userData, productData, orderData, financialData]) => {
        if (!active) return;
        setDashboard(stats);
        setUsers(userData.users);
        setProducts(productData.products);
        setOrders(orderData.orders);
        setFinancialTransactions(financialData.transactions);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : t('Impossible de charger les données administrateur.', 'Unable to load administrator data.'),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function retryPendingRefund(transaction: AdminFinancialTransaction) {
    if (!transaction.requestKey) {
      setError(t('Cette demande de remboursement ne possède pas de clé de reprise.', 'This refund request has no retry key.'));
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
          : `${t('Remboursement confirmé :', 'Refund confirmed:')} ${formatCents(result.refund.amountCents)}.`,
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t('Impossible de reprendre le remboursement.', 'Unable to retry the refund.'),
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
        cause instanceof Error ? cause.message : t('Impossible de rapprocher les paiements Stripe.', 'Unable to reconcile Stripe payments.'),
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
      setError(t('Le montant du remboursement doit être un nombre entier de centimes positif.', 'The refund amount must be a positive whole number of cents.'));
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
        setError(`${t('Remboursement confirmé :', 'Refund confirmed:')} ${formatCents(result.refund.amountCents)}.`);
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
      setError(cause instanceof Error ? cause.message : t('Impossible de traiter le remboursement.', 'Unable to process the refund.'));
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
      setError(cause instanceof Error ? cause.message : t('Impossible de modifier ce rôle.', 'Unable to change this role.'));
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
        cause instanceof Error ? cause.message : t('Impossible de modifier la visibilité du produit.', 'Unable to change product visibility.'),
      );
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-heading">
        <div>
          <span className="eyebrow">ATELIER · {t('ADMINISTRATION', 'ADMIN')}</span>
          <h1>
            {t('Centre de gestion', 'Management centre')}<span className="brand-period">.</span>
          </h1>
          <p>{t('Vue globale de la boutique, des comptes, du catalogue et des commandes.', 'Overview of the store, accounts, catalogue and orders.')}</p>
        </div>
        <button
          className="outline-button"
          type="button"
          onClick={() => {
            setLoading(true);
            setError('');
            void load();
          }}
          disabled={loading}
        >
          Actualiser
        </button>
      </header>

      <div className="admin-kpis">
        <article className="kpi-card">
          <span>{t('Utilisateurs', 'Users')}</span>
          <strong>{dashboard?.users ?? '—'}</strong>
          <small>{dashboard?.sellers ?? 0} {t('vendeurs', 'sellers')}</small>
        </article>
        <article className="kpi-card">
          <span>{t('Catalogue', 'Catalogue')}</span>
          <strong>{dashboard?.products ?? '—'}</strong>
          <small>{dashboard?.activeProducts ?? 0} {t('produits publiés', 'published products')}</small>
        </article>
        <article className="kpi-card">
          <span>{t('Commandes', 'Orders')}</span>
          <strong>{dashboard?.orders ?? '—'}</strong>
          <small>{dashboard?.paidOrders ?? 0} {t('paiements confirmés', 'confirmed payments')}</small>
        </article>
        <article className="kpi-card">
          <span>{t('Chiffre d’affaires encaissé', 'Collected revenue')}</span>
          <strong>{dashboard ? formatCents(dashboard.revenueCents) : '—'}</strong>
          <small>{t('Commandes payées uniquement', 'Paid orders only')}</small>
        </article>
      </div>

      <nav className="admin-tabs" aria-label={t('Sections administrateur', 'Administrator sections')}>
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

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p>{t('Chargement des données…', 'Loading data…')}</p>
      ) : (
        <section className="seller-panel admin-data-panel">
          {section === 'users' && (
            <>
              <h2>{t('Gestion des comptes', 'Account management')}</h2>
              {users.map((user) => (
                <article className="admin-row" key={user.id}>
                  <div>
                    <strong>{user.email}</strong>
                    <span>
                      {user.publicId} · {t('Créé le', 'Created on')}{' '}
                      {new Date(user.createdAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR')}
                    </span>
                  </div>
                  {user.role === 'ADMIN' ? (
                    <strong className="admin-role">{t('Administrateur', 'Administrator')}</strong>
                  ) : (
                    <select
                      aria-label={t(`Rôle de ${user.email}`, `Role for ${user.email}`)}
                      value={user.role}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === 'CUSTOMER' || value === 'SELLER') {
                          void updateRole(user, value);
                        }
                      }}
                    >
                      <option value="CUSTOMER">{t('Client', 'Customer')}</option>
                      <option value="SELLER">{t('Vendeur', 'Seller')}</option>
                    </select>
                  )}
                </article>
              ))}
              {users.length === 0 && <p>{t('Aucun utilisateur.', 'No users.')}</p>}
            </>
          )}

          {section === 'products' && (
            <>
              <h2>{t('Modération du catalogue', 'Catalogue moderation')}</h2>
              {products.map((product) => (
                <article className="admin-row" key={product.id}>
                  <div>
                    <strong>{product.name}</strong>
                    <span>
                      {product.seller?.email ?? t('Sans vendeur', 'No seller')} · {formatCents(product.priceCents)}{' '}
                      · {t('Stock :', 'Stock:')} {product.stock}
                    </span>
                  </div>
                  <button
                    className="text-action"
                    type="button"
                    onClick={() => void toggleProduct(product)}
                  >
                    {product.active ? t('Masquer', 'Hide') : t('Publier', 'Publish')}
                  </button>
                </article>
              ))}
              {products.length === 0 && <p>{t('Aucun produit.', 'No products.')}</p>}
            </>
          )}

          {section === 'orders' && (
            <>
              <h2>{t('Suivi des commandes', 'Order tracking')}</h2>
              {orders.map((order) => (
                <article className="admin-row" key={order.id}>
                  <div>
                    <strong>
                      {t('Commande', 'Order')} {order.id.slice(-8)} · {order.customer?.email ?? t('Client', 'Customer')}
                    </strong>
                    <span>
                      {order.items
                        .map((item) => `${item.productName} × ${item.quantity}`)
                        .join(', ')}{' '}
                      · {new Date(order.createdAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR')}
                    </span>
                    <span>
                      {({ PENDING: t('En attente', 'Pending'), PROCESSING: t('En préparation', 'Processing'), SHIPPED: t('Expédiée', 'Shipped'), DELIVERED: t('Livrée', 'Delivered'), CANCELLED: t('Annulée', 'Cancelled') } as Record<string, string>)[order.status] ?? order.status} · {t('Paiement :', 'Payment:')} {({ PAID: t('Payé', 'Paid'), UNPAID: t('À régler', 'Unpaid'), REFUNDED: t('Remboursé', 'Refunded'), PARTIALLY_REFUNDED: t('Partiellement remboursé', 'Partially refunded'), FAILED: t('Échec', 'Failed') } as Record<string, string>)[order.paymentStatus] ?? order.paymentStatus}
                    </span>
                  </div>
                  <div className="admin-order-actions">
                    <strong>{formatCents(order.totalCents)}</strong>
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
                </article>
              ))}
              {orders.length === 0 && <p>{t('Aucune commande.', 'No orders.')}</p>}
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
                    {reconciliation.matched} {t('rapprochées', 'matched')} · {reconciliation.discrepancies} {t('écarts', 'discrepancies')} ·{' '}
                    {reconciliation.unverified} {t('non vérifiées', 'unverified')}
                  </strong>
                  <span>
                    {t('Vérification du', 'Checked on')} {new Date(reconciliation.checkedAt).toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR')} ·{' '}
                    {reconciliation.checkedOrders} {t('commandes contrôlées', 'orders checked')}
                  </span>
                  {reconciliation.results
                    .filter((result) => result.state !== 'MATCHED')
                    .map((result) => (
                      <article key={result.orderId}>
                        <strong>{t('Commande', 'Order')} {result.orderId.slice(-8)}</strong>
                        {result.issues.map((issue) => (
                          <span key={issue}>{issue}</span>
                        ))}
                      </article>
                    ))}
                </div>
              )}
              {financialTransactions.map((transaction) => (
                <article className="admin-row" key={transaction.id}>
                  <div>
                    <strong>
                      {transaction.type === 'REFUND' ? t('Remboursement', 'Refund') : t('Paiement', 'Payment')} · {t('Commande', 'Order')}{' '}
                      {transaction.order.id.slice(-8)}
                    </strong>
                    <span>
                      {transaction.status === 'PENDING'
                        ? t('En attente de confirmation', 'Awaiting confirmation')
                        : transaction.status === 'FAILED'
                          ? t('Échec', 'Failed')
                          : t('Confirmé', 'Confirmed')}{' '}
                      · {transaction.stripeObjectId}
                    </span>
                    <span>{new Date(transaction.createdAt).toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR')}</span>
                  </div>
                  <div className="admin-order-actions">
                    <strong>{formatCents(transaction.amountCents, transaction.currency)}</strong>
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
                </article>
              ))}
              {financialTransactions.length === 0 && <p>{t('Aucune transaction financière.', 'No financial transactions.')}</p>}
            </>
          )}
        </section>
      )}
    </section>
  );
}
