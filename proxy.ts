import { NextRequest, NextResponse } from "next/server";

const protectedPageRoutes = ["/inventory"];
const protectedApiRoutes = ["/api/square"];

function isProtectedPath(pathname: string): boolean {
  return (
    protectedPageRoutes.some((route) => pathname.startsWith(route)) ||
    protectedApiRoutes.some((route) => pathname.startsWith(route))
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const sessionSecret = process.env.SPEAKSTOCK_SESSION_SECRET;
  const sessionCookie = request.cookies.get("speakstock_session")?.value;

  if (sessionSecret && sessionCookie === sessionSecret) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/inventory/:path*", "/api/square/:path*"],
};
