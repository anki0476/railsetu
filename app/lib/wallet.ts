import { addTransaction } from './transactions';

export interface WalletTransaction {
  id: string;
  amount: number;
  label: string;
  createdAt: number;
  reference?: string;
}

const WALLET_KEY = 'railsetu.wallet.v1';
export const WALLET_EVENT = 'railsetu:wallet-updated';

export function readWallet(): WalletTransaction[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(WALLET_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item) => item && typeof item.amount === 'number') : [];
  } catch {
    return [];
  }
}

export function addWalletRefund(transaction: WalletTransaction) {
  addWalletTransaction(transaction);
}

export function addWalletTransaction(transaction: WalletTransaction) {
  try {
    const next = [transaction, ...readWallet()].slice(0, 24);
    window.localStorage.setItem(WALLET_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(WALLET_EVENT));
    addTransaction({ ...transaction, kind: transaction.id.startsWith('refund-') ? 'refund' : transaction.amount < 0 ? 'payment' : 'topup', method: 'RailSetu Wallet' });
  } catch {
    // Wallet remains a no-data prototype if storage is unavailable.
  }
}

export function getWalletBalance() {
  return readWallet().reduce((sum, item) => sum + item.amount, 0);
}
