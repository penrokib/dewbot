/**
 * JWT Authentication Middleware for DewBot Multi-Tenant Gateway
 *
 * Validates Dewx JWT tokens and extracts org/user context.
 * Replaces static token auth with Dewx JWT validation.
 */

import { createHmac } from "node:crypto";

export interface JwtPayload {
  organizationId: string;
  workspaceId: string;
  userId: string;
  role: string;
  email?: string;
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  valid: boolean;
  payload?: JwtPayload;
  error?: string;
}

/**
 * Decode and verify a JWT token.
 * Uses HMAC-SHA256 (HS256) which matches Dewx's NestJS JWT setup.
 */
export function validateToken(token: string, secret?: string): AuthResult {
  const jwtSecret = secret || process.env.JWT_SECRET;
  if (!jwtSecret) {
    return { valid: false, error: "JWT_SECRET not configured" };
  }

  try {
    const parts = token.replace(/^Bearer\s+/i, "").split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Invalid JWT format" };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify signature
    const expectedSignature = createHmac("sha256", jwtSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    if (signatureB64 !== expectedSignature) {
      return { valid: false, error: "Invalid JWT signature" };
    }

    // Decode payload
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf-8"),
    ) as JwtPayload;

    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return { valid: false, error: "JWT expired" };
    }

    // Validate required fields
    if (!payload.organizationId) {
      return { valid: false, error: "JWT missing organizationId" };
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: `JWT decode error: ${String(err)}` };
  }
}

/**
 * Extract auth token from various sources:
 * - WebSocket connect params
 * - HTTP Authorization header
 * - Query string
 */
export function extractToken(source: {
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  params?: Record<string, unknown>;
}): string | null {
  // Check Authorization header
  const authHeader = source.headers?.authorization || source.headers?.Authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check query param
  const queryToken = source.query?.token;
  if (typeof queryToken === "string") {
    return queryToken;
  }

  // Check params (WebSocket connect frame)
  const paramsToken = source.params?.token;
  if (typeof paramsToken === "string") {
    return paramsToken;
  }

  return null;
}
