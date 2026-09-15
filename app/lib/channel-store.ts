import { ApiRequestError } from './api-security';
import { decryptChannelSender, encryptChannelSender, hashChannelSender } from './channel-security';
import { database, sha256 } from './reservation-store';

export type ChannelRef = { provider: 'whatsapp'; accountId: string; senderId: string; conversationId: string };
export type ChannelIdentity = { id: string; principal_id: string | null; verified_at: number | null; revoked_at: number | null; sender_ciphertext?: string | null };

export function parseChannelRef(value: unknown): ChannelRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiRequestError(400, 'Channel identity is required.');
  const input = value as Record<string, unknown>;
  if (input.provider !== 'whatsapp') throw new ApiRequestError(400, 'Unsupported channel provider.');
  for (const field of ['accountId', 'senderId', 'conversationId'] as const) {
    if (typeof input[field] !== 'string' || !input[field] || input[field].length > 180) throw new ApiRequestError(400, `Invalid ${field}.`);
  }
  return { provider: 'whatsapp', accountId: input.accountId as string, senderId: input.senderId as string, conversationId: input.conversationId as string };
}

export async function getOrCreateChannelIdentity(ref: ChannelRef) {
  const senderHash = hashChannelSender(ref.provider, ref.accountId, ref.senderId);
  const id = `chid_${(await sha256(`${ref.provider}|${ref.accountId}|${senderHash}`)).slice(0, 32)}`;
  const now = Date.now();
  const senderCiphertext = await encryptChannelSender(ref.senderId);
  await database().prepare(`INSERT OR IGNORE INTO channel_identities(id,provider,channel_account_id,sender_hash,sender_ciphertext,principal_id,verified_at,revoked_at,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,NULL,NULL,NULL,?6,?6)`)
    .bind(id, ref.provider, ref.accountId, senderHash, senderCiphertext, now).run();
  await database().prepare(`UPDATE channel_identities SET sender_ciphertext=COALESCE(sender_ciphertext,?1),updated_at=?2 WHERE id=?3`).bind(senderCiphertext, now, id).run();
  const identity = await database().prepare(`SELECT id,principal_id,verified_at,revoked_at,sender_ciphertext FROM channel_identities WHERE id=?1`).bind(id).first<ChannelIdentity>();
  if (!identity || identity.revoked_at) throw new ApiRequestError(403, 'This WhatsApp identity is not available.');
  return identity;
}

export async function readChannelIdentity(identityId: string) {
  const identity = await database().prepare(`SELECT id,principal_id,verified_at,revoked_at,sender_ciphertext FROM channel_identities WHERE id=?1 AND provider='whatsapp'`)
    .bind(identityId).first<ChannelIdentity>();
  if (!identity || identity.revoked_at) throw new ApiRequestError(404, 'WhatsApp identity was not found.');
  return identity;
}

export async function channelSenderForIdentity(identityId: string) {
  const identity = await readChannelIdentity(identityId);
  if (!identity.sender_ciphertext) throw new ApiRequestError(409, 'WhatsApp identity cannot receive messages yet.');
  return decryptChannelSender(identity.sender_ciphertext);
}

export async function readConversation(identityId: string, conversationId: string) {
  const id = `conv_${(await sha256(`${identityId}|${conversationId}`)).slice(0, 32)}`;
  const row = await database().prepare(`SELECT state_json,version,updated_at FROM agent_conversations WHERE id=?1 AND channel_identity_id=?2`)
    .bind(id, identityId).first<{ state_json: string; version: number; updated_at: number }>();
  return { id, state: row ? JSON.parse(row.state_json) as unknown : {}, version: row?.version ?? 0, updatedAt: row?.updated_at ?? null };
}

export async function saveConversation(identityId: string, conversationId: string, state: unknown, expectedVersion: number) {
  const current = await readConversation(identityId, conversationId);
  const now = Date.now();
  if (!current.version) {
    const inserted = await database().prepare(`INSERT OR IGNORE INTO agent_conversations(id,channel_identity_id,state_json,version,created_at,updated_at) VALUES(?1,?2,?3,1,?4,?4)`)
      .bind(current.id, identityId, JSON.stringify(state), now).run();
    if (!inserted.meta.changes) throw new ApiRequestError(409, 'Conversation changed; reload its context.');
    return 1;
  }
  const updated = await database().prepare(`UPDATE agent_conversations SET state_json=?1,version=version+1,updated_at=?2 WHERE id=?3 AND channel_identity_id=?4 AND version=?5`)
    .bind(JSON.stringify(state), now, current.id, identityId, expectedVersion).run();
  if (!updated.meta.changes) throw new ApiRequestError(409, 'Conversation changed; reload its context.');
  return expectedVersion + 1;
}

export function requireLinkedPrincipal(identity: ChannelIdentity) {
  if (!identity.principal_id || !identity.verified_at) throw new ApiRequestError(403, 'LINK_REQUIRED');
  return identity.principal_id;
}
