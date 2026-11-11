import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Append-only audit log (JSON lines). Every veto decision, every human
 * approval/decline and every tool execution is recorded with a timestamp.
 */
export class AuditLog {
  constructor(path) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
  }

  record(event, details = {}) {
    const entry = { ts: new Date().toISOString(), event, ...details };
    appendFileSync(this.path, JSON.stringify(entry) + '\n');
    return entry;
  }
}
