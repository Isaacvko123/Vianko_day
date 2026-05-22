import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BOARD_STATUSES, PERMISSIONS, ROLE_DEFINITIONS } from "../dist/src/models/permissions.js";

const permissionKeys = new Set(PERMISSIONS.map((permission) => permission.key));
const rolesByName = new Map(ROLE_DEFINITIONS.map((role) => [role.name, role]));

function rolePermissions(roleName) {
  const role = rolesByName.get(roleName);
  assert.ok(role, `Missing role ${roleName}`);
  return new Set(role.permissions);
}

test("every role permission is declared once in the global catalog", () => {
  assert.equal(permissionKeys.size, PERMISSIONS.length, "Permission catalog has duplicated keys.");

  for (const role of ROLE_DEFINITIONS) {
    const rolePermissionSet = new Set(role.permissions);
    assert.equal(rolePermissionSet.size, role.permissions.length, `${role.name} has duplicated permissions.`);

    for (const permission of role.permissions) {
      assert.ok(permissionKeys.has(permission), `${role.name} references unknown permission ${permission}.`);
    }
  }
});

test("admin roles keep the full workspace capability set", () => {
  assert.deepEqual(rolePermissions("Admin"), permissionKeys);
  assert.deepEqual(rolePermissions("Admin TI"), permissionKeys);
});

test("manager, technical lead and developer boundaries stay intentional", () => {
  const manager = rolePermissions("Gerente");
  const technicalLead = rolePermissions("Lider TI");
  const coordinator = rolePermissions("Coordinador");
  const developer = rolePermissions("Developer");

  assert.ok(manager.has("project.view_all"), "Gerente debe ver todos los proyectos.");
  assert.ok(manager.has("staffing.respond"), "Gerente debe responder solicitudes de personal.");
  assert.equal(manager.has("project.delete"), false, "Gerente no debe archivar proyectos completos.");
  assert.ok(technicalLead.has("project.create"), "Lider TI debe crear proyectos propios.");
  assert.equal(technicalLead.has("project.view_all"), false, "Lider TI no debe ver todo el workspace.");
  assert.deepEqual(coordinator, technicalLead, "Coordinador debe conservar el mismo alcance que Lider TI.");
  assert.equal(developer.has("task.create"), false, "Developer no debe crear tareas.");
  assert.ok(developer.has("task.change_status"), "Developer debe mover estados de tareas asignadas.");
  assert.ok(developer.has("task.log_time"), "Developer debe registrar tiempo.");
});

test("task creators can also edit tasks", () => {
  for (const role of ROLE_DEFINITIONS) {
    const permissions = new Set(role.permissions);
    if (permissions.has("task.create")) {
      assert.ok(permissions.has("task.update"), `${role.name} puede crear tareas y tambien debe editarlas.`);
    }
  }
});

test("default board has exactly one done status and one default entry point", () => {
  const doneStatuses = DEFAULT_BOARD_STATUSES.filter((status) => status.countsAsDone);
  const defaultStatuses = DEFAULT_BOARD_STATUSES.filter((status) => status.isDefault);

  assert.equal(doneStatuses.length, 1);
  assert.equal(doneStatuses[0].category, "DONE");
  assert.equal(defaultStatuses.length, 1);
  assert.equal(defaultStatuses[0].category, "TODO");
});
