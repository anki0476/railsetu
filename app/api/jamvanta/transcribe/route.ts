import { NextResponse } from 'next/server';

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

function joinBytes(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const joined = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    joined.set(part, offset);
    offset += part.byteLength;
  });
  return joined;
}

async function sarvamMultipart(audio: Blob) {
  const encoder = new TextEncoder();
  const boundary = `----railsetu-${crypto.randomUUID()}`;
  const field = (name: string, value: string) => encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );
  const extension = audio.type.includes('wav') ? 'wav' : audio.type.includes('mpeg') ? 'mp3' : 'webm';
  const fileHeader = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="jamvanta.${extension}"\r\nContent-Type: ${audio.type || 'audio/webm'}\r\n\r\n`,
  );
  const closing = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = joinBytes([
    field('model', 'saaras:v3'),
    field('mode', 'translate'),
    fileHeader,
    new Uint8Array(await audio.arrayBuffer()),
    closing,
  ]);
  return { boundary, body };
}

export async function POST(request: Request) {
  if (!process.env.SARVAM_API_KEY) return NextResponse.json({ error: 'Sarvam is not configured.', fallback: true }, { status: 503 });
  try {
    const contentType = request.headers.get('content-type')?.split(';')[0].trim() || 'audio/webm';
    if (!contentType.startsWith('audio/')) return NextResponse.json({ error: 'An audio content type is required.' }, { status: 415 });
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0) return NextResponse.json({ error: 'Audio is required.' }, { status: 400 });
    const audio = new Blob([bytes], { type: contentType });
    if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Audio is too large.' }, { status: 413 });
    const multipart = await sarvamMultipart(audio);
    const response = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY,
        'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
      },
      body: multipart.body,
    });
    const rawResult = await response.text();
    let result: { transcript?: string; text?: string; language_code?: string } = {};
    try { result = JSON.parse(rawResult) as typeof result; } catch { /* A non-JSON provider error is handled below. */ }
    if (!response.ok) return NextResponse.json({ error: 'Transcription failed.', providerStatus: response.status }, { status: 502 });
    return NextResponse.json({ transcript: result.transcript ?? result.text ?? '', language: result.language_code ?? 'unknown' });
  } catch (error) {
    console.error('Jamvanta transcription relay failed.', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Transcription is temporarily unavailable.', fallback: true }, { status: 502 });
  }
}
