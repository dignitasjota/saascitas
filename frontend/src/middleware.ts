import { NextRequest, NextResponse } from 'next/server'

// Public pages that never require a session.
const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
])

/**
 * Server-side auth gate. Now that tokens live in httpOnly cookies, the server
 * can check for a session before rendering protected pages, instead of relying
 * only on the client-side guards. It checks presence, not validity — the
 * backend still verifies the JWT on every API call.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/book/')) {
    return NextResponse.next()
  }

  const hasSession =
    req.cookies.has('access_token') || req.cookies.has('refresh_token')

  if (!hasSession) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Run on page routes only — skip the API proxy, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
