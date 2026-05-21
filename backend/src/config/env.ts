import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  INITIAL_WORKSPACE_NAME: z.string().trim().min(2).default("Vianko"),
  INITIAL_WORKSPACE_SLUG: z.string().trim().min(2).default("vianko"),
  INITIAL_ADMIN_NAME: z.string().trim().min(2).default("Isaac Serrano"),
  INITIAL_ADMIN_EMAIL: z.string().trim().email().default("isaac.serrano@vianko.com.mx"),
  INITIAL_ADMIN_PASSWORD: z.string().min(8).default("Systemof01"),
  INITIAL_DEFAULT_AREA_NAME: z.string().trim().min(2).default("TI"),
  INITIAL_DEFAULT_LOCALITY_NAME: z.string().trim().min(2).default("Guadalajara"),
  INITIAL_DEFAULT_LOCALITY_CODE: z.string().trim().min(2).max(24).default("GDL"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  TOKEN_HASH_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(3).default("vianko-day-api"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  COMMENT_ENCRYPTION_KEY: z.string().min(32),
  LOG_HASH_SECRET: z.string().min(32)
});

const environment = environmentSchema.parse(process.env);
const commentEncryptionKeyBuffer = Buffer.from(environment.COMMENT_ENCRYPTION_KEY, "base64");

if (commentEncryptionKeyBuffer.length !== 32) {
  throw new Error("COMMENT_ENCRYPTION_KEY must be a base64-encoded 32-byte key for AES-256-GCM.");
}

export const env = {
  ...environment,
  isProduction: environment.NODE_ENV === "production",
  corsOrigins: environment.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
  commentEncryptionKey: commentEncryptionKeyBuffer
};
