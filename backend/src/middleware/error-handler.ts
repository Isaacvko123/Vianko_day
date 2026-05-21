import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request payload.",
        details: err.flatten(),
        requestId: req.requestId
      }
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: req.requestId
      }
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const statusCode = err.code === "P2002" ? 409 : 400;
    res.status(statusCode).json({
      error: {
        code: "DATABASE_CONSTRAINT_ERROR",
        message: "The request violates a database constraint.",
        requestId: req.requestId
      }
    });
    return;
  }

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error.",
      requestId: req.requestId,
      details: env.isProduction ? undefined : String(err?.message ?? err)
    }
  });
};
