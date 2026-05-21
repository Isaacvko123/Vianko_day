export const PERMISSIONS = [
  { key: "workspace.manage", description: "Manage workspace settings and security." },
  { key: "workspace.invite_users", description: "Invite internal and external users." },
  { key: "workspace.view_reports", description: "View workspace-level reports." },
  { key: "area.manage", description: "Create and update workspace areas." },
  { key: "area.approve_members", description: "Approve pending members in the user's area." },
  { key: "locality.manage", description: "Create and update workspace localities." },
  { key: "position.manage", description: "Create and update positions for an area." },
  { key: "member.manage", description: "Manage users, roles, areas and positions." },
  { key: "project.create", description: "Create projects." },
  { key: "project.update", description: "Update projects." },
  { key: "project.delete", description: "Archive or delete projects." },
  { key: "project.view_all", description: "View all workspace projects." },
  { key: "project.manage_members", description: "Add or remove project members." },
  { key: "project.request_staffing", description: "Request people from other areas for a project." },
  { key: "staffing.respond", description: "Approve or reject staffing requests for the user's area." },
  { key: "board.create", description: "Create boards." },
  { key: "board.update", description: "Update boards and statuses." },
  { key: "task.create", description: "Create tasks." },
  { key: "task.update", description: "Update tasks." },
  { key: "task.update_progress", description: "Update task progress without editing core task fields." },
  { key: "task.delete", description: "Archive or delete tasks." },
  { key: "task.assign", description: "Assign and unassign users." },
  { key: "task.change_status", description: "Move tasks between statuses." },
  { key: "task.comment", description: "Comment on tasks." },
  { key: "task.log_time", description: "Register worked time." },
  { key: "task.view_all", description: "View project tasks." },
  { key: "report.view_project", description: "View project reports." },
  { key: "report.view_workspace", description: "View workspace reports." }
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

const allPermissions = PERMISSIONS.map((permission) => permission.key);

export const ROLE_DEFINITIONS: Array<{
  name: string;
  description: string;
  permissions: PermissionKey[];
}> = [
  {
    name: "Admin",
    description: "Administracion total del workspace. Uso reservado para Isaac/admin TI.",
    permissions: allPermissions
  },
  {
    name: "Admin TI",
    description: "Administracion tecnica con alcance amplio. No es para gerentes de area.",
    permissions: allPermissions
  },
  {
    name: "Lider TI",
    description: "Coordina trabajo tecnico propio o asignado. Crea, edita y asigna sin ver todo el workspace.",
    permissions: [
      "project.create",
      "project.update",
      "project.manage_members",
      "project.request_staffing",
      "board.create",
      "board.update",
      "task.create",
      "task.update",
      "task.update_progress",
      "task.assign",
      "task.change_status",
      "task.comment",
      "task.log_time",
      "task.view_all",
      "report.view_project"
    ]
  },
  {
    name: "Gerente",
    description: "Gestiona proyectos, actividades y personal de su area.",
    permissions: [
      "workspace.invite_users",
      "area.approve_members",
      "position.manage",
      "project.create",
      "project.update",
      "project.view_all",
      "project.manage_members",
      "project.request_staffing",
      "staffing.respond",
      "board.create",
      "board.update",
      "task.create",
      "task.update",
      "task.update_progress",
      "task.assign",
      "task.change_status",
      "task.comment",
      "task.log_time",
      "task.view_all",
      "report.view_project",
      "report.view_workspace"
    ]
  },
  {
    name: "Coordinador",
    description: "Coordina como lider tecnico: crea, edita y asigna solo en proyectos propios o donde participa.",
    permissions: [
      "project.create",
      "project.update",
      "project.manage_members",
      "project.request_staffing",
      "board.create",
      "board.update",
      "task.create",
      "task.update",
      "task.update_progress",
      "task.assign",
      "task.change_status",
      "task.comment",
      "task.log_time",
      "task.view_all",
      "report.view_project"
    ]
  },
  {
    name: "Developer",
    description: "Actualiza estados, avances, comentarios y tiempo. No crea tareas.",
    permissions: ["task.update_progress", "task.change_status", "task.comment", "task.log_time", "task.view_all", "report.view_project"]
  },
  {
    name: "Colaborador",
    description: "Seguimiento operativo sin administracion.",
    permissions: ["task.comment", "task.log_time", "task.view_all"]
  },
  {
    name: "Invitado externo",
    description: "Limited project collaborator.",
    permissions: ["task.comment", "task.log_time", "task.view_all"]
  },
  {
    name: "Solo lectura",
    description: "Read-only project access.",
    permissions: ["task.view_all", "report.view_project"]
  },
  {
    name: "Cliente",
    description: "External client access to visible task activity.",
    permissions: ["task.comment", "task.view_all"]
  }
];

export const DEFAULT_BOARD_STATUSES = [
  { name: "Por hacer", color: "#64748b", position: 0, category: "TODO", countsAsDone: false, isDefault: true },
  { name: "En proceso", color: "#2563eb", position: 1, category: "IN_PROGRESS", countsAsDone: false, isDefault: false },
  { name: "Bloqueado", color: "#dc2626", position: 2, category: "BLOCKED", countsAsDone: false, isDefault: false },
  { name: "En revision", color: "#d97706", position: 3, category: "REVIEW", countsAsDone: false, isDefault: false },
  { name: "Terminado", color: "#16a34a", position: 4, category: "DONE", countsAsDone: true, isDefault: false }
] as const;
