import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTaskDateRange, resolveTaskPlanning } from '../dist/src/services/task-planning.service.js';
import { updateTaskSchema } from '../dist/src/validators/task.schemas.js';
const params = { taskId: '8f96f7ae-25f6-49b4-a67d-5221ff627e98' };
const startAt = '2026-09-10T00:00:00.000Z';
const dueAt = '2026-09-20T00:00:00.000Z';

test('valid and same-day task plans are accepted', () => {
  assert.doesNotThrow(() => assertTaskDateRange({ startAt, dueAt }));
  assert.doesNotThrow(() => assertTaskDateRange({ startAt, dueAt: startAt }));
  assert.doesNotThrow(() => assertTaskDateRange({ dueAt }));
});
test('creation and partial updates reject dates that reverse the existing plan', () => {
  assert.throws(() => assertTaskDateRange({ startAt: dueAt, dueAt: startAt }), /vencimiento/);
  assert.throws(() => resolveTaskPlanning({ startAt: '2026-10-01T00:00:00.000Z' }, { startAt, dueAt }), /vencimiento/);
  assert.throws(() => resolveTaskPlanning({ dueAt: '2026-08-01T00:00:00.000Z' }, { startAt, dueAt }), /vencimiento/);
});
test('omitting planning data leaves it untouched; clearFields explicitly removes it', () => {
  assert.deepEqual(resolveTaskPlanning({}, { startAt, dueAt }), { startAt: undefined, dueAt: undefined, estimateMinutes: undefined });
  assert.deepEqual(resolveTaskPlanning({ clearFields: ['startAt', 'dueAt', 'estimateMinutes'] }, { startAt, dueAt }), { startAt: null, dueAt: null, estimateMinutes: null });
  assert.equal(resolveTaskPlanning({ estimateMinutes: 0 }, {}).estimateMinutes, 0);
});
test('a cleared endpoint does not constrain the new opposite date', () => {
  const update = resolveTaskPlanning({ clearFields: ['dueAt'], startAt: '2026-10-01T00:00:00.000Z' }, { startAt, dueAt });
  assert.equal(update.dueAt, null);
  assert.equal(update.startAt.toISOString(), '2026-10-01T00:00:00.000Z');
});
test('patch validation rejects empty updates, conflicting fields and invalid progress', () => {
  for (const body of [{}, { expectedUpdatedAt: startAt }, { clearFields: [] }, { clearFields: ['dueAt'], dueAt }, { progress: 101 }, { progress: 1.5 }, { title: '  ' }]) {
    assert.equal(updateTaskSchema.safeParse({ params, body }).success, false);
  }
});
test('progress-only edits retain their narrow payload with a concurrency version', () => {
  const result = updateTaskSchema.parse({ params, body: { progress: 50, expectedUpdatedAt: startAt } });
  assert.deepEqual(result.body, { progress: 50, expectedUpdatedAt: startAt });
  assert.equal(updateTaskSchema.safeParse({ params, body: { clearFields: ['dueAt'] } }).success, true);
});
