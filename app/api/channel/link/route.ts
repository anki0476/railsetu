import { waitUntil } from 'cloudflare:workers';
import { ApiRequestError, apiError, readJsonBody, requireSameOrigin, secureJson } from '../../../lib/api-security';
import { channelSenderForIdentity } from '../../../lib/channel-store';
import { database, sessionCookie, sessionFromRequest, sha256 } from '../../../lib/reservation-store';
import { sendWhatsAppText } from '../../../lib/whatsapp-transport';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readJsonBody(request, 2_048) as { token?: unknown };
    if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) throw new ApiRequestError(400, 'Invalid account-link request.');
    const tokenHash = await sha256(body.token);
    const now = Date.now();
    const link = await database().prepare(`SELECT channel_identity_id FROM account_link_tokens WHERE token_hash=?1 AND consumed_at IS NULL AND expires_at>?2`)
      .bind(tokenHash, now).first<{ channel_identity_id: string }>();
    if (!link) throw new ApiRequestError(410, 'This account-link request has expired or was already used.');
    const principalId = sessionFromRequest(request);
    const linked = await database().batch([
      database().prepare(`UPDATE account_link_tokens SET consumed_at=?1 WHERE token_hash=?2 AND consumed_at IS NULL AND expires_at>?1`).bind(now, tokenHash),
      database().prepare(`INSERT OR IGNORE INTO channel_principals(id,browser_session_id,created_at,updated_at) VALUES(?1,?1,?2,?2)`).bind(principalId, now),
      database().prepare(`UPDATE channel_identities SET principal_id=?1,verified_at=?2,updated_at=?2 WHERE id=?3 AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM account_link_tokens WHERE token_hash=?4 AND consumed_at=?2)`).bind(principalId, now, link.channel_identity_id, tokenHash),
    ]);
    if (!linked[0].meta.changes || !linked[2].meta.changes) throw new ApiRequestError(409, 'This account-link request was already completed.');
    waitUntil(channelSenderForIdentity(link.channel_identity_id).then((sender)=>sendWhatsAppText(sender,'Your RailSetu account is linked. Send “continue” and I will resume from the journey details I saved.')).catch((error)=>console.warn('[railsetu-whatsapp] link confirmation deferred',error instanceof Error?error.name:'Error')));
    return secureJson({ linked: true }, { headers: { 'Set-Cookie': sessionCookie(principalId) } });
  } catch (error) {
    return apiError(error, 'WhatsApp account linking could not be completed.');
  }
}
