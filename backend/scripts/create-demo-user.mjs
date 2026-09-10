import 'dotenv/config';
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../dist/src/utils/crypto.js';
import { createDefaultRoles, createDefaultBoard } from '../dist/src/services/workspace-bootstrap.service.js';
const prisma = new PrismaClient();
const email = 'demo@vianko.test';
try {
 if (await prisma.user.findUnique({ where: { email } })) { console.log('La cuenta genérica ya existe; no se modificó su contraseña.'); }
 else {
  const password = crypto.randomBytes(18).toString('base64url');
  const passwordHash = await hashPassword(password);
  const result = await prisma.$transaction(async tx => {
   const workspace = await tx.workspace.create({ data: { name: 'Vianko Demo', slug: 'vianko-demo' } });
   const roles = await createDefaultRoles(tx, workspace.id);
   const area = await tx.area.create({ data: { workspaceId: workspace.id, name: 'Operaciones', isDefault: true } });
   await tx.area.create({ data: { workspaceId: workspace.id, name: 'Tecnología' } });
   const locality = await tx.locality.create({ data: { workspaceId: workspace.id, areaId: area.id, name: 'Guadalajara', code: 'GDL', isDefault: true } });
   const position = await tx.position.create({ data: { workspaceId: workspace.id, areaId: area.id, name: 'Coordinación', isManager: true } });
   const user = await tx.user.create({ data: { name: 'Usuario de demostración', email, passwordHash } });
   await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId: roles.get('Admin').id, areaId: area.id, localityId: locality.id, positionId: position.id, userType: 'INTERNAL', status: 'ACTIVE', joinedAt: new Date() } });
   const project = await tx.project.create({ data: { workspaceId: workspace.id, areaId: area.id, localityId: locality.id, name: 'Primeros pasos', description: 'Prueba crear, asignar y seguir el trabajo en un espacio de demostración.', visibility: 'PRIVATE', createdById: user.id, members: { create: { userId: user.id } } } });
   const board = await createDefaultBoard(tx, workspace.id, project.id);
   const statuses = await tx.boardStatus.findMany({ where: { boardId: board.id }, orderBy: { position: 'asc' } });
   const titles = ['Organizar las prioridades del equipo', 'Preparar el lanzamiento', 'Validar la experiencia móvil'];
   for (let i=0;i<titles.length;i++) {
    const task = await tx.task.create({ data: { workspaceId: workspace.id, projectId: project.id, boardId: board.id, statusId: statuses[i===2 ? 3 : i].id, title: titles[i], description: 'Esta tarea es de ejemplo. Ábrela para editar los detalles, comentar o registrar avances.', priority: i===0 ? 'HIGH' : 'MEDIUM', progress: i*35, createdById: user.id, assignees: { create: { userId: user.id } } } });
    await tx.activityLog.create({ data: { workspaceId: workspace.id, projectId: project.id, taskId: task.id, entityType: 'TASK', entityId: task.id, action: 'task.assigned', after: { demo: true }, pushProcessedAt: new Date() } });
   }
   return { workspaceId: workspace.id, projectId: project.id, userId: user.id };
  }, { timeout: 30000 });
  await mkdir('../private', { recursive: true, mode: 0o700 });
  await writeFile('../private/demo-access.json', JSON.stringify({ email, password, ...result }, null, 2), { mode: 0o600 });
  await writeFile('../private/acceso-demo.txt', `Vianko Day · Cuenta genérica\nCorreo: ${email}\nContraseña: ${password}\nEmpresa: Vianko Demo\nRol: Admin (solo en la empresa de demostración)\nNo tiene membresía en las empresas existentes.\n`, { mode: 0o600 });
  console.log('Cuenta genérica creada en Vianko Demo. Credenciales guardadas en private/acceso-demo.txt.');
 }
} finally { await prisma.$disconnect(); }
