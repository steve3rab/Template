import { useEffect, useState, type FormEvent } from 'react';

type Address = { id: string; label: string; recipient: string; line1: string; postalCode: string; city: string; country: string; isDefault: boolean };
type Order = { id: string; status: string; paymentStatus: string; totalCents: number; createdAt: string; items: { id: string; productName: string; quantity: number; unitPriceCents: number }[] };
const money = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

export function CustomerAccountData() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [available, setAvailable] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    const [addressResponse, orderResponse] = await Promise.all([
      fetch('/api/customer/addresses', { credentials: 'include' }),
      fetch('/api/customer/orders', { credentials: 'include' }),
    ]);
    if (!addressResponse.ok || !orderResponse.ok) return;
    const [addressPayload, orderPayload] = await Promise.all([
      addressResponse.json() as Promise<{ addresses: Address[] }>,
      orderResponse.json() as Promise<{ orders: Order[] }>,
    ]);
    setAddresses(addressPayload.addresses);
    setOrders(orderPayload.orders);
    setAvailable(true);
  }

  useEffect(() => { void load().catch(() => undefined); }, []);

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch('/api/customer/addresses', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: String(form.get('label') ?? 'Domicile'), recipient: String(form.get('recipient') ?? ''),
        line1: String(form.get('line1') ?? ''), postalCode: String(form.get('postalCode') ?? ''),
        city: String(form.get('city') ?? ''), country: 'FR', isDefault: addresses.length === 0,
      }),
    });
    if (!response.ok) { setMessage('Adresse non enregistrée. Vérifiez les champs.'); return; }
    formElement.reset();
    setMessage('Adresse enregistrée.');
    await load();
  }

  async function removeAddress(id: string) {
    const response = await fetch('/api/customer/addresses/' + id, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) { setMessage('Impossible de supprimer cette adresse.'); return; }
    await load();
  }

  return (
    <section className="seller-panel" style={{ marginTop: 24 }}>
      <h2>Mes commandes et adresses</h2>
      {!available ? <p>Connectez-vous pour consulter votre historique et vos adresses enregistrées.</p> : (
        <>
          <h3>Historique des commandes</h3>
          {orders.length === 0 ? <p>Vous n’avez pas encore de commande.</p> : orders.map((order) => (
            <article className="best-seller-row" key={order.id}>
              <div className="best-seller-name"><strong>Commande {order.id.slice(-8)}</strong><span>{new Date(order.createdAt).toLocaleDateString('fr-FR')} · {order.status} · Paiement : {order.paymentStatus}</span><span>{order.items.map((item) => item.productName + ' × ' + item.quantity).join(', ')}</span></div>
              <strong>{money(order.totalCents)}</strong>
            </article>
          ))}
          <h3 style={{ marginTop: 24 }}>Adresses enregistrées</h3>
          {addresses.map((address) => (
            <article className="best-seller-row" key={address.id}>
              <div className="best-seller-name"><strong>{address.label}{address.isDefault ? ' · Par défaut' : ''}</strong><span>{address.recipient}, {address.line1}, {address.postalCode} {address.city}, {address.country}</span></div>
              <button className="text-action" onClick={() => void removeAddress(address.id)}>Supprimer</button>
            </article>
          ))}
          <form className="checkout-form" onSubmit={(event) => void addAddress(event)} style={{ marginTop: 16 }}>
            <h3>Ajouter une adresse</h3>
            <label>Libellé<input name="label" defaultValue="Domicile" required maxLength={60} /></label>
            <label>Destinataire<input name="recipient" required minLength={2} maxLength={120} /></label>
            <label>Adresse<input name="line1" required minLength={3} maxLength={180} /></label>
            <div className="form-two-col"><label>Code postal<input name="postalCode" required maxLength={20} /></label><label>Ville<input name="city" required maxLength={100} /></label></div>
            <button className="dark-button" type="submit">Enregistrer l’adresse</button>
          </form>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
