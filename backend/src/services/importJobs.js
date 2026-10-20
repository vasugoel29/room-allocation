import { randomUUID } from 'crypto';
import * as db from '../db.js';

/**
 * Background import jobs (faculty CSV, timetable CSV), recorded in import_jobs so their status
 * survives a restart and is the same on every instance. Rows are kept as a record.
 */

/** A job still "processing" after this long was cut off (e.g. a restart); its transaction rolled back. */
const STALE_MS = 15 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startJob(kind, userId) {
  const id = randomUUID();
  await db.query('INSERT INTO import_jobs (id, kind, created_by) VALUES ($1, $2, $3)', [id, kind, userId ?? null]);
  return id;
}

export const finishJob = (id, result) => db.query(
  "UPDATE import_jobs SET status = 'completed', result = $2, finished_at = NOW() WHERE id = $1", [id, JSON.stringify(result)],
);

export const failJob = (id, error) => db.query(
  "UPDATE import_jobs SET status = 'failed', result = $2, finished_at = NOW() WHERE id = $1", [id, JSON.stringify({ error })],
);

/** { status, ...result } for the polling endpoint, or null for an unknown id. */
export async function getJob(id) {
  if (!UUID.test(String(id))) return null;
  const { rows: [job] } = await db.query('SELECT status, result, created_at FROM import_jobs WHERE id = $1', [id]);
  if (!job) return null;
  if (job.status === 'processing' && Date.now() - new Date(job.created_at).getTime() > STALE_MS) {
    return { status: 'failed', error: 'The import was interrupted (the server restarted). Nothing was imported; please run it again.' };
  }
  return { status: job.status, ...job.result };
}
