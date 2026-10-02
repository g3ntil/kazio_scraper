import { Router } from 'express';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { homedir } from 'node:os';

const helper = fileURLToPath(new URL('./x-engine-workbook.py', import.meta.url));
const router = Router();
let pending: Promise<unknown> = Promise.resolve();

function run(operation: string, id = ''): Promise<any> {
  const workbook = process.env.X_ENGINE_WORKBOOK_PATH || 'C:/Users/user/Downloads/Founder_Content_Engine_150_Conversation_Questions.xlsx';
  const bundled = path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  const python = process.env.X_ENGINE_PYTHON || (existsSync(bundled) ? bundled : process.platform === 'win32' ? 'python' : 'python3');
  return new Promise((resolve, reject) => {
    execFile(python, [helper, workbook, operation, id], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, encoding: 'utf8' }, (error, stdout) => {
      try {
        const result = JSON.parse(stdout);
        if (result.error) return reject(Object.assign(new Error(result.error), { status: result.status || 500 }));
        if (!error) return resolve(result);
      } catch { /* Report a safe error; never expose paths or child stderr. */ }
      reject(Object.assign(new Error('The question workbook could not be opened. Check the workbook and Python configuration, then retry.'), { status: 503 }));
    });
  });
}

function enqueue(operation: string, id?: string) {
  const result = pending.then(() => run(operation, id));
  pending = result.catch(() => undefined);
  return result;
}

router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.get('/', async (_req, res) => {
  try { res.json(await enqueue('read')); }
  catch (error: any) { res.status(error.status || 500).json({ error: error.message }); }
});
for (const operation of ['used', 'unused']) {
  router.post(`/questions/:id/${operation}`, async (req, res) => {
    try {
      if (!req.params.id || req.params.id.length > 120) return res.status(400).json({ error: 'Choose a valid question.' });
      res.json(await enqueue(operation, req.params.id));
    } catch (error: any) { res.status(error.status || 500).json({ error: error.message }); }
  });
}

export default router;
