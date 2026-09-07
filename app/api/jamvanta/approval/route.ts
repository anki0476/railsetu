import { ApiRequestError, apiError, enforceRateLimit, readJsonBody, requireSameOrigin, secureJson } from '../../../lib/api-security';
import { allowedApprovalOperation, approvalSecret, consumeApprovalToken, prepareApprovalToken } from '../../../lib/jamvanta-approval';
import { readReservation, sessionFromRequest } from '../../../lib/reservation-store';

const MAX_BODY_BYTES = 4_096;

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const limited = enforceRateLimit(request, 'jamvanta-approval', 24);
    if (limited) return limited;
    if (!approvalSecret()) return secureJson({ error: 'Approval secret is not configured.' }, { status: 503 });
    const value = await readJsonBody(request, MAX_BODY_BYTES);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiRequestError(400, 'Invalid approval request.');
    const body = value as { operation?: unknown; amount?: unknown; token?: unknown; reservationId?: unknown };
    if (typeof body.token === 'string') {
      if (typeof body.reservationId !== 'string') throw new ApiRequestError(400, 'A reservation is required for payment approval.');
      const reservation = await readReservation(body.reservationId, sessionFromRequest(request));
      if (!reservation) return secureJson({ approved: false }, { status: 400 });
      const data = await consumeApprovalToken(body.token, { reservationId: reservation.id, amount: reservation.fare, itineraryHash: reservation.itinerary_hash });
      if (!data) return secureJson({ approved: false }, { status: 400 });
      return secureJson({ approved: true, data });
    }

    if (typeof body.operation !== 'string' || !allowedApprovalOperation(body.operation)) throw new ApiRequestError(400, 'Invalid payment operation.');
    const operation = body.operation;
    if (typeof body.reservationId !== 'string') throw new ApiRequestError(400, 'A reservation is required for payment approval.');
    const reservation = await readReservation(body.reservationId, sessionFromRequest(request));
    if (!reservation || reservation.state !== 'HELD' || reservation.expires_at <= Date.now()) throw new ApiRequestError(409, 'The seat hold is no longer valid.');
    // Payment amount and itinerary are resolved from the server-side hold. Browser values
    // are never trusted when creating a one-time transaction approval.
    return secureJson(await prepareApprovalToken(operation, reservation));
  } catch (error) {
    return apiError(error, 'Approval could not be completed.');
  }
}
