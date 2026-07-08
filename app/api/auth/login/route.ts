import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type LoginRequestBody = {
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginRequestBody;

    if (
      typeof body.password !== "string" ||
      body.password !== process.env.SPEAKSTOCK_SHARED_PASSWORD
    ) {
      return NextResponse.json(
        { success: false, error: "Incorrect password." },
        { status: 401 },
      );
    }

    const sessionSecret = process.env.SPEAKSTOCK_SESSION_SECRET;

    if (!sessionSecret) {
      throw new Error(
        "Missing SPEAKSTOCK_SESSION_SECRET environment variable.",
      );
    }

    const cookieStore = await cookies();

    cookieStore.set("speakstock_session", sessionSecret, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Login error:", error);

    return NextResponse.json(
      { success: false, error: "Login failed." },
      { status: 500 },
    );
  }
}
