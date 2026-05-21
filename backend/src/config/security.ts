import type { CorsOptions } from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./env.js";

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
  allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"]
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

export const generalApiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

export const authenticationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many authentication attempts. Try again later."
    }
  }
});
