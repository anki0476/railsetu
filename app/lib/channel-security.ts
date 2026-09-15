import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiRequestError } from './api-security';

function safeEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/.test(left) || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function channelIdentitySecret() {
  const secret = process.env.CHANNEL_IDENTITY_SECRET;
  if (!secret || secret.length < 32) throw new ApiRequestError(503, 'Channel identity protection is not configured.');
  return secret;
}

export function hashChannelSender(provider: string, accountId: string, senderId: string) {
  return createHmac('sha256', channelIdentitySecret()).update(`${provider}\n${accountId}\n${senderId}`).digest('hex');
}

export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) throw new ApiRequestError(503, 'WhatsApp webhook authentication is not configured.');
  const supplied = signatureHeader?.startsWith('sha256=') ? signatureHeader.slice(7).toLowerCase() : '';
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!safeEqual(supplied, expected)) throw new ApiRequestError(401, 'Invalid WhatsApp webhook signature.');
}

async function identityEncryptionKey() {
  const keyBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(channelIdentitySecret())));
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptChannelSender(senderId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await identityEncryptionKey(), new TextEncoder().encode(senderId));
  return `${Buffer.from(iv).toString('base64url')}.${Buffer.from(encrypted).toString('base64url')}`;
}

export async function decryptChannelSender(ciphertext: string) {
  const [ivValue, dataValue] = ciphertext.split('.');
  if (!ivValue || !dataValue) throw new ApiRequestError(500, 'Stored WhatsApp identity is invalid.');
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Buffer.from(ivValue, 'base64url') },
      await identityEncryptionKey(),
      Buffer.from(dataValue, 'base64url'),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new ApiRequestError(500, 'Stored WhatsApp identity could not be decrypted.');
  }
}
