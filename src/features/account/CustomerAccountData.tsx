import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { formatCents } from '../../shared/utils/formatCurrency';

import {
  apiRequest,
  apiRequestVoid,
  apiSchemas,
  type CustomerAddress as Address,
  type SellerOrder as Order,
} from '../../shared/api/client';

export function CustomerAccountData() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [available, setAvailable] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [checkoutPending, setCheckoutPending] = useState(false);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const [addressPayload, orderPayload] = await Promise.all([
        apiRequest('/api/customer/addresses', apiSchemas.customerAddresses),
        apiRequest('/api/customer/orders', apiSchemas.customerOrders),
      ]);
      if (version !== loadVersion.current) return;
      setAddresses(addressPayload.addresses);
      setOrders(orderPayload.orders);
      setAvailable(true);
      setLoadFailed(false);
      setMessage('');
    } catch {
      // A temporary API/database failure is not an empty account. Preserve the
      // last known data and show a recoverable error instead of erasing the UI.
      if (version !== loadVersion.current) return;
      setLoadFailed(true);
      setMessage(
        'Impossible de charger vos commandes et adresses. Vérifiez la connexion puis réessayez.',
      );
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = (event?: Event) => {
      const authenticated =
        event instanceof CustomEvent ? event.detail?.authenticated === true : false;
      if (!event) {
        void fetch('/api/auth/me', { credentials: 'include' })
          .then((response) => {
            if (!active) return;
            if (response.ok) void load();
            else {
              loadVersion.current += 1;
              setAddresses([]);
              setOrders([]);
              setAvailable(false);
              setLoadFailed(false);
              setMessage('');
            }
          })
          .catch(() => {
            if (active) setAvailable(false);
          });
        return;
      }
      loadVersion.current += 1;
      if (authenticated) void load();
      else {
        setAddresses([]);
        setOrders([]);
        setAvailable(false);
        setLoadFailed(false);
        setMessage('');
      }
    };
    refresh();
    const onAuthChanged = (event: Event) => refresh(event);
    window.addEventListener('template-auth-changed', onAuthChanged);
    return () => {
      active = false;
      window.removeEventListener('template-auth-changed', onAuthChanged);
    };
  }, [load]);

  async function payUnpaidOrders() {
    const orderIds = orders
      .filter((order) => order.paymentStatus === 'UNPAID' && order.status === 'PENDING')
      .map((order) => order.id);
    if (orderIds.length === 0) return;
    setCheckoutPending(true);
    setMessage('');
    try {
      const checkout = await apiRequest('/api/customer/checkout', apiSchemas.checkoutSession, {
        method: 'POST',
        body: JSON.stringify({ orderIds }),
      });
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Impossible de préparer le paiement.');
      setCheckoutPending(false);
    }
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await apiRequest('/api/customer/addresses', apiSchemas.addressCreated, {
        method: 'POST',
        body: JSON.stringify({
          label: String(form.get('label') ?? 'Domicile'),
          recipient: String(form.get('recipient') ?? ''),
          line1: String(form.get('line1') ?? ''),
          postalCode: String(form.get('postalCode') ?? ''),
          city: String(form.get('city') ?? ''),
          country: 'FR',
          isDefault: addresses.length === 0,
        }),
      });
    } catch {
      setMessage('Adresse non enregistrée. Vérifiez les champs.');
      return;
    }
    formElement.reset();
    setMessage('Adresse enregistrée.');
    await load();
  }

  async function removeAddress(id: string) {
    try {
      await apiRequestVoid(`/api/customer/addresses/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await load();
    } catch {
      setMessage('Impossible de supprimer cette adresse.');
    }
  }

  return (
    <section className="seller-panel" style={{ marginTop: 24 }}>
      <h2>Mes commandes et adresses</h2>
      {!available && !loadFailed ? (
        <p>Connectez-vous pour consulter votre historique et vos adresses enregistrées.</p>
      ) : loadFailed ? (
        <p role="alert">{message}</p>
      ) : (
        <>
          <h3>Historique des commandes</h3>
          {orders.some(
            (order) => order.paymentStatus === 'UNPAID' && order.status === 'PENDING',
          ) && (
            <button
              className="dark-button"
              type="button"
              disabled={checkoutPending}
              onClick={() => void payUnpaidOrders()}
            >
              {checkoutPending ? 'Préparation du paiement…' : 'Payer mes commandes en attente'}
            </button>
          )}
          {orders.length === 0 ? (
            <p>Vous n’avez pas encore de commande.</p>
          ) : (
            orders.map((order) => (
              <article className="best-seller-row" key={order.id}>
                <div className="best-seller-name">
                  <strong>Commande {order.id.slice(-8)}</strong>
                  <span>
                    {new Date(order.createdAt).toLocaleDateString('fr-FR')} · {order.status} ·
                    Paiement : {order.paymentStatus}
                  </span>
                  <span>
                    {order.items.map((item) => item.productName + ' × ' + item.quantity).join(', ')}
                  </span>
                </div>
                <strong>{formatCents(order.totalCents)}</strong>
              </article>
            ))
          )}
          <h3 style={{ marginTop: 24 }}>Adresses enregistrées</h3>
          {addresses.map((address) => (
            <article className="best-seller-row" key={address.id}>
              <div className="best-seller-name">
                <strong>
                  {address.label}
                  {address.isDefault ? ' · Par défaut' : ''}
                </strong>
                <span>
                  {address.recipient}, {address.line1}, {address.postalCode} {address.city},{' '}
                  {address.country}
                </span>
              </div>
              <button className="text-action" onClick={() => void removeAddress(address.id)}>
                Supprimer
              </button>
            </article>
          ))}
          <form
            className="checkout-form"
            onSubmit={(event) => void addAddress(event)}
            style={{ marginTop: 16 }}
          >
            <h3>Ajouter une adresse</h3>
            <label>
              Libellé
              <input name="label" defaultValue="Domicile" required maxLength={60} />
            </label>
            <label>
              Destinataire
              <input name="recipient" required minLength={2} maxLength={120} />
            </label>
            <label>
              Adresse
              <input name="line1" required minLength={3} maxLength={180} />
            </label>
            <div className="form-two-col">
              <label>
                Code postal
                <input name="postalCode" required maxLength={20} />
              </label>
              <label>
                Ville
                <input name="city" required maxLength={100} />
              </label>
            </div>
            <button className="dark-button" type="submit">
              Enregistrer l’adresse
            </button>
          </form>
        </>
      )}
      {message && !loadFailed && <p role="status">{message}</p>}
    </section>
  );
}
