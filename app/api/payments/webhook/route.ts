import { createHmac, timingSafeEqual } from 'node:crypto';
import { apiError, secureJson } from '../../../lib/api-security';
import { database } from '../../../lib/reservation-store';

export async function POST(request: Request) {
  try {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) return secureJson({ error: 'Payment webhook is not configured.' }, { status: 503 });
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 16_384) return secureJson({ error: 'Webhook is too large.' }, { status: 413 });
    const signature = request.headers.get('x-railsetu-signature') ?? '';
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return secureJson({ error: 'Invalid signature.' }, { status: 401 });
    const event = JSON.parse(body) as { id?: unknown; paymentReference?: unknown; state?: unknown };
    if (typeof event.id !== 'string' || typeof event.paymentReference !== 'string' || !['PAYMENT_AUTHORIZED', 'PAYMENT_CAPTURED', 'PAYMENT_VOIDED', 'REFUNDED'].includes(String(event.state))) return secureJson({ error: 'Invalid event.' }, { status: 400 });
    const db = database();
    const key = `webhook:${event.id}`;
    const prior = await db.prepare(`SELECT key FROM idempotency_keys WHERE key=?1`).bind(key).first();
    if (prior) return secureJson({ received: true, duplicate: true });
    const now = Date.now();
    await db.batch([
      db.prepare(`UPDATE payments SET state=?1,updated_at=?2 WHERE provider_reference=?3`).bind(event.state, now, event.paymentReference),
      db.prepare(`INSERT OR IGNORE INTO idempotency_keys(key,operation,response_json,expires_at) VALUES(?1,'payment-webhook','{}',?2)`).bind(key, now + 7 * 24 * 60 * 60 * 1000),
    ]);
    return secureJson({ received: true });
  } catch (error) { return apiError(error, 'Webhook could not be processed.'); }
}
