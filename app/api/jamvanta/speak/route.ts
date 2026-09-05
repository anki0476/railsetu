import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  if (!process.env.SARVAM_API_KEY) return NextResponse.json({ fallback: true }, { status: 503 });
  const body = await request.json() as { text?: string; language?: string };
  const text = String(body.text ?? '').trim().slice(0, 900);
  if (!text) return NextResponse.json({ error: 'Text is required.' }, { status: 400 });
  const language = body.language === 'hi-IN' ? 'hi-IN' : 'en-IN';
  const response = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'api-subscription-key': process.env.SARVAM_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text, language_code: language, speaker: 'shubh', model: 'bulbul:v3', pace: 1, output_audio_codec: 'wav' }),
  });
  const result = await response.json() as { audios?: string[] };
  if (!response.ok || !result.audios?.length) return NextResponse.json({ error: 'Speech generation failed.' }, { status: 502 });
  return NextResponse.json({ audio: result.audios.join(''), contentType: 'audio/wav' });
}

