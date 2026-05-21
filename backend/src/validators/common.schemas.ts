import { z } from "zod";

export const uuidParam = z.string().uuid();

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const dateString = z.string().datetime().optional();
