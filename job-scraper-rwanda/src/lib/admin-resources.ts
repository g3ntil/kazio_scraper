// Shared allowlist. This is not a general-purpose service-role proxy.
export const ADMIN_RPC_NAMES = new Set([
  'admin_cron_overview', 'admin_set_cron_active', 'retry_failed_jobs',
  'retry_failed_staging_rows', 'deactivate_expired_jobs', 'flag_duplicate_jobs',
  'heal_pipeline',
]);
const ADMIN_TABLES = new Set(['jobs', 'raw_brightermonday_jobs', 'raw_ndangira_jobs',
  'raw_jobinrwanda_jobs', 'jobs_greatrwandajobs', 'jobs_jobwebrwanda']);

export function isAdminResource(path: string, method: string): boolean {
  const table = /^\/rest\/v1\/([a-z_]+)(?:\?[^#]*)?$/.exec(path);
  if (table && ADMIN_TABLES.has(table[1])) {
    return ['POST', 'PATCH', 'DELETE'].includes(method);
  }
  const match = /^\/rest\/v1\/rpc\/([a-z_]+)(?:\?[^#]*)?$/.exec(path);
  return method === 'POST' && !!match && ADMIN_RPC_NAMES.has(match[1]);
}
