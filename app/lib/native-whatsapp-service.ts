import { ApiRequestError } from './api-security';
import { channelSenderForIdentity, getOrCreateChannelIdentity, type ChannelRef } from './channel-store';
import { runNativeWhatsAppAgent } from './native-whatsapp-agent';
import { database } from './reservation-store';
import { markWhatsAppMessageRead, sendWhatsAppText, type WhatsAppInboundMessage } from './whatsapp-transport';

const LOCK_LEASE_MS = 30_000;

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function acquireConversationLock(identityId: string, owner: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const now = Date.now();
    await database().prepare(`INSERT OR IGNORE INTO whatsapp_conversation_locks(channel_identity_id,owner,lease_until,updated_at) VALUES(?1,?2,?3,?4)`)
      .bind(identityId, owner, now + LOCK_LEASE_MS, now).run();
    await database().prepare(`UPDATE whatsapp_conversation_locks SET owner=?1,lease_until=?2,updated_at=?3 WHERE channel_identity_id=?4 AND (owner=?1 OR lease_until<=?3)`)
      .bind(owner, now + LOCK_LEASE_MS, now, identityId).run();
    const lock = await database().prepare(`SELECT owner FROM whatsapp_conversation_locks WHERE channel_identity_id=?1`).bind(identityId).first<{owner:string}>();
    if (lock?.owner === owner) return true;
    await pause(125 + attempt * 25);
  }
  return false;
}

async function releaseConversationLock(identityId: string, owner: string) {
  await database().prepare(`DELETE FROM whatsapp_conversation_locks WHERE channel_identity_id=?1 AND owner=?2`).bind(identityId, owner).run();
}

export async function processNativeWhatsAppMessage(message: WhatsAppInboundMessage) {
  const configuredAccount = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (configuredAccount && message.accountId !== configuredAccount) return;
  const ref: ChannelRef = {provider:'whatsapp',accountId:message.accountId,senderId:message.senderId,conversationId:message.conversationId};
  const identity = await getOrCreateChannelIdentity(ref);
  const now = Date.now();
  const inserted = await database().prepare(`INSERT OR IGNORE INTO whatsapp_inbound_messages(id,channel_identity_id,state,attempts,available_at,response_json,created_at,updated_at) VALUES(?1,?2,'RECEIVED',0,?3,NULL,?3,?3)`)
    .bind(message.id,identity.id,now).run();
  if (!inserted.meta.changes) {
    const existing = await database().prepare(`SELECT state,available_at FROM whatsapp_inbound_messages WHERE id=?1`).bind(message.id).first<{state:string;available_at:number}>();
    if (!existing || existing.state === 'COMPLETED' || existing.available_at > now) return;
  }
  const claimed = await database().prepare(`UPDATE whatsapp_inbound_messages SET state='PROCESSING',attempts=attempts+1,available_at=?1,updated_at=?2 WHERE id=?3 AND (state IN ('RECEIVED','FAILED') OR (state='PROCESSING' AND available_at<=?2))`)
    .bind(now + 60_000,now,message.id).run();
  if (!claimed.meta.changes) return;

  const owner = crypto.randomUUID();
  const locked = await acquireConversationLock(identity.id,owner);
  if (!locked) {
    await database().prepare(`UPDATE whatsapp_inbound_messages SET state='FAILED',available_at=?1,updated_at=?2 WHERE id=?3`).bind(Date.now()+2_000,Date.now(),message.id).run();
    throw new Error('The WhatsApp conversation is busy.');
  }
  try {
    await markWhatsAppMessageRead(message.id).catch(()=>undefined);
    const reply = await runNativeWhatsAppAgent(message.text,ref,message.id);
    await sendWhatsAppText(message.senderId,reply,message.id);
    await database().prepare(`UPDATE whatsapp_inbound_messages SET state='COMPLETED',response_json=?1,available_at=?2,updated_at=?2 WHERE id=?3`)
      .bind(JSON.stringify({delivered:true}),Date.now(),message.id).run();
  } catch (error) {
    const retryAt = Date.now()+Math.min(60_000,2_000*2**Math.min(5,Number((await database().prepare(`SELECT attempts FROM whatsapp_inbound_messages WHERE id=?1`).bind(message.id).first<{attempts:number}>())?.attempts??1)));
    await database().prepare(`UPDATE whatsapp_inbound_messages SET state='FAILED',available_at=?1,response_json=?2,updated_at=?3 WHERE id=?4`)
      .bind(retryAt,JSON.stringify({error:error instanceof Error?error.name:'Error'}),Date.now(),message.id).run();
    await sendWhatsAppText(message.senderId,'I couldn’t safely complete that turn just now. I kept your RailSetu details—please send the last instruction once more.',message.id).catch(()=>undefined);
    throw error;
  } finally {
    await releaseConversationLock(identity.id,owner);
  }
}

function eventMessage(type: string, payload: Record<string,unknown>) {
  if (type === 'ticket_issued') return `Your RailSetu ticket is issued.${payload.pnr?` PNR: ${payload.pnr}.`:''}${payload.ticketUrl?`\nTicket: ${payload.ticketUrl}`:''}`;
  if (type === 'ticket_cancelled') return `Your RailSetu ticket was cancelled.${typeof payload.refund==='number'?` A prototype refund of ₹${payload.refund} has been recorded.`:''}`;
  if (type === 'refund_started') return 'Your booking could not be completed. The refund process has started, and I will keep the authoritative status in RailSetu.';
  return `Your RailSetu booking has an update: ${String(payload.state??type).replaceAll('_',' ')}.`;
}

export async function deliverPendingWhatsAppEvents(principalId?: string) {
  const now = Date.now();
  await database().prepare(`UPDATE channel_events SET state='PENDING',available_at=?1,updated_at=?1 WHERE direction='outbound' AND state='PROCESSING' AND available_at<=?1`).bind(now).run();
  const condition = principalId ? 'AND ci.principal_id=?2' : '';
  const query = `SELECT e.id,e.channel_identity_id,e.event_type,e.payload_json,e.attempts FROM channel_events e JOIN channel_identities ci ON ci.id=e.channel_identity_id WHERE e.direction='outbound' AND e.state='PENDING' AND e.available_at<=?1 AND ci.provider='whatsapp' AND ci.revoked_at IS NULL AND ci.sender_ciphertext IS NOT NULL ${condition} ORDER BY e.created_at LIMIT 20`;
  const statement = database().prepare(query);
  const rows = principalId
    ? await statement.bind(now,principalId).all<{id:string;channel_identity_id:string;event_type:string;payload_json:string;attempts:number}>()
    : await statement.bind(now).all<{id:string;channel_identity_id:string;event_type:string;payload_json:string;attempts:number}>();
  let delivered=0;
  for (const row of rows.results) {
    const claimed = await database().prepare(`UPDATE channel_events SET state='PROCESSING',attempts=attempts+1,available_at=?1,updated_at=?2 WHERE id=?3 AND state='PENDING'`).bind(now+60_000,now,row.id).run();
    if (!claimed.meta.changes) continue;
    try {
      const sender = await channelSenderForIdentity(row.channel_identity_id);
      const payload = JSON.parse(row.payload_json) as Record<string,unknown>;
      await sendWhatsAppText(sender,eventMessage(row.event_type,payload));
      await database().prepare(`UPDATE channel_events SET state='DELIVERED',updated_at=?1 WHERE id=?2 AND state='PROCESSING'`).bind(Date.now(),row.id).run();
      delivered+=1;
    } catch {
      const delay=Math.min(15*60_000,5_000*2**Math.min(6,row.attempts));
      await database().prepare(`UPDATE channel_events SET state='PENDING',available_at=?1,updated_at=?2 WHERE id=?3 AND state='PROCESSING'`).bind(Date.now()+delay,Date.now(),row.id).run();
    }
  }
  return {examined:rows.results.length,delivered};
}

export function requireDispatcherAuthorization(request: Request) {
  const secret=process.env.WHATSAPP_DISPATCH_SECRET;
  if (!secret || request.headers.get('authorization')!==`Bearer ${secret}`) throw new ApiRequestError(401,'Invalid dispatcher authorization.');
}

