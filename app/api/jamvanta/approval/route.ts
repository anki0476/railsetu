import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

const lifetime = 2 * 60 * 1000;
const secret = () => process.env.JAMVANTA_APPROVAL_SECRET ?? (process.env.NODE_ENV === 'development' ? 'jamvanta-local-development-only' : '');
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export async function POST(request: Request) {
  if (!secret()) return NextResponse.json({ error: 'Approval secret is not configured.' }, { status: 503 });
  const body = await request.json() as { operation?: string; amount?: number; token?: string };
  if (body.token) {
    const [encoded, signature] = body.token.split('.');
    if (!encoded || !signature) return NextResponse.json({ approved: false }, { status: 400 });
    const expected = sign(encoded);
    const validSignature = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as { expires: number };
    return NextResponse.json({ approved: validSignature && data.expires > Date.now(), data: validSignature ? data : undefined });
  }
  const data = { operation: body.operation ?? 'wallet-payment', amount: Math.max(0, Number(body.amount) || 0), expires: Date.now() + lifetime, nonce: crypto.randomUUID() };
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  return NextResponse.json({ token: `${encoded}.${sign(encoded)}`, expires: data.expires });
}

