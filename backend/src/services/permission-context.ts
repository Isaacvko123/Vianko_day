import { AsyncLocalStorage } from 'node:async_hooks';
import type { PermissionKey } from '../models/permissions.js';

// Reuse role queries within one request; never cache permissions across requests.
export const permissionContext = new AsyncLocalStorage<Map<string, Promise<PermissionKey[]>>>();
