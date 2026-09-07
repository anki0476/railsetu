import { ApiRequestError, apiError, readJsonBody, requireSameOrigin, secureJson } from '../../lib/api-security';
import { database, sessionCookie, sessionFromRequest, sha256 } from '../../lib/reservation-store';

export async function GET(request: Request) {
  try {
    const sessionId = sessionFromRequest(request);
    const now = Date.now();
    const db = database();
    await db.prepare(`INSERT OR IGNORE INTO wallet_accounts(session_id,balance,updated_at) VALUES(?1,10000,?2)`).bind(sessionId, now).run();
    const row = await db.prepare(`SELECT balance FROM wallet_accounts WHERE session_id=?1`).bind(sessionId).first<{ balance: number }>();
    const history = await db.prepare(`SELECT id,amount,label,created_at FROM transaction_history WHERE session_id=?1 AND method='wallet' ORDER BY created_at DESC LIMIT 24`).bind(sessionId).all<{ id: string; amount: number; label: string; created_at: number }>();
    return secureJson({ balance: row?.balance ?? 0, transactions: history.results.map((item) => ({ id: item.id, amount: item.amount, label: item.label, createdAt: item.created_at })) }, { headers: { 'Set-Cookie': sessionCookie(sessionId) } });
  } catch (error) { return apiError(error, 'Wallet balance is unavailable.'); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readJsonBody(request, 2_048) as { amount?: unknown; idempotencyKey?: unknown };
    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > 10_000) throw new ApiRequestError(400, 'Invalid wallet amount.');
    if (typeof body.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(body.idempotencyKey)) throw new ApiRequestError(400, 'A valid idempotency key is required.');
    const sessionId = sessionFromRequest(request); const now = Date.now(); const db = database();
    const transactionId = `topup_${(await sha256(`${sessionId}|${body.idempotencyKey}`)).slice(0, 32)}`;
    const results = await db.batch([
      db.prepare(`INSERT OR IGNORE INTO wallet_accounts(session_id,balance,updated_at) VALUES(?1,10000,?2)`).bind(sessionId, now),
      db.prepare(`INSERT OR IGNORE INTO transaction_history(id,session_id,reservation_id,kind,amount,method,label,created_at) VALUES(?1,?2,NULL,'topup',?3,'wallet','Mock wallet top-up',?4)`).bind(transactionId, sessionId, amount, now),
    ]);
    if (results[1].meta.changes) await db.prepare(`UPDATE wallet_accounts SET balance=balance+?1,updated_at=?2 WHERE session_id=?3`).bind(amount, now, sessionId).run();
    const row = await db.prepare(`SELECT balance FROM wallet_accounts WHERE session_id=?1`).bind(sessionId).first<{ balance: number }>();
    return secureJson({ balance: row?.balance ?? 0, transactionId }, { headers: { 'Set-Cookie': sessionCookie(sessionId) } });
  } catch (error) { return apiError(error, 'Wallet could not be updated.'); }
}
