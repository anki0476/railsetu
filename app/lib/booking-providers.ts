export type PaymentMethodKind = 'wallet' | 'upi' | 'card';

export interface PaymentProvider {
  authorize(input: { reservationId: string; amount: number; method: string }): Promise<{ reference: string; captured: boolean }>;
  capture(reference: string): Promise<void>;
  void(reference: string): Promise<void>;
  refund(reference: string, amount: number): Promise<void>;
}

export interface BookingProvider {
  confirm(input: { reservationId: string; itineraryHash: string }): Promise<{ reference: string; pnr: string }>;
}

export interface ReservationInventoryProvider {
  hold(offerId: string, reservationId: string, expiresAt: number): Promise<boolean>;
  release(offerId: string, reservationId: string): Promise<void>;
}

export const simulatedPaymentProvider: PaymentProvider = {
  async authorize({ reservationId, method }) {
    return { reference: `pay_${reservationId.slice(0, 18)}`, captured: method === 'upi' || method === 'wallet' };
  },
  async capture() {},
  async void() {},
  async refund() {},
};

export const simulatedBookingProvider: BookingProvider = {
  async confirm({ reservationId }) {
    const digits = [...reservationId].reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 10_000_000_000, 7);
    return { reference: `book_${reservationId.slice(0, 18)}`, pnr: String(digits).padStart(10, '0') };
  },
};
