import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_DEFINITIONS } from '../dist/src/models/permissions.js';
import { effectivePermissions, canAccessProject, canGrantRole, taskCapabilities } from '../dist/src/models/business-policy.js';
const role = name => ROLE_DEFINITIONS.find(r => r.name === name).permissions;
const scope = { active: true, userType: 'INTERNAL', permissions: role('Gerente'), isMember: false, visibility: 'WORKSPACE', memberAreaId: 'a', projectAreaId: 'a', projectLocalityId: 'gdl', localityIds: ['gdl'] };
const task = { permissions: role('Colaborador'), userType: 'INTERNAL', hasProjectAccess: true, assigned: true, mentioned: false, creator: false, done: false, statuses: [{ id: 'todo', category: 'TODO', countsAsDone: false }, { id: 'done', category: 'DONE', countsAsDone: true }, { id: 'cancel', category: 'CANCELLED', countsAsDone: false }] };
test('area visibility cannot cross area, locality, private project or inactive membership', () => {
  assert.equal(canAccessProject(scope), true);
  for (const patch of [{ projectAreaId: 'b' }, { projectLocalityId: 'cancun' }, { visibility: 'PRIVATE' }, { active: false }, { userType: 'EXTERNAL' }]) assert.equal(canAccessProject({ ...scope, ...patch }), false);
  assert.equal(canAccessProject({ ...scope, projectAreaId: 'b', isMember: true }), true);
  assert.equal(canAccessProject({ ...scope, active: false, isMember: true }), false);
});
test('a project role restricts but never elevates a workspace role', () => {
  assert.deepEqual(effectivePermissions(role('Colaborador'), role('Admin'), 'INTERNAL'), role('Colaborador'));
  assert.deepEqual(effectivePermissions(role('Coordinador'), role('Solo lectura'), 'INTERNAL'), ['task.view_all']);
  assert.equal(effectivePermissions(role('Admin'), undefined, 'EXTERNAL').includes('workspace.manage'), false);
});
test('every non-manager needs an explicit task relationship and all roles need project access', () => {
  for (const definition of ROLE_DEFINITIONS) {
    const caps = taskCapabilities({ ...task, permissions: definition.permissions, hasProjectAccess: false });
    for (const [key, value] of Object.entries(caps)) assert.deepEqual(value, key === 'allowedStatusIds' ? [] : false, `${definition.name}: ${key}`);
  }
  assert.equal(taskCapabilities({ ...task, assigned: false }).canView, false);
  assert.equal(taskCapabilities({ ...task, assigned: false, mentioned: true }).canView, true);
  assert.equal(taskCapabilities({ ...task, assigned: false, mentioned: true }).canUpdateProgress, false);
});
test('assigned readers cannot mutate and contributors cannot close or reopen', () => {
  const reader = taskCapabilities({ ...task, permissions: role('Solo lectura') });
  assert.equal(reader.canView, true);
  assert.equal(reader.canChangeStatus, false);
  assert.equal(reader.canComment, false);
  assert.equal(reader.canLogTime, false);
  assert.deepEqual(taskCapabilities(task).allowedStatusIds, ['todo']);
  assert.equal(taskCapabilities({ ...task, done: true }).canChangeStatus, false);
});
test('coordinators close and reopen; completion locks edits until reopen', () => {
  const input = { ...task, permissions: role('Coordinador') };
  assert.equal(taskCapabilities(input).canComplete, true);
  const closed = taskCapabilities({ ...input, done: true });
  assert.equal(closed.canEdit, false);
  assert.equal(closed.canReopen, true);
  assert.equal(closed.canLogTime, false);
  assert.equal(taskCapabilities({ ...input, isSubtask: true }).canCreateSubtasks, false);
  assert.equal(taskCapabilities({ ...input, parentDone: true }).canChangeStatus, false);
});
test('external users never receive internal comment capabilities', () => {
  assert.equal(taskCapabilities({ ...task, userType: 'EXTERNAL' }).canSeeInternalComments, false);
});
test('delegation cannot grant administration, exceed actor or give external operational powers', () => {
  assert.equal(canGrantRole({ actor: role('Gerente'), target: role('Admin'), userType: 'INTERNAL' }), false);
  assert.equal(canGrantRole({ actor: role('Gerente'), target: role('Gerente'), userType: 'INTERNAL' }), false);
  assert.equal(canGrantRole({ actor: role('Coordinador'), target: role('Colaborador'), userType: 'INTERNAL' }), true);
  assert.equal(canGrantRole({ actor: role('Admin'), target: role('Coordinador'), userType: 'EXTERNAL' }), false);
  assert.equal(canGrantRole({ actor: role('Admin'), target: role('Solo lectura'), userType: 'EXTERNAL' }), true);
});
