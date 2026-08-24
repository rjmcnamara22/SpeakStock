import { cookies } from "next/headers";

export async function requireAdmin() {
  const sessionSecret = process.env.SPEAKSTOCK_SESSION_SECRET;

  if (!sessionSecret) {
    return false;
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("speakstock_session");

  return sessionCookie?.value === sessionSecret;
}
