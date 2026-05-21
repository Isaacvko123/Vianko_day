import type { RequestHandler, Response } from "express";

function omitEmptyValues(value: unknown): unknown {
  if (value == undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(omitEmptyValues);
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => [key, omitEmptyValues(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined);

    return Object.fromEntries(entries);
  }

  return value;
}

/**
 * Prisma regresa campos opcionales vacios como valores nulos.
 * La API los omite para que el contrato JSON sea mas limpio y facil de consumir.
 */
export const responseSanitizer: RequestHandler = (_req, res, next) => {
  const originalJson = res.json.bind(res) as (body?: unknown) => Response;

  res.json = ((body?: unknown) => originalJson(omitEmptyValues(body))) as Response["json"];
  next();
};
