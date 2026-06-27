import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const refresh_token = req.cookies.get('refresh_token')?.value;
  const authorization = req.headers.get('authorization');

  if (authorization) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: authorization },
    }).catch(() => null);
  }

  const res = NextResponse.json({ message: 'Sesión cerrada' });
  res.cookies.delete('refresh_token');
  return res;
}
