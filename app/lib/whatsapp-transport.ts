import { ApiRequestError } from './api-security';

export type WhatsAppInboundMessage = {
  id: string;
  senderId: string;
  accountId: string;
  conversationId: string;
  text: string;
  timestamp: number;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function messageText(message: UnknownRecord) {
  const type = message.type;
  if (type === 'text') return String(record(message.text)?.body ?? '').trim();
  if (type === 'button') return String(record(message.button)?.text ?? record(message.button)?.payload ?? '').trim();
  if (type === 'interactive') {
    const interactive = record(message.interactive);
    const reply = record(interactive?.button_reply) ?? record(interactive?.list_reply);
    return String(reply?.title ?? reply?.id ?? '').trim();
  }
  return '';
}

export function parseWhatsAppWebhook(payload: unknown): WhatsAppInboundMessage[] {
  const root = record(payload);
  if (!root || root.object !== 'whatsapp_business_account' || !Array.isArray(root.entry)) return [];
  const parsed: WhatsAppInboundMessage[] = [];
  for (const entryValue of root.entry) {
    const entry = record(entryValue);
    if (!entry || !Array.isArray(entry.changes)) continue;
    for (const changeValue of entry.changes) {
      const value = record(record(changeValue)?.value);
      const accountId = String(record(value?.metadata)?.phone_number_id ?? '').trim();
      if (!accountId || !Array.isArray(value?.messages)) continue;
      for (const messageValue of value.messages) {
        const message = record(messageValue);
        if (!message) continue;
        const id = String(message.id ?? '').trim();
        const senderId = String(message.from ?? '').trim();
        const text = messageText(message);
        if (!/^wamid\.[A-Za-z0-9_+=\-/]+$/.test(id) || !/^\d{7,18}$/.test(senderId) || !text) continue;
        const seconds = Number(message.timestamp);
        parsed.push({
          id,
          senderId,
          accountId,
          conversationId: senderId,
          text: text.slice(0, 2_000),
          timestamp: Number.isFinite(seconds) ? seconds * 1_000 : Date.now(),
        });
      }
    }
  }
  return parsed.slice(0, 20);
}

function whatsappConfiguration() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION;
  if (!accessToken || !phoneNumberId || !/^v\d+\.\d+$/.test(graphVersion ?? '')) {
    throw new ApiRequestError(503, 'WhatsApp Cloud API is not configured.');
  }
  return { accessToken, phoneNumberId, graphVersion: graphVersion as string };
}

async function graphRequest(body: UnknownRecord, signal?: AbortSignal) {
  const config = whatsappConfiguration();
  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${config.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`WhatsApp Cloud API returned ${response.status}: ${detail}`);
  }
  return response.json() as Promise<UnknownRecord>;
}

export async function markWhatsAppMessageRead(messageId: string, signal?: AbortSignal) {
  return graphRequest({ status: 'read', message_id: messageId }, signal);
}

export async function sendWhatsAppText(senderId: string, text: string, replyToMessageId?: string, signal?: AbortSignal) {
  const clean = text.trim().slice(0, 4_096);
  if (!clean) throw new ApiRequestError(500, 'An empty WhatsApp response cannot be sent.');
  return graphRequest({
    to: senderId,
    type: 'text',
    text: { body: clean, preview_url: /https?:\/\//.test(clean) },
    ...(replyToMessageId ? { context: { message_id: replyToMessageId } } : {}),
  }, signal);
}

