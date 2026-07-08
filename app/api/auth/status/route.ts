import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const sessionSecret = process.env.SPEAKSTOCK_SESSION_SECRET;

  if (!sessionSecret) {
    return NextResponse.json({ isAdmin: false });
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("speakstock_session");

  return NextResponse.json({
    isAdmin: sessionCookie?.value === sessionSecret,
  });
}
