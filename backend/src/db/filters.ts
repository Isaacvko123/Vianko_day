// Prisma representa "no eliminado" como timestamp nullable.
// Dejamos esos nulls centralizados para no regarlos por controladores.
export const activeRecordFilter = {
  deletedAt: null
} as const;

// Una sesion vigente es la que todavia no tiene fecha de revocacion.
export const activeSessionFilter = {
  revokedAt: null
} as const;
