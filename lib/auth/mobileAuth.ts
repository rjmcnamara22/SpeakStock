import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1;
const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

type MobileTokenPayload = {
  version: number;
  issuedAt: number;
  expiresAt: number;
};

function getMobileAuthSecret(): string {
  const secret = process.env.MOBILE_AUTH_SECRET;

  if (!secret) {
    throw new Error("MOBILE_AUTH_SECRET is not configured.");
  }

  return secret;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createSignature(encodedPayload: string): string {
  return createHmac("sha256", getMobileAuthSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function signaturesMatch(
  receivedSignature: string,
  expectedSignature: string,
): boolean {
  const receivedBuffer = Buffer.from(receivedSignature, "utf8");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function createMobileAccessToken(): string {
  const issuedAt = Math.floor(Date.now() / 1000);

  const payload: MobileTokenPayload = {
    version: TOKEN_VERSION,
    issuedAt,
    expiresAt: issuedAt + TOKEN_LIFETIME_SECONDS,
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));

  const signature = createSignature(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyMobileAccessToken(token: string): boolean {
  try {
    const [encodedPayload, receivedSignature] = token.split(".");

    if (
      !encodedPayload ||
      !receivedSignature ||
      token.split(".").length !== 2
    ) {
      return false;
    }

    const expectedSignature = createSignature(encodedPayload);

    if (!signaturesMatch(receivedSignature, expectedSignature)) {
      return false;
    }

    const payload = JSON.parse(
      decodeBase64Url(encodedPayload),
    ) as MobileTokenPayload;

    const currentTime = Math.floor(Date.now() / 1000);

    return (
      payload.version === TOKEN_VERSION &&
      Number.isInteger(payload.issuedAt) &&
      Number.isInteger(payload.expiresAt) &&
      payload.issuedAt <= currentTime &&
      payload.expiresAt > currentTime
    );
  } catch {
    return false;
  }
}

export function verifyMobilePassword(submittedPassword: string): boolean {
  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (!configuredPassword) {
    throw new Error("ADMIN_PASSWORD is not configured.");
  }

  const submittedBuffer = Buffer.from(submittedPassword, "utf8");

  const configuredBuffer = Buffer.from(configuredPassword, "utf8");

  if (submittedBuffer.length !== configuredBuffer.length) {
    return false;
  }

  return timingSafeEqual(submittedBuffer, configuredBuffer);
}

export function getBearerToken(
  authorizationHeader: string | null,
): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (
    scheme !== "Bearer" ||
    !token ||
    authorizationHeader.split(" ").length !== 2
  ) {
    return null;
  }

  return token;
}
