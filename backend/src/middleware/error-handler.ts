import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: {
      code: "PAYLOAD_TOO_LARGE",
      message: req.path.includes("/chats/") && req.path.includes("/files/")
        ? "El archivo supera los 10 MB. Elige uno más pequeño."
        : "El contenido supera el tamaño permitido. Reduce su tamaño e inténtalo de nuevo.",
      requestId: req.requestId
    } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: err.issues[0]?.message ?? "Revisa los datos de la solicitud.",
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
    const conflict = ["P2025", "P2034"].includes(err.code);
    const statusCode = conflict || err.code === "P2002" ? 409 : 400;
    res.status(statusCode).json({
      error: {
        code: "DATABASE_CONSTRAINT_ERROR",
        message: conflict ? "Los datos cambiaron durante la operación. Actualiza y vuelve a intentarlo." : "Los datos entran en conflicto con un registro existente.",
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
