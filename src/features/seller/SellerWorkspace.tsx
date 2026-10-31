import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { formatCents } from '../../shared/utils/formatCurrency';

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

export function SellerWorkspace({ range }: { range: string }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Vêtements');
  const [price, setPrice] = useState('29.90');
  const [stock, setStock] = useState('10');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [stats, productPayload, orderPayload] = await Promise.all([
        apiRequest(`/api/seller/dashboard?days=${range}`, apiSchemas.sellerDashboard),
        apiRequest('/api/seller/products', apiSchemas.products),
        apiRequest('/api/seller/orders', apiSchemas.sellerOrders),
      ]);
      setDashboard(stats);
      setProducts(productPayload.products);
      setOrders(orderPayload.orders);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        window.dispatchEvent(new CustomEvent('template-toast', { detail: { message: 'Votre session ou vos droits vendeur ne sont plus valides. Reconnectez-vous.', type: 'error' } }));
        return;
      }
      window.dispatchEvent(new CustomEvent('template-toast', { detail: { message: error instanceof Error ? error.message : 'Impossible de charger les données du vendeur.', type: 'error' } }));
    }
  }, [range]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => load())
      .catch(() => window.dispatchEvent(new CustomEvent('template-toast', { detail: { message: 'Erreur réseau pendant le chargement du tableau de bord.', type: 'error' } })));
  }, [load]);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiRequest('/api/seller/products', apiSchemas.productResult, {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          category,
          priceCents: Math.round(Number(price) * 100),
          stock: Number(stock),
          active: true,
        }),
      });
      setName('');
      setDescription('');
      setPrice('29.90');
      setStock('10');
      window.dispatchEvent(new CustomEvent('template-toast', { detail: { message: 'Produit créé.', type: 'success' } }));
      await load();
    } catch (error) {
      window.dispatchEvent(new CustomEvent('template-toast', { detail: { message: error instanceof Error ? error.message : 'Erreur lors de la création.', type: 'error' } }));
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
      window.dispatchEvent(new CustomEvent('template-toast', { detail: { message: error instanceof Error ? error.message : 'Erreur réseau.', type: 'error' } }));
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
      window.dispatchEvent(new CustomEvent('template-toast', { detail: { message: error instanceof Error ? error.message : 'Impossible de modifier le statut de cette commande.', type: 'error' } }));
    }
  }

  return (
    <section className="seller-page">
      <div className="seller-topline">
        <div>
          <span className="eyebrow">ATELIER · ESPACE VENDEUR</span>
          <h1>Tableau de bord<span className="brand-period">.</span></h1>
          <p>Indicateurs calculés à partir des commandes et produits enregistrés.</p>
        </div>
      </div>
      <div className="kpi-grid">
        <article className="kpi-card"><div className="kpi-label">Chiffre d’affaires payé</div><strong>{dashboard ? formatCents(dashboard.revenueCents) : '—'}</strong><p>{dashboard?.paidOrders ?? 0} commandes payées sur {dashboard?.periodDays ?? Number(range)} jours</p></article>
        <article className="kpi-card"><div className="kpi-label">Commandes</div><strong>{dashboard?.orders ?? '—'}</strong><p>Commandes sur la période sélectionnée</p></article>
        <article className="kpi-card"><div className="kpi-label">Unités vendues</div><strong>{dashboard?.unitsSold ?? '—'}</strong><p>Basé sur les lignes de commande</p></article>
        <article className="kpi-card"><div className="kpi-label">Catalogue</div><strong>{dashboard?.products ?? '—'}</strong><p>{dashboard?.lowStockProducts ?? 0} produit(s) avec stock inférieur ou égal à 5</p></article>
      </div>
      <section className="seller-panel" style={{ marginTop: 24 }}>
        <div className="panel-heading"><div><h2>Ajouter un produit</h2><p>Les prix sont saisis en euros et enregistrés en centimes.</p></div></div>
        <form className="checkout-form" onSubmit={(event) => void createProduct(event)}>
          <label>Nom du produit<input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Description<textarea maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <div className="form-two-col">
            <label>Catégorie<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Vêtements</option><option>Chaussures</option><option>Accessoires</option><option>Maison</option></select></label>
            <label>Prix (€)<input required type="number" min="0.01" max="1000000" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
            <label>Stock initial<input required type="number" min="0" max="1000000" step="1" value={stock} onChange={(event) => setStock(event.target.value)} /></label>
          </div>
          <button className="dark-button" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Créer le produit'}</button>
        </form>
      </section>
      <section className="seller-panel" style={{ marginTop: 24 }}>
        <div className="panel-heading"><div><h2>Mes produits</h2><p>{products.length} produit(s) géré(s) par ce compte</p></div></div>
        {products.length === 0 ? <p>Aucun produit pour le moment. Ajoutez votre premier produit ci-dessus.</p> : products.map((product) => (
          <div className="best-seller-row" key={product.id}>
            <div className="best-seller-name"><strong>{product.name}</strong><span>{formatCents(product.priceCents)} · {product.active ? 'Publié' : 'Masqué'}</span></div>
            <label>Nom <input aria-label={`Nom ${product.name}`} defaultValue={product.name} maxLength={120} onBlur={(event) => { const value = event.target.value.trim(); if (value.length >= 2 && value !== product.name) void updateProduct(product, { name: value }); }} /></label>
            <label>Prix (€) <input aria-label={`Prix ${product.name}`} type="number" min="0.01" max="1000000" step="0.01" defaultValue={(product.priceCents / 100).toFixed(2)} onBlur={(event) => { const value = Number(event.target.value); const cents = Math.round(value * 100); if (Number.isFinite(value) && cents > 0 && cents !== product.priceCents) void updateProduct(product, { priceCents: cents }); }} /></label>
            <label>Stock <input aria-label={`Stock ${product.name}`} type="number" min="0" max="1000000" defaultValue={product.stock} onBlur={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0 && value !== product.stock) void updateProduct(product, { stock: value }); }} /></label>
            <button className="text-action" onClick={() => void updateProduct(product, { active: !product.active })}>{product.active ? 'Masquer' : 'Publier'}</button>
          </div>
        ))}
      </section>
      <section className="seller-panel" style={{ marginTop: 24 }}>
        <div className="panel-heading"><div><h2>Commandes clients</h2><p>Suivez la préparation et l’expédition des commandes contenant vos produits.</p></div></div>
        {orders.length === 0 ? <p>Aucune commande enregistrée pour le moment.</p> : orders.map((order) => (
          <div className="best-seller-row" key={order.id}>
            <div className="best-seller-name"><strong>Commande {order.id.slice(-8)}</strong><span>{order.customer?.email ?? 'Client'} · {order.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ')}</span><span>{new Date(order.createdAt).toLocaleDateString('fr-FR')} · Paiement : {order.paymentStatus}</span></div>
            <strong>{formatCents(order.totalCents)}</strong>
            <label>Statut<select aria-label={`Statut commande ${order.id}`} value={order.status} disabled={order.status === 'DELIVERED' || order.status === 'CANCELLED'} onChange={(event) => {
                const parsedStatus = orderStatusSchema.safeParse(event.target.value);
                if (parsedStatus.success) void updateOrder(order.id, parsedStatus.data);
              }}><option value="PENDING">En attente</option><option value="PROCESSING" disabled={order.paymentStatus !== 'PAID'}>En préparation</option><option value="SHIPPED" disabled={order.paymentStatus !== 'PAID'}>Expédiée</option><option value="DELIVERED" disabled={order.paymentStatus !== 'PAID'}>Livrée</option><option value="CANCELLED">Annulée</option></select></label>
          </div>
        ))}
      </section>
      <p className="fine-print">Le paiement en ligne et les webhooks de confirmation ne sont pas encore configurés ; le chiffre d’affaires payé reste à zéro tant qu’aucun paiement n’est confirmé.</p>
    </section>
  );
}
