import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  if (!process.env.SARVAM_API_KEY) return NextResponse.json({ error: 'Sarvam is not configured.', fallback: true }, { status: 503 });
  const incoming = await request.formData();
  const audio = incoming.get('audio');
  if (!(audio instanceof Blob)) return NextResponse.json({ error: 'Audio is required.' }, { status: 400 });
  const form = new FormData();
  form.append('file', audio, 'jamvanta.webm');
  form.append('model', 'saaras:v3');
  form.append('mode', 'translate');
  form.append('language_code', 'unknown');
  const response = await fetch('https://api.sarvam.ai/speech-to-text', {
    method: 'POST',
    headers: { 'api-subscription-key': process.env.SARVAM_API_KEY },
    body: form,
  });
  const result = await response.json() as { transcript?: string; text?: string; language_code?: string };
  if (!response.ok) return NextResponse.json({ error: 'Transcription failed.' }, { status: 502 });
  return NextResponse.json({ transcript: result.transcript ?? result.text ?? '', language: result.language_code ?? 'unknown' });
}
