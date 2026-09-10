import { z } from 'zod';
const name = z.string().trim().min(3, 'Escribe un nombre de al menos 3 caracteres.').max(60);
const description = z.string().trim().min(10, 'Describe para qué se usará este rol (al menos 10 caracteres).').max(400);
const workspace = z.object({ workspaceId: z.string().uuid() });
const role = workspace.extend({ roleId: z.string().uuid() });
export const createRoleSchema = z.object({ params: workspace, body: z.object({ name, description, profileId: z.enum(['reader', 'contributor', 'coordinator', 'manager']) }).strict() });
export const updateRoleSchema = z.object({ params: role, body: z.object({ name, description, expectedUpdatedAt: z.string().datetime() }).strict() });
export const deleteRoleSchema = z.object({ params: role });
