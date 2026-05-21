import type { NextFunction, Request, Response } from "express";
import type { AnyZodObject } from "zod";

export function validate(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Desde aqui los controladores pueden confiar en req.body/query/params.
    const parsed = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params
    });

    req.body = parsed.body ?? req.body;
    if (parsed.query) {
      Object.defineProperty(req, "query", {
        value: parsed.query,
        configurable: true,
        enumerable: true
      });
    }
    req.params = parsed.params ?? req.params;
    next();
  };
}
