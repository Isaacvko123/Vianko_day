import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incomingId = req.header("X-Request-Id");
  const requestId = incomingId && incomingId.length <= 128 ? incomingId : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}
