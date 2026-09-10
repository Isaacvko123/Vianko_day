import { ROLE_DEFINITIONS, type PermissionKey } from './permissions.js';

// A role is an access profile, never a job title. Keep legacy system names for existing assignments.
export const ROLE_PROFILES = [
  { id: 'reader', name: 'Consulta', systemRole: 'Solo lectura', summary: 'Consulta las tareas que se le comparten.', scope: 'Proyectos donde participa y tareas asignadas, creadas o mencionadas.', actions: ['Ver tareas compartidas'], restrictions: ['No modifica, comenta ni asigna trabajo.'] },
  { id: 'contributor', name: 'Colaborador', systemRole: 'Colaborador', summary: 'Realiza y reporta el trabajo que tiene asignado.', scope: 'Proyectos donde participa y tareas asignadas, creadas o mencionadas.', actions: ['Actualizar avance y estado de sus tareas', 'Comentar y registrar tiempo'], restrictions: ['No crea ni asigna tareas.', 'La coordinación revisa y cierra el trabajo.'] },
  { id: 'coordinator', name: 'Coordinador', systemRole: 'Coordinador', summary: 'Organiza proyectos y distribuye el trabajo.', scope: 'Proyectos que crea o en los que participa.', actions: ['Crear proyectos y tareas', 'Asignar, revisar, cerrar y reabrir tareas', 'Incorporar personas y pedir apoyo a otras áreas'], restrictions: ['No administra roles ni la estructura de la empresa.', 'No ve automáticamente los proyectos de otras personas.'] },
  { id: 'manager', name: 'Responsable de área', systemRole: 'Gerente', summary: 'Coordina el trabajo y las personas de su área.', scope: 'Proyectos compartidos de su área y localidades, y proyectos donde participa.', actions: ['Todas las acciones de coordinación', 'Invitar y aprobar personas de su área', 'Responder solicitudes de apoyo de su área'], restrictions: ['No administra roles ni otras áreas.', 'Los proyectos privados requieren participación explícita.'] }
] as const;

export type RoleProfileId = typeof ROLE_PROFILES[number]['id'];
export function profilePermissions(id: RoleProfileId): PermissionKey[] {
  const profile = ROLE_PROFILES.find(item => item.id === id)!;
  return [...ROLE_DEFINITIONS.find(role => role.name === profile.systemRole)!.permissions];
}
export function identifyRoleProfile(permissions: readonly string[]) {
  return ROLE_PROFILES.find(profile => {
    const keys = profilePermissions(profile.id);
    return keys.length === permissions.length && keys.every(key => permissions.includes(key));
  })?.id;
}
export const reservedRoleNames = new Set([...ROLE_DEFINITIONS.map(role => role.name), 'Administrador', 'Responsable de área', 'Consulta'].map(name => name.toLocaleLowerCase('es')));
