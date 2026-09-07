import { env } from 'cloudflare:workers';

export async function GET() {
  const runtimeEnv = env as unknown as { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?: string };
  const apiKey = runtimeEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
    || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  if (!apiKey) {
    return Response.json({ error: 'Google Maps is not configured.' }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }

  return Response.json({ apiKey }, {
    headers: {
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}
