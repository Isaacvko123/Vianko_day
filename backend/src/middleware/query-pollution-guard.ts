import type { RequestHandler } from "express";

function hasRepeatedQueryValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return true;
  }

  if (typeof value === "object" && value !== undefined) {
    return Object.values(value as Record<string, unknown>).some(hasRepeatedQueryValue);
  }

  return false;
}

/**
 * Express 5 expone req.query como getter; librerias viejas como hpp intentan reasignarlo.
 * Este guard rechaza parametros repetidos sin mutar el request.
 */
export const queryPollutionGuard: RequestHandler = (req, res, next) => {
  if (hasRepeatedQueryValue(req.query)) {
    res.status(400).json({
      error: {
        code: "QUERY_POLLUTION",
        message: "Repeated query parameters are not allowed."
      }
    });
    return;
  }

  next();
};
