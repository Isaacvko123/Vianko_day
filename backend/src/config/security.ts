import type { CorsOptions } from "cors";
import type { Request } from "express";
import helmet from "helmet";
import rateLimit, { type RateLimitExceededEventHandler } from "express-rate-limit";
import { env } from "./env.js";
import { hashToken, verifyAccessToken } from "../utils/crypto.js";

// La libreria cors exige Error | null como primer argumento del callback.
const noCorsError: Error | null = null;

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(noCorsError, true);
      return;
    }

    if (env.corsOrigins.includes(origin)) {
      callback(noCorsError, true);
      return;
    }

    callback(new Error("Origin is not allowed by CORS policy."));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
  exposedHeaders: ["Retry-After", "RateLimit", "RateLimit-Policy"]
};

export const helmetSecurityHeaders = helmet({
  crossOriginResourcePolicy: { policy: "same-site" },
  contentSecurityPolicy: env.isProduction ? undefined : false,
  hsts: env.isProduction
    ? {
        maxAge: 15552000,
        includeSubDomains: true,
        preload: false
      }
    : false
});

const requestIdentities = new WeakMap<Request, string>();
const clientAddress = (req: Request) => req.ip || req.socket.remoteAddress || "unknown";
const isRead = (req: Request) => req.method === "GET" || req.method === "HEAD";

function apiIdentity(req: Request) {
  const existing = requestIdentities.get(req);
  if (existing) return existing;
  let identity = `ip:${clientAddress(req)}`;
  const authorization = req.header("Authorization");
  if (authorization?.startsWith("Bearer ")) {
    try {
      // Only a verified identity gets its own budget; an invented token cannot bypass it.
      const payload = verifyAccessToken(authorization.slice(7).trim());
      if (payload.typ === "access" && typeof payload.sub === "string" && payload.sub) {
        identity = `user:${payload.sub}`;
      }
    } catch { /* Invalid/expired tokens keep the anonymous IP budget. */ }
  }
  requestIdentities.set(req, identity);
  return identity;
}

const rateLimited: RateLimitExceededEventHandler = (req, res) => {
  const retryAfterSeconds = Math.max(1, Number(res.getHeader("Retry-After")) || 60);
  res.status(429).json({ error: {
    code: "RATE_LIMITED",
    message: `Hay demasiadas solicitudes seguidas. Espera ${retryAfterSeconds} segundos y vuelve a intentarlo.`,
    retryAfterSeconds,
    requestId: req.requestId
  } });
};

const rateLimitOptions = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  handler: rateLimited
};

export const generalApiRateLimit = rateLimit({
  ...rateLimitOptions,
  windowMs: 60_000,
  // Separate reads from writes, so realtime refreshes cannot consume the editing budget.
  keyGenerator: req => {
    const identity = apiIdentity(req);
    return identity.startsWith("user:") ? `${identity}:${isRead(req) ? "read" : "write"}` : identity;
  },
  limit: req => apiIdentity(req).startsWith("user:") ? (isRead(req) ? 1200 : 300) : 600,
  skip: req => req.method === "OPTIONS"
});

const failedAuthenticationOptions = {
  ...rateLimitOptions,
  skipSuccessfulRequests: true,
  // Successful login/refresh, server failures and other limiters' 429s are not bad credentials.
  requestWasSuccessful: (_req: Request, res: { statusCode: number }) => ![400, 401, 403, 422].includes(res.statusCode)
};

// A broad IP ceiling covers attempts against many accounts on a shared network.
export const authenticationRateLimit = rateLimit({
  ...failedAuthenticationOptions,
  windowMs: 5 * 60_000,
  limit: 100
});

export const loginAccountRateLimit = rateLimit({
  ...failedAuthenticationOptions,
  windowMs: 15 * 60_000,
  limit: 15,
  keyGenerator: req => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 320) : "";
    return `${clientAddress(req)}:${hashToken(email)}`;
  }
});

// Session renewal never consumes login attempts. Each route has its own store.
export const refreshRateLimit = rateLimit({
  ...failedAuthenticationOptions,
  windowMs: 5 * 60_000,
  limit: 200
});

export const invitationRateLimit = rateLimit({
  ...failedAuthenticationOptions,
  windowMs: 5 * 60_000,
  limit: 100
});
