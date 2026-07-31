import { NextRequest, NextResponse } from 'next/server';

// Routes accessible without a session
const PUBLIC_PATHS = [
  '/',
  '/signin',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/set-password',
  '/resend-invite',
  '/terminos',
  '/privacidad',
  '/registro/cooperativa',
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/resend-invite',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/public',
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== '/' && pathname.startsWith(p)),
  );

  if (isPublic) return NextResponse.next();

  const refreshToken = req.cookies.get('refresh_token')?.value;

  if (!refreshToken) {
    return NextResponse.redirect(new URL('/signin', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)).*)'],
};
