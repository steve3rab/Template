import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { formatCents } from '../../shared/utils/formatCurrency';
import { translateText, type Language } from '../../shared/i18n';

import {
  apiRequest,
  apiRequestVoid,
  apiSchemas,
  type CustomerAddress as Address,
  type SellerOrder as Order,
} from '../../shared/api/client';

function orderStatusLabel(status: Order['status'], paymentStatus: string, language: Language): string {
  const t = (fr: string, en: string) => translateText(language, fr, en);
  switch (status) {
    case 'PENDING':
      if (paymentStatus.toUpperCase() === 'PAID') {
        return t('Paiement confirmé · préparation à venir', 'Payment confirmed · processing soon');
      }
      return paymentStatus.toUpperCase() === 'UNPAID'
        ? t('En attente de paiement', 'Awaiting payment')
        : t('Commande en cours de confirmation', 'Order confirmation in progress');
    case 'PROCESSING':
      return t('En préparation', 'Processing');
    case 'SHIPPED':
      return t('Expédiée', 'Shipped');
    case 'DELIVERED':
      return t('Livrée', 'Delivered');
    case 'CANCELLED':
      return t('Annulée', 'Cancelled');
  }
}

function paymentStatusLabel(status: string, language: Language): string {
  const t = (fr: string, en: string) => translateText(language, fr, en);
  switch (status.toUpperCase()) {
    case 'PAID':
      return t('Payé', 'Paid');
    case 'UNPAID':
      return t('À régler', 'Unpaid');
    case 'REFUNDED':
      return t('Remboursé', 'Refunded');
    case 'PARTIALLY_REFUNDED':
      return t('Partiellement remboursé', 'Partially refunded');
    case 'FAILED':
      return t('Échec du paiement', 'Payment failed');
    default:
      return t('Statut indisponible', 'Status unavailable');
  }
}

export function CustomerAccountData({ language = 'fr' }: { language?: Language }) {
  const languageRef = useRef(language);
  languageRef.current = language;
  const t = (fr: string, en: string) => translateText(languageRef.current, fr, en);
  const formatMoney = (amount: number, currency = 'EUR') =>
    formatCents(amount, currency, languageRef.current === 'en' ? 'en-GB' : 'fr-FR');
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
        t('Impossible de charger vos commandes et adresses. Vérifiez la connexion puis réessayez.', 'Unable to load your orders and addresses. Check your connection and try again.'),
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
      setMessage(error instanceof Error ? error.message : t('Impossible de préparer le paiement.', 'Unable to prepare payment.'));
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
          label: String(form.get('label') ?? (languageRef.current === 'en' ? 'Home' : 'Domicile')),
          recipient: String(form.get('recipient') ?? ''),
          line1: String(form.get('line1') ?? ''),
          postalCode: String(form.get('postalCode') ?? ''),
          city: String(form.get('city') ?? ''),
          country: 'FR',
          isDefault: addresses.length === 0,
        }),
      });
    } catch {
      setMessage(t('Adresse non enregistrée. Vérifiez les champs.', 'Address not saved. Check the fields.'));
      return;
    }
    formElement.reset();
    setMessage(t('Adresse enregistrée.', 'Address saved.'));
    await load();
  }

  async function removeAddress(id: string) {
    try {
      await apiRequestVoid(`/api/customer/addresses/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await load();
    } catch {
      setMessage(t('Impossible de supprimer cette adresse.', 'Unable to delete this address.'));
    }
  }

  return (
    <section className="seller-panel" style={{ marginTop: 24 }}>
      <h2>{t('Mes commandes et adresses', 'My orders and addresses')}</h2>
      {!available && !loadFailed ? (
        <p>{t('Connectez-vous pour consulter votre historique et vos adresses enregistrées.', 'Sign in to view your order history and saved addresses.')}</p>
      ) : loadFailed ? (
        <p role="alert">{message}</p>
      ) : (
        <>
          <h3>{t('Historique des commandes', 'Order history')}</h3>
          {orders.some(
            (order) => order.paymentStatus === 'UNPAID' && order.status === 'PENDING',
          ) && (
            <button
              className="dark-button"
              type="button"
              disabled={checkoutPending}
              onClick={() => void payUnpaidOrders()}
            >
              {checkoutPending ? t('Préparation du paiement…', 'Preparing payment…') : t('Payer mes commandes en attente', 'Pay my outstanding orders')}
            </button>
          )}
          {orders.length === 0 ? (
            <p>{t('Vous n’avez pas encore de commande.', 'You have no orders yet.')}</p>
          ) : (
            orders.map((order) => (
              <article className="best-seller-row" key={order.id}>
                <div className="best-seller-name">
                  <strong>{t('Commande', 'Order')} {order.id.slice(-8)}</strong>
                  <span>
                    {new Date(order.createdAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR')} ·{' '}
                    {orderStatusLabel(order.status, order.paymentStatus, language)} · {t('Paiement :', 'Payment:')}{' '}
                    {paymentStatusLabel(order.paymentStatus, language)}
                  </span>
                  <span>
                    {order.items.map((item) => item.productName + ' × ' + item.quantity).join(', ')}
                  </span>
                </div>
                <div>
                  <strong>{formatMoney(order.totalCents)}</strong>
                  {order.financialTransactions && order.financialTransactions.length > 0 && (
                    <div className="financial-history" aria-label={t('Historique financier', 'Financial history')}>
                      {order.financialTransactions.map((transaction) => (
                        <span key={transaction.id}>
                          {transaction.type === 'REFUND' ? t('Remboursement', 'Refund') : t('Paiement', 'Payment')} ·{' '}
                          {formatMoney(transaction.amountCents)} ·{' '}
                          {transaction.status === 'PENDING' ? t('En cours', 'Pending') : t('Confirmé', 'Confirmed')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
          <h3 style={{ marginTop: 24 }}>{t('Adresses enregistrées', 'Saved addresses')}</h3>
          {addresses.map((address) => (
            <article className="best-seller-row" key={address.id}>
              <div className="best-seller-name">
                <strong>
                  {address.label}
                  {address.isDefault ? ` · ${t('Par défaut', 'Default')}` : ''}
                </strong>
                <span>
                  {address.recipient}, {address.line1}, {address.postalCode} {address.city},{' '}
                  {address.country}
                </span>
              </div>
              <button className="text-action" onClick={() => void removeAddress(address.id)}>
                {t('Supprimer', 'Delete')}
              </button>
            </article>
          ))}
          <form
            className="checkout-form"
            onSubmit={(event) => void addAddress(event)}
            style={{ marginTop: 16 }}
          >
            <h3>{t('Ajouter une adresse', 'Add an address')}</h3>
            <label>
              {t('Libellé', 'Label')}
              <input name="label" defaultValue={t("Domicile", "Home")} required maxLength={60} />
            </label>
            <label>
              {t('Destinataire', 'Recipient')}
              <input name="recipient" required minLength={2} maxLength={120} />
            </label>
            <label>
              {t('Adresse', 'Address')}
              <input name="line1" required minLength={3} maxLength={180} />
            </label>
            <div className="form-two-col">
              <label>
                {t('Code postal', 'Postal code')}
                <input name="postalCode" required maxLength={20} />
              </label>
              <label>
                {t('Ville', 'City')}
                <input name="city" required maxLength={100} />
              </label>
            </div>
            <button className="dark-button" type="submit">
              {t('Enregistrer l’adresse', 'Save address')}
            </button>
          </form>
        </>
      )}
      {message && !loadFailed && <p role="status">{message}</p>}
    </section>
  );
}
