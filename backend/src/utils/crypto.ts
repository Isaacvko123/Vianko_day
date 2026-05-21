import crypto from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type AccessTokenPayload = {
  sub: string;
  typ: "access";
};

export async function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 3,
    parallelism: 1
  });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

/** Los access tokens son cortos a proposito. La rotacion refresh vive en auth.service.ts. */
export function signAccessToken(userId: string) {
  return jwt.sign(
    {
      sub: userId,
      typ: "access"
    } satisfies AccessTokenPayload,
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
      issuer: env.JWT_ISSUER,
      algorithm: "HS256"
    }
  );
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: env.JWT_ISSUER,
    algorithms: ["HS256"]
  }) as AccessTokenPayload;
}

export function generateOpaqueToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return crypto.createHmac("sha256", env.TOKEN_HASH_SECRET).update(token).digest("hex");
}

export function hashLogValue(value: string) {
  return crypto.createHmac("sha256", env.LOG_HASH_SECRET).update(value).digest("hex");
}

/**
 * Cifrado reversible para comentarios.
 * Passwords y tokens nunca usan esto; se hashean.
 */
export function encryptText(plainText: string) {
  const initializationVector = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", env.commentEncryptionKey, initializationVector);
  const encryptedText = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return {
    bodyCiphertext: encryptedText.toString("base64"),
    bodyNonce: initializationVector.toString("base64"),
    bodyAuthTag: authenticationTag.toString("base64")
  };
}

/** Descifrar solo despues de validar acceso a la tarea y visibilidad del comentario. */
export function decryptText(encrypted: {
  bodyCiphertext: string;
  bodyNonce: string;
  bodyAuthTag: string;
}) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    env.commentEncryptionKey,
    Buffer.from(encrypted.bodyNonce, "base64")
  );
  decipher.setAuthTag(Buffer.from(encrypted.bodyAuthTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.bodyCiphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}
