import compression from "compression";
import cors from "cors";
import express from "express";
import { corsOptions, generalApiRateLimit, helmetSecurityHeaders } from "./config/security.js";
import { errorHandler } from "./middleware/error-handler.js";
import { queryPollutionGuard } from "./middleware/query-pollution-guard.js";
import { requestContext } from "./middleware/request-context.js";
import { responseSanitizer } from "./middleware/response-sanitizer.js";
import { apiRouter } from "./routes/index.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // El orden importa: request id, seguridad, body parsing y finalmente rutas.
  app.use(requestContext);
  app.use(helmetSecurityHeaders);
  app.use(cors(corsOptions));
  app.use(generalApiRateLimit);
  app.use(queryPollutionGuard);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(compression());
  app.use(responseSanitizer);

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "vianko-day-backend"
    });
  });

  app.use("/api/v1", apiRouter);

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route not found."
      }
    });
  });

  app.use(errorHandler);

  return app;
}
