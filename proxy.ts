import { NextResponse, type NextRequest } from "next/server";

const protectedRoutes = ["/api/square/inventory/submit", "/api/admin"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  const sessionSecret = process.env.SPEAKSTOCK_SESSION_SECRET;
  const sessionCookie = request.cookies.get("speakstock_session");

  if (sessionSecret && sessionCookie?.value === sessionSecret) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.json(
      { error: "Admin login required." },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/api/square/inventory/submit/:path*", "/api/admin/:path*"],
};
