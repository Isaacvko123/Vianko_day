import type { Request } from "express";
import { AppError } from "./app-error.js";

/** Express 5 tipa params como string | string[]; esto mantiene controladores limpios. */
export function getParam(req: Request, key: string) {
  const value = req.params[key];

  if (!value || Array.isArray(value)) {
    throw new AppError(400, "PARAM_INVALID", `Invalid route parameter: ${key}.`);
  }

  return value;
}

/** Usar despues de que Zod garantizo que el query existe y tiene forma correcta. */
export function getQueryString(req: Request, key: string) {
  const value = req.query[key];

  if (!value || Array.isArray(value) || typeof value !== "string") {
    throw new AppError(400, "QUERY_INVALID", `Invalid query parameter: ${key}.`);
  }

  return value;
}
