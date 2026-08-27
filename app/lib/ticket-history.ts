export interface TicketHistoryItem {
  id: string;
  train: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  journeyDate: string;
  purchasedAt: number;
  fare: number;
  ticketUrl: string;
}

export const TICKET_HISTORY_STORAGE_KEY = 'railsetu.ticket-history.v1';
const MAX_HISTORY_ITEMS = 24;

export function readTicketHistory(): TicketHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(TICKET_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TicketHistoryItem => (
      Boolean(item) && typeof item.id === 'string' && typeof item.ticketUrl === 'string'
    )).slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

export function registerTicketInHistory(ticket: TicketHistoryItem) {
  try {
    const current = readTicketHistory();
    const existing = current.find((item) => item.id === ticket.id);
    const next = existing
      ? current.map((item) => item.id === ticket.id ? { ...item, ...ticket, purchasedAt: item.purchasedAt } : item)
      : [ticket, ...current];
    window.localStorage.setItem(TICKET_HISTORY_STORAGE_KEY, JSON.stringify(next.slice(0, MAX_HISTORY_ITEMS)));
    window.dispatchEvent(new Event('railsetu:ticket-history-updated'));
  } catch {
    // Ticket rendering should not fail when browser storage is unavailable.
  }
}

export function clearTicketHistory() {
  try {
    window.localStorage.removeItem(TICKET_HISTORY_STORAGE_KEY);
    window.dispatchEvent(new Event('railsetu:ticket-history-updated'));
  } catch {
    // Leave the current interface usable when browser storage is unavailable.
  }
}
