import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { formatCents } from '../../shared/utils/formatCurrency';
import { apiRequest, apiSchemas } from '../../shared/api/client';

type AdminUser = {
  id: string;
  publicId: string;
  email: string;
  role: string;
  createdAt: string;
};

type AdminProduct = z.infer<typeof apiSchemas.adminProducts>['products'][number];

type AdminOrder = z.infer<typeof apiSchemas.adminOrders>['orders'][number];
type AdminFinancialTransaction = z.infer<typeof apiSchemas.adminFinancialTransactions>['transactions'][number];

type Section = 'users' | 'products' | 'orders' | 'finances';

const roleResult = z.object({
  user: z.object({ id: z.string(), email: z.string(), role: z.string() }),
});

export function AdminWorkspace() {
  const [dashboard, setDashboard] = useState<z.infer<typeof apiSchemas.adminDashboard> | null>(
    null,
  );
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [financialTransactions, setFinancialTransactions] = useState<AdminFinancialTransaction[]>([]);
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
          : 'Impossible de charger les données administrateur.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
            : 'Impossible de charger les données administrateur.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function refundOrder(order: AdminOrder, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rawAmount = String(form.get('amountCents') ?? '').trim();
    const amountCents = rawAmount ? Number(rawAmount) : undefined;
    if (amountCents !== undefined && (!Number.isSafeInteger(amountCents) || amountCents < 1)) {
      setError('Le montant du remboursement doit être un nombre entier de centimes positif.');
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
          body: JSON.stringify(amountCents === undefined ? {} : { amountCents }),
        },
      );
      if ('pending' in result) setError(result.message);
      else setError(`Remboursement confirmé : ${formatCents(result.refund.amountCents)}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de traiter le remboursement.');
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
      setError(cause instanceof Error ? cause.message : 'Impossible de modifier ce rôle.');
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
        cause instanceof Error ? cause.message : 'Impossible de modifier la visibilité du produit.',
      );
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-heading">
        <div>
          <span className="eyebrow">ATELIER · ADMINISTRATION</span>
          <h1>
            Centre de gestion<span className="brand-period">.</span>
          </h1>
          <p>Vue globale de la boutique, des comptes, du catalogue et des commandes.</p>
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
          <span>Utilisateurs</span>
          <strong>{dashboard?.users ?? '—'}</strong>
          <small>{dashboard?.sellers ?? 0} vendeurs</small>
        </article>
        <article className="kpi-card">
          <span>Catalogue</span>
          <strong>{dashboard?.products ?? '—'}</strong>
          <small>{dashboard?.activeProducts ?? 0} produits publiés</small>
        </article>
        <article className="kpi-card">
          <span>Commandes</span>
          <strong>{dashboard?.orders ?? '—'}</strong>
          <small>{dashboard?.paidOrders ?? 0} paiements confirmés</small>
        </article>
        <article className="kpi-card">
          <span>Chiffre d’affaires encaissé</span>
          <strong>{dashboard ? formatCents(dashboard.revenueCents) : '—'}</strong>
          <small>Commandes payées uniquement</small>
        </article>
      </div>

      <nav className="admin-tabs" aria-label="Sections administrateur">
        <button
          type="button"
          className={section === 'users' ? 'active' : ''}
          onClick={() => setSection('users')}
        >
          Utilisateurs ({users.length})
        </button>
        <button
          type="button"
          className={section === 'products' ? 'active' : ''}
          onClick={() => setSection('products')}
        >
          Produits ({products.length})
        </button>
        <button
          type="button"
          className={section === 'orders' ? 'active' : ''}
          onClick={() => setSection('orders')}
        >
          Commandes ({orders.length})
        </button>
        <button
          type="button"
          className={section === 'finances' ? 'active' : ''}
          onClick={() => setSection('finances')}
        >
          Finances ({financialTransactions.length})
        </button>
      </nav>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p>Chargement des données…</p>
      ) : (
        <section className="seller-panel admin-data-panel">
          {section === 'users' && (
            <>
              <h2>Gestion des comptes</h2>
              {users.map((user) => (
                <article className="admin-row" key={user.id}>
                  <div>
                    <strong>{user.email}</strong>
                    <span>
                      {user.publicId} · Créé le{' '}
                      {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  {user.role === 'ADMIN' ? (
                    <strong className="admin-role">Administrateur</strong>
                  ) : (
                    <select
                      aria-label={`Rôle de ${user.email}`}
                      value={user.role}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === 'CUSTOMER' || value === 'SELLER') {
                          void updateRole(user, value);
                        }
                      }}
                    >
                      <option value="CUSTOMER">Client</option>
                      <option value="SELLER">Vendeur</option>
                    </select>
                  )}
                </article>
              ))}
              {users.length === 0 && <p>Aucun utilisateur.</p>}
            </>
          )}

          {section === 'products' && (
            <>
              <h2>Modération du catalogue</h2>
              {products.map((product) => (
                <article className="admin-row" key={product.id}>
                  <div>
                    <strong>{product.name}</strong>
                    <span>
                      {product.seller?.email ?? 'Sans vendeur'} · {formatCents(product.priceCents)}{' '}
                      · Stock : {product.stock}
                    </span>
                  </div>
                  <button
                    className="text-action"
                    type="button"
                    onClick={() => void toggleProduct(product)}
                  >
                    {product.active ? 'Masquer' : 'Publier'}
                  </button>
                </article>
              ))}
              {products.length === 0 && <p>Aucun produit.</p>}
            </>
          )}

          {section === 'orders' && (
            <>
              <h2>Suivi des commandes</h2>
              {orders.map((order) => (
                <article className="admin-row" key={order.id}>
                  <div>
                    <strong>
                      Commande {order.id.slice(-8)} · {order.customer?.email ?? 'Client'}
                    </strong>
                    <span>
                      {order.items
                        .map((item) => `${item.productName} × ${item.quantity}`)
                        .join(', ')}{' '}
                      · {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                    <span>
                      {order.status} · Paiement : {order.paymentStatus}
                    </span>
                  </div>
                  <div className="admin-order-actions">
                    <strong>{formatCents(order.totalCents)}</strong>
                    {['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus) && (
                      <form onSubmit={(event) => void refundOrder(order, event)}>
                        <label>
                          Montant en centimes (facultatif)
                          <input
                            name="amountCents"
                            type="number"
                            min="1"
                            max={Math.max(0, order.totalCents - (order.refundedCents ?? 0))}
                            step="1"
                            placeholder="Solde complet"
                          />
                        </label>
                        <button className="text-action" type="submit" disabled={loading}>
                          Rembourser
                        </button>
                      </form>
                    )}
                  </div>
                </article>
              ))}
              {orders.length === 0 && <p>Aucune commande.</p>}
            </>
          )}

          {section === 'finances' && (
            <>
              <h2>Historique financier</h2>
              {financialTransactions.map((transaction) => (
                <article className="admin-row" key={transaction.id}>
                  <div>
                    <strong>
                      {transaction.type === 'REFUND' ? 'Remboursement' : 'Paiement'} ·{' '}
                      Commande {transaction.order.id.slice(-8)}
                    </strong>
                    <span>
                      {transaction.status === 'PENDING'
                        ? 'En attente de confirmation'
                        : transaction.status === 'FAILED'
                          ? 'Échec'
                          : 'Confirmé'}{' '}
                      · {transaction.stripeObjectId}
                    </span>
                    <span>{new Date(transaction.createdAt).toLocaleString('fr-FR')}</span>
                  </div>
                  <strong>{formatCents(transaction.amountCents, transaction.currency)}</strong>
                </article>
              ))}
              {financialTransactions.length === 0 && <p>Aucune transaction financière.</p>}
            </>
          )}
        </section>
      )}
    </section>
  );
}
