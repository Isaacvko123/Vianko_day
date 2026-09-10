import type { Role, UserType } from '../types';
const labels: Record<string, string> = { Admin: 'Administrador', 'Admin TI': 'Administrador · legado', Gerente: 'Responsable de área', 'Lider TI': 'Coordinador · legado', Developer: 'Colaborador · legado', 'Solo lectura': 'Consulta' };
export const roleLabel = (role?: Pick<Role, 'name' | 'isSystem'>) => role ? (role.isSystem ? labels[role.name] : undefined) ?? role.name : 'Sin rol';
const externalKeys = new Set(['task.view_all', 'task.comment', 'task.log_time', 'task.update_progress', 'task.change_status']);
export function availableRoles(roles: Role[], type: UserType, selectedId?: string) {
  return roles.filter(role => (!role.isSystem || !['Admin TI', 'Lider TI', 'Developer'].includes(role.name) || role.id === selectedId)
    && (type !== 'EXTERNAL' || Boolean(role.permissions?.length && role.permissions.every(key => externalKeys.has(key))))
    && (type !== 'INTERNAL' || role.name !== 'Invitado externo' || role.id === selectedId));
}
export function roleSummary(role?: Role) {
  const keys = role?.permissions ?? [];
  if (keys.includes('workspace.manage')) return 'Administra personas, roles y estructura. Acceso a todos los proyectos de la empresa.';
  if (keys.includes('project.view_area')) return 'Coordina proyectos y personas de su área y localidades. Responde solicitudes de apoyo.';
  if (keys.includes('task.assign')) return 'Crea, asigna y revisa trabajo en los proyectos donde participa. No administra la empresa.';
  if (keys.includes('task.update_progress')) return 'Actualiza sus tareas, comenta y registra tiempo. La coordinación revisa y cierra el trabajo.';
  if (keys.includes('task.comment')) return 'Consulta y comenta las tareas que se le comparten.';
  return 'Consulta las tareas que se le comparten. No modifica ni asigna trabajo.';
}
