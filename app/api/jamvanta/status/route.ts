import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    sarvam: Boolean(process.env.SARVAM_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    approval: Boolean(process.env.JAMVANTA_APPROVAL_SECRET) || process.env.NODE_ENV === 'development',
  });
}

