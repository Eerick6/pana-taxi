import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const IS_PROD = process.env.NODE_ENV === 'production';

export async function POST(req: NextRequest) {
  const refresh_token = req.cookies.get('refresh_token')?.value;

  if (!refresh_token) {
    const res = NextResponse.json({ message: 'Sin sesión' }, { status: 401 });
    res.cookies.delete('has_session');
    return res;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    });
  } catch {
    return NextResponse.json({ message: 'Sin sesión' }, { status: 401 });
  }

  if (!upstream.ok) {
    const res = NextResponse.json({ message: 'Sesión expirada' }, { status: 401 });
    res.cookies.delete('refresh_token');
    res.cookies.delete('has_session');
    return res;
  }

  const { access_token, refresh_token: new_refresh, role } = await upstream.json();

  const res = NextResponse.json({ access_token, role });
  res.cookies.set('has_session', '1', {
    httpOnly: false,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.set('refresh_token', new_refresh, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}
