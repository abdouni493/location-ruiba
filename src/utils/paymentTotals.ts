import { Payment, ReservationDetails } from '../types';

/**
 * Money model of a reservation — one place so every screen agrees.
 *
 *   reservations.advance_payment  → the advance taken when the booking was created
 *   payments (table rows)         → every payment saved afterwards (« Régler Dette »)
 *
 * So the money actually collected is `advance_payment + Σ payments.amount`, and what is
 * still owed is `total_price − collected`. `reservations.remaining_payment` is only a cached
 * copy of that subtraction: it must be rewritten every time a payment row is added or deleted.
 */

/** Sum of payment rows, tolerant of raw Supabase rows (numeric columns come back as strings). */
export const sumPayments = (payments?: any[] | null): number =>
  (payments || []).reduce((sum: number, p: any) => sum + (Number(p?.amount) || 0), 0);

/** Total collected: initial advance + every recorded payment. */
export const getTotalPaid = (reservation: Partial<ReservationDetails> | any): number =>
  (Number(reservation?.advancePayment) || 0) + sumPayments(reservation?.payments);

/** What the client still owes, never negative. */
export const getRemaining = (reservation: Partial<ReservationDetails> | any): number =>
  Math.max(0, (Number(reservation?.totalPrice) || 0) - getTotalPaid(reservation));

/**
 * Payment rows are embedded raw (snake_case) by the reservation queries but mapped
 * (camelCase) by `ReservationsService.getPayments`; accept both shapes.
 */
export const normalizePayment = (p: any): Payment => ({
  id: p?.id,
  reservationId: p?.reservation_id ?? p?.reservationId,
  amount: Number(p?.amount) || 0,
  date: p?.date ?? (p?.created_at || p?.createdAt || '').split('T')[0],
  method: p?.method || 'cash',
  note: p?.note ?? undefined,
  createdAt: p?.created_at ?? p?.createdAt,
});

/** Oldest first — the order the payments were actually collected in. */
export const sortPaymentsByDate = (payments: Payment[]): Payment[] =>
  [...payments].sort((a, b) => {
    const key = (p: Payment) => new Date(p.createdAt || p.date || 0).getTime() || 0;
    return key(a) - key(b);
  });
