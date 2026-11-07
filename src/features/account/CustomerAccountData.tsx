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

function orderStatusLabel(
  status: Order['status'],
  paymentStatus: string,
  language: Language,
): string {
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
  const t = useCallback((fr: string, en: string) => translateText(language, fr, en), [language]);
  const formatMoney = (amount: number, currency = 'EUR') =>
    formatCents(amount, currency, language === 'en' ? 'en-GB' : 'fr-FR');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [available, setAvailable] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [addressPending, setAddressPending] = useState(false);
  const [addressActionId, setAddressActionId] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const visibleOrders = orders.filter(
    (order) =>
      `${order.id} ${order.items.map((item) => item.productName).join(' ')}`
        .toLocaleLowerCase()
        .includes(orderSearch.trim().toLocaleLowerCase()) &&
      (orderStatusFilter === 'all' || order.status === orderStatusFilter),
  );
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadFailed(false);
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
        t(
          'Impossible de charger vos commandes et adresses. Vérifiez la connexion puis réessayez.',
          'Unable to load your orders and addresses. Check your connection and try again.',
        ),
      );
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let active = true;
    const refresh = (event?: Event) => {
      const authenticated =
        event instanceof CustomEvent ? event.detail?.authenticated === true : false;
      if (!event) {
        setAuthChecking(true);
        void fetch('/api/auth/me', { credentials: 'include' })
          .then((response) => {
            if (!active) return;
            setAuthChecking(false);
            if (response.ok) void load();
            else {
              loadVersion.current += 1;
              setAddresses([]);
              setOrders([]);
              setAvailable(false);
              setLoading(false);
              setLoadFailed(false);
              setMessage('');
            }
          })
          .catch(() => {
            if (!active) return;
            setAuthChecking(false);
            setAvailable(false);
            setLoading(false);
            setLoadFailed(true);
            setMessage(
              t(
                'Impossible de vérifier votre session. Réessayez.',
                'Unable to verify your session. Please try again.',
              ),
            );
          });
        return;
      }
      loadVersion.current += 1;
      setAuthChecking(false);
      if (authenticated) void load();
      else {
        setAddresses([]);
        setOrders([]);
        setAvailable(false);
        setLoading(false);
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
  }, [load, t]);

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
      setMessage(
        error instanceof Error
          ? error.message
          : t('Impossible de préparer le paiement.', 'Unable to prepare payment.'),
      );
      setCheckoutPending(false);
    }
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (addressPending) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const values = {
      label: String(form.get('label') ?? (language === 'en' ? 'Home' : 'Domicile')).trim(),
      recipient: String(form.get('recipient') ?? '').trim(),
      line1: String(form.get('line1') ?? '').trim(),
      postalCode: String(form.get('postalCode') ?? '').trim(),
      city: String(form.get('city') ?? '').trim(),
    };
    if (
      values.label.length === 0 ||
      values.recipient.length < 2 ||
      values.line1.length < 3 ||
      values.postalCode.length < 2 ||
      values.city.length < 2
    ) {
      setMessage(
        t(
          'Vérifiez les champs : destinataire, adresse, code postal et ville doivent être renseignés correctement.',
          'Check the fields: recipient, address, postal code and city must be completed correctly.',
        ),
      );
      return;
    }

    setAddressPending(true);
    setMessage('');
    try {
      await apiRequest('/api/customer/addresses', apiSchemas.addressCreated, {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          country: 'FR',
          isDefault: addresses.length === 0,
        }),
      });
      formElement.reset();
      await load();
      setMessage(t('Adresse enregistrée.', 'Address saved.'));
    } catch {
      setMessage(
        t(
          'Adresse non enregistrée. Vérifiez les champs puis réessayez.',
          'Address not saved. Check the fields and try again.',
        ),
      );
    } finally {
      setAddressPending(false);
    }
  }

  async function removeAddress(id: string) {
    if (addressActionId) return;
    setAddressActionId(id);
    try {
      await apiRequestVoid(`/api/customer/addresses/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await load();
    } catch {
      setMessage(t('Impossible de supprimer cette adresse.', 'Unable to delete this address.'));
    } finally {
      setAddressActionId('');
    }
  }

  async function setDefaultAddress(id: string) {
    if (addressActionId) return;
    setAddressActionId(id);
    setMessage('');
    try {
      await apiRequest(
        `/api/customer/addresses/${encodeURIComponent(id)}/default`,
        apiSchemas.addressCreated,
        { method: 'PATCH' },
      );
      await load();
      setMessage(t('Adresse principale mise à jour.', 'Default address updated.'));
    } catch {
      setMessage(
        t(
          'Impossible de définir cette adresse par défaut.',
          'Unable to set this address as default.',
        ),
      );
    } finally {
      setAddressActionId('');
    }
  }

  return (
    <section className="seller-panel" style={{ marginTop: 24 }}>
      <h2>{t('Mes commandes et adresses', 'My orders and addresses')}</h2>
      {authChecking ? (
        <p className="workspace-loading" role="status" aria-live="polite">
          {t('Vérification de votre session…', 'Checking your session…')}
        </p>
      ) : !available && !loadFailed ? (
        <p>
          {t(
            'Connectez-vous pour consulter votre historique et vos adresses enregistrées.',
            'Sign in to view your order history and saved addresses.',
          )}
        </p>
      ) : loading ? (
        <p className="workspace-loading" role="status" aria-live="polite">
          {t('Chargement de votre compte…', 'Loading your account…')}
        </p>
      ) : loadFailed ? (
        <div className="workspace-error" role="alert">
          <p>{message}</p>
          <button
            type="button"
            className="outline-button"
            onClick={() => void load()}
            disabled={loading}
          >
            {t('Réessayer', 'Try again')}
          </button>
        </div>
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
              {checkoutPending
                ? t('Préparation du paiement…', 'Preparing payment…')
                : t('Payer mes commandes en attente', 'Pay my outstanding orders')}
            </button>
          )}
          {orders.length > 0 && (
            <div className="workspace-filters">
              <label>
                {t('Rechercher une commande', 'Search orders')}
                <input
                  type="search"
                  aria-label={t('Rechercher une commande', 'Search orders')}
                  value={orderSearch}
                  onChange={(event) => setOrderSearch(event.target.value)}
                  placeholder={t('N° commande ou produit', 'Order number or product')}
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
          )}
          {orders.length === 0 ? (
            <p>{t('Vous n’avez pas encore de commande.', 'You have no orders yet.')}</p>
          ) : (
            visibleOrders.map((order) => (
              <article className="best-seller-row" key={order.id}>
                <div className="best-seller-name">
                  <strong>
                    {t('Commande', 'Order')} {order.id.slice(-8)}
                  </strong>
                  <span>
                    {new Date(order.createdAt).toLocaleDateString(
                      language === 'en' ? 'en-GB' : 'fr-FR',
                    )}{' '}
                    · {orderStatusLabel(order.status, order.paymentStatus, language)} ·{' '}
                    {t('Paiement :', 'Payment:')}{' '}
                    {paymentStatusLabel(order.paymentStatus, language)}
                  </span>
                  <span>
                    {order.items.map((item) => item.productName + ' × ' + item.quantity).join(', ')}
                  </span>
                </div>
                <div>
                  <strong>{formatMoney(order.totalCents)}</strong>
                  {order.financialTransactions && order.financialTransactions.length > 0 && (
                    <div
                      className="financial-history"
                      aria-label={t('Historique financier', 'Financial history')}
                    >
                      {order.financialTransactions.map((transaction) => (
                        <span key={transaction.id}>
                          {transaction.type === 'REFUND'
                            ? t('Remboursement', 'Refund')
                            : t('Paiement', 'Payment')}{' '}
                          · {formatMoney(transaction.amountCents)} ·{' '}
                          {transaction.status === 'PENDING'
                            ? t('En cours', 'Pending')
                            : t('Confirmé', 'Confirmed')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
          {orders.length > 0 && visibleOrders.length === 0 && (
            <p className="empty-state" role="status">
              {t('Aucune commande ne correspond à ces filtres.', 'No orders match these filters.')}
            </p>
          )}
          <h3 style={{ marginTop: 24 }}>{t('Adresses enregistrées', 'Saved addresses')}</h3>
          {addresses.length === 0 ? (
            <p className="empty-state" role="status">
              {t(
                'Aucune adresse enregistrée. Ajoutez une adresse pour accélérer vos prochaines commandes.',
                'No saved addresses yet. Add an address to speed up your next checkout.',
              )}
            </p>
          ) : (
            addresses.map((address) => (
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
                <div className="address-actions">
                  {!address.isDefault && (
                    <button
                      className="text-action"
                      type="button"
                      onClick={() => void setDefaultAddress(address.id)}
                      disabled={Boolean(addressActionId)}
                    >
                      {addressActionId === address.id
                        ? t('Mise à jour…', 'Updating…')
                        : t('Définir par défaut', 'Set as default')}
                    </button>
                  )}
                  <button
                    className="text-action"
                    type="button"
                    onClick={() => void removeAddress(address.id)}
                    disabled={Boolean(addressActionId)}
                  >
                    {addressActionId === address.id
                      ? t('En cours…', 'Working…')
                      : t('Supprimer', 'Delete')}
                  </button>
                </div>
              </article>
            ))
          )}
          <form
            className="checkout-form"
            onSubmit={(event) => void addAddress(event)}
            style={{ marginTop: 16 }}
            aria-busy={addressPending}
          >
            <h3>{t('Ajouter une adresse', 'Add an address')}</h3>
            <label>
              {t('Libellé', 'Label')}
              <input name="label" defaultValue={t('Domicile', 'Home')} required maxLength={60} />
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
                <input
                  name="postalCode"
                  required
                  minLength={2}
                  maxLength={20}
                  autoComplete="postal-code"
                />
              </label>
              <label>
                {t('Ville', 'City')}
                <input
                  name="city"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="address-level2"
                />
              </label>
            </div>
            <button className="dark-button" type="submit" disabled={addressPending}>
              {addressPending
                ? t('Enregistrement…', 'Saving…')
                : t('Enregistrer l’adresse', 'Save address')}
            </button>
          </form>
        </>
      )}
      {message && !loadFailed && <p role="status">{message}</p>}
    </section>
  );
}
