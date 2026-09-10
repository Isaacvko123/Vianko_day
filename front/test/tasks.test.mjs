import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temporary = await mkdtemp(join(tmpdir(), 'vianko-task-tests-'));
await build({ entryPoints: ['src/lib/tasks.ts', 'src/api/endpoints.ts', 'src/lib/permissions.ts'], bundle: true,
  platform: 'node', format: 'esm', outdir: temporary, outExtension: { '.js': '.mjs' },
  define: { 'import.meta.env': '{"VITE_API_URL":"/api/v1","PROD":false}' } });
const { filterAndSortTasks, defaultTaskFilters, isTaskDone, canMoveTask, mergeTaskUpdate } = await import(pathToFileURL(join(temporary, 'lib/tasks.mjs')));
const { listTasks } = await import(pathToFileURL(join(temporary, 'api/endpoints.mjs')));
const { getWorkspaceCapabilities } = await import(pathToFileURL(join(temporary, 'lib/permissions.mjs')));
test.after(() => rm(temporary, { recursive: true, force: true }));
const statuses = [{ id: 'todo', category: 'TODO', countsAsDone: false }, { id: 'blocked', category: 'BLOCKED', countsAsDone: false }, { id: 'done', category: 'DONE', countsAsDone: true }];
const base = { id: 'a', title: 'Revisión de integración', description: 'Validar acceso', priority: 'MEDIUM', statusId: 'todo', progress: 25, updatedAt: '2026-09-01T12:00:00Z', assignees: [{ userId: 'ana', user: { name: 'Ana Pérez' } }] };
const select = (tasks, filters = {}) => filterAndSortTasks(tasks, statuses, { ...defaultTaskFilters, ...filters }, 'ana');

test('search matches accents, multiple words, descriptions and responsible people', () => {
  assert.equal(select([base], { search: 'integracion PEREZ acceso' }).length, 1);
  assert.equal(select([base], { search: 'integracion inexistente' }).length, 0);
});
test('filters combine and never mutate the original task collection', () => {
  const tasks = [base, { ...base, id: 'b', priority: 'URGENT', assignees: [] }];
  assert.deepEqual(select(tasks, { focus: 'mine', priority: 'URGENT' }), []);
  assert.deepEqual(select(tasks, { focus: 'unassigned' }).map(t => t.id), ['b']);
  assert.deepEqual(select(tasks, { sort: 'priority' }).map(t => t.id), ['b', 'a']);
  assert.deepEqual(tasks.map(t => t.id), ['a', 'b']);
});
test('completed tasks are excluded from overdue and blocked focus', () => {
  const tasks = [{ ...base, dueAt: '2000-01-01T00:00:00Z' }, { ...base, id: 'b', dueAt: '2000-01-01T00:00:00Z', statusId: 'done' }];
  assert.deepEqual(select(tasks, { focus: 'overdue' }).map(t => t.id), ['a']);
  assert.equal(select([{ ...base, statusId: 'blocked' }], { focus: 'blocked' }).length, 1);
  assert.equal(select(tasks, { focus: 'blocked' }).length, 0);
});
test('due dates sort before undated work, with deterministic ties', () => {
  assert.deepEqual(select([{ ...base, id: 'z' }, { ...base, id: 'b', dueAt: '2026-09-20' }, { ...base, id: 'c', dueAt: '2026-09-10' }]).map(t => t.id), ['c', 'b', 'z']);
});
test('status is the completion source of truth, even with an old completion timestamp', () => {
  assert.equal(isTaskDone({ ...base, completedAt: '2026-01-01' }, statuses), false);
  assert.equal(isTaskDone({ ...base, statusId: 'done' }, statuses), true);
});
test('reopening and clearing a plan remove values omitted by the API', () => {
  const old = { ...base, completedAt: '2026-09-01', dueAt: '2026-09-02', estimateMinutes: 60, _count: { comments: 2 } };
  const merged = mergeTaskUpdate(old, base);
  assert.equal(merged.completedAt, undefined);
  assert.equal(merged.dueAt, undefined);
  assert.equal(merged.estimateMinutes, undefined);
  assert.equal(merged._count.comments, 2);
});
test('the UI never infers authorization from assignment or workspace role', () => {
  assert.equal(canMoveTask(base, statuses, 'ana', true, true), false);
  assert.equal(canMoveTask({ ...base, capabilities: { canChangeStatus: false } }, statuses, 'ana', true, true), false);
  assert.equal(canMoveTask({ ...base, capabilities: { canChangeStatus: true } }, statuses, 'ana', false, false), true);
});
test('editing and progress capabilities follow permission keys', () => {
  const developer = getWorkspaceCapabilities({ member: { permissions: ['task.update_progress', 'task.change_status'] } });
  assert.equal(developer.canUpdateTasks, false);
  assert.equal(developer.canUpdateProgress, true);
  assert.equal(developer.canReopenTasks, false);
  const creator = getWorkspaceCapabilities({ member: { permissions: ['task.create'] } });
  assert.equal(creator.canUpdateTasks, false);
});
test('task queries load beyond the default 50 records and deduplicate overlapping pages', async () => {
  const originalFetch = global.fetch;
  const offsets = [];
  global.fetch = async (url) => {
    const parsed = new URL(url, 'http://localhost');
    offsets.push(Number(parsed.searchParams.get('offset')));
    assert.equal(parsed.searchParams.get('limit'), '100');
    assert.equal(parsed.searchParams.get('view'), 'completed');
    const offset = offsets.at(-1);
    const rows = offset === 0 ? Array.from({ length: 100 }, (_, i) => ({ id: String(i) })) : [{ id: '99' }, { id: '100' }];
    return new Response(JSON.stringify({ tasks: rows }), { status: 200 });
  };
  try { const result = await listTasks('test', 'board', 'completed'); assert.equal(result.tasks.length, 101); assert.deepEqual(offsets, [0, 100]); }
  finally { global.fetch = originalFetch; }
});
