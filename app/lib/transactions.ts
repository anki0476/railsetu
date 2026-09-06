export type TransactionKind = 'payment' | 'refund' | 'topup';

export interface RailSetuTransaction {
  id: string;
  kind: TransactionKind;
  amount: number;
  label: string;
  method: string;
  createdAt: number;
  reference?: string;
}

const TRANSACTION_KEY = 'railsetu.transactions.v1';
const WALLET_KEY = 'railsetu.wallet.v1';
const TICKET_KEY = 'railsetu.ticket-history.v1';
export const TRANSACTION_EVENT = 'railsetu:transactions-updated';

function validTransaction(value: unknown): value is RailSetuTransaction {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RailSetuTransaction>;
  return typeof item.id === 'string' && typeof item.amount === 'number' && typeof item.label === 'string' && typeof item.method === 'string' && typeof item.createdAt === 'number' && ['payment', 'refund', 'topup'].includes(item.kind ?? '');
}

function storedTransactions() {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TRANSACTION_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(validTransaction) : [];
  } catch { return []; }
}

function legacyWalletTransactions(): RailSetuTransaction[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(WALLET_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const item = value as { id?: unknown; amount?: unknown; label?: unknown; createdAt?: unknown };
      if (typeof item.id !== 'string' || typeof item.amount !== 'number' || typeof item.label !== 'string' || typeof item.createdAt !== 'number') return [];
      const kind: TransactionKind = item.id.startsWith('refund-') ? 'refund' : item.amount < 0 ? 'payment' : 'topup';
      return [{ id: item.id, kind, amount: item.amount, label: item.label, method: 'RailSetu Wallet', createdAt: item.createdAt }];
    });
  } catch { return []; }
}

function historicalTicketTransactions(): RailSetuTransaction[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TICKET_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const item = value as { id?: unknown; train?: unknown; fare?: unknown; purchasedAt?: unknown; ticketUrl?: unknown; cancelledAt?: unknown; refundAmount?: unknown; refundDestination?: unknown };
      if (typeof item.id !== 'string' || typeof item.train !== 'string' || typeof item.fare !== 'number' || typeof item.purchasedAt !== 'number') return [];
      let mode = 'Saved payment method';
      try {
        const paymentMode = new URL(String(item.ticketUrl ?? ''), window.location.origin).searchParams.get('mode');
        if (paymentMode === 'wallet') mode = 'RailSetu Wallet';
        else if (paymentMode === 'upi') mode = 'UPI · railsetu@upi';
        else if (paymentMode === 'visa') mode = 'Visa · •••• 6756';
        else if (paymentMode === 'mastercard') mode = 'Mastercard · •••• 4632';
      } catch { /* retain the generic saved method label */ }
      const result: RailSetuTransaction[] = [{ id: `payment-${item.id}`, kind: 'payment', amount: -item.fare, label: `Ticket · ${item.train}`, method: mode, createdAt: item.purchasedAt, reference: item.id }];
      if (typeof item.cancelledAt === 'number' && typeof item.refundAmount === 'number') result.push({ id: `refund-${item.id}`, kind: 'refund', amount: item.refundAmount, label: `Refund · ${item.train}`, method: item.refundDestination === 'wallet' ? 'RailSetu Wallet' : 'Original payment source', createdAt: item.cancelledAt, reference: item.id });
      return result;
    });
  } catch { return []; }
}

export function readTransactions() {
  const items = [...storedTransactions(), ...legacyWalletTransactions(), ...historicalTicketTransactions()];
  const unique = new Map<string, RailSetuTransaction>();
  items.forEach((item) => { if (!unique.has(item.id)) unique.set(item.id, item); });
  return [...unique.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 60);
}

export function addTransaction(transaction: RailSetuTransaction) {
  try {
    const next = [transaction, ...storedTransactions().filter((item) => item.id !== transaction.id)].slice(0, 60);
    window.localStorage.setItem(TRANSACTION_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(TRANSACTION_EVENT));
  } catch {
    // Financial history remains optional when browser storage is unavailable.
  }
}
