import { NextResponse } from "next/server";

type LoginRequestBody = {
  password?: string;
};

export async function POST(request: Request) {
  const sharedPassword = process.env.SPEAKSTOCK_SHARED_PASSWORD;
  const sessionSecret = process.env.SPEAKSTOCK_SESSION_SECRET;

  if (!sharedPassword || !sessionSecret) {
    return NextResponse.json(
      { error: "Authentication is not configured." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as LoginRequestBody;

  if (body.password !== sharedPassword) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });

  response.cookies.set("speakstock_session", sessionSecret, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
