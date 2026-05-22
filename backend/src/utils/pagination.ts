export type PaginationInput = {
  limit?: number;
  offset?: number;
};

export function readPagination(input: PaginationInput) {
  const requestedLimit = Number.isFinite(input.limit) ? input.limit : 25;
  const requestedOffset = Number.isFinite(input.offset) ? input.offset : 0;
  const limit = Math.min(Math.max(requestedLimit ?? 25, 1), 100);
  const offset = Math.max(requestedOffset ?? 0, 0);

  return { limit, offset };
}

export function paginationMeta(total: number, limit: number, offset: number) {
  return {
    total,
    limit,
    offset,
    hasMore: offset + limit < total
  };
}
