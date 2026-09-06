import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiRequestError, apiError, enforceRateLimit, readJsonBody, requireSameOrigin, secureJson } from '../../../lib/api-security';

const lifetime = 2 * 60 * 1000;
const MAX_BODY_BYTES = 4_096;
const MAX_TOKEN_LENGTH = 2_048;
const MAX_USED_APPROVALS = 2_000;
const allowedOperation = (value: string) => /^(?:wallet-payment|payment-(?:upi|visa|mastercard|card-[0-9]{4}))$/.test(value);
const usedApprovals = new Map<string, number>();
const secret = () => process.env.JAMVANTA_APPROVAL_SECRET ?? (process.env.NODE_ENV === 'development' ? 'jamvanta-local-development-only' : '');
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const limited = enforceRateLimit(request, 'jamvanta-approval', 24);
    if (limited) return limited;
    if (!secret()) return secureJson({ error: 'Approval secret is not configured.' }, { status: 503 });
    const value = await readJsonBody(request, MAX_BODY_BYTES);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiRequestError(400, 'Invalid approval request.');
    const body = value as { operation?: unknown; amount?: unknown; token?: unknown };
    if (typeof body.token === 'string') {
      if (body.token.length > MAX_TOKEN_LENGTH) throw new ApiRequestError(400, 'Invalid approval token.');
      const parts = body.token.split('.');
      if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return secureJson({ approved: false }, { status: 400 });
      const [encoded, signature] = parts;
      const expected = sign(encoded);
      const validSignature = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      if (!validSignature) return secureJson({ approved: false }, { status: 400 });

      let data: { operation?: unknown; amount?: unknown; expires?: unknown; nonce?: unknown };
      try { data = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as typeof data; }
      catch { return secureJson({ approved: false }, { status: 400 }); }
      const validData = typeof data.expires === 'number'
        && typeof data.nonce === 'string'
        && typeof data.operation === 'string'
        && allowedOperation(data.operation)
        && typeof data.amount === 'number'
        && Number.isFinite(data.amount)
        && data.amount >= 0
        && data.amount <= 1_000_000;
      const now = Date.now();
      for (const [nonce, expires] of usedApprovals) if (expires <= now) usedApprovals.delete(nonce);
      if (!validData || data.expires! <= now || usedApprovals.has(data.nonce as string)) return secureJson({ approved: false }, { status: 400 });
      usedApprovals.set(data.nonce as string, data.expires as number);
      while (usedApprovals.size > MAX_USED_APPROVALS) {
        const oldest = usedApprovals.keys().next().value as string | undefined;
        if (!oldest) break;
        usedApprovals.delete(oldest);
      }
      return secureJson({ approved: true, data });
    }

    const operation = typeof body.operation === 'string' && allowedOperation(body.operation) ? body.operation : 'wallet-payment';
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) throw new ApiRequestError(400, 'Invalid approval amount.');
    const data = { operation, amount, expires: Date.now() + lifetime, nonce: crypto.randomUUID() };
    const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
    return secureJson({ token: `${encoded}.${sign(encoded)}`, expires: data.expires });
  } catch (error) {
    return apiError(error, 'Approval could not be completed.');
  }
}
