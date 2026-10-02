import type { XEngineSnapshot } from '../types/xEngine';

async function request(path: string, options?: RequestInit): Promise<XEngineSnapshot> {
  const response = await fetch(`/api/x-engine${path}`, { cache: 'no-store', ...options });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || 'The question bank could not be saved or loaded. Please try again.');
  }
  if (!payload || !Array.isArray(payload.questions) || !Array.isArray(payload.categories)) {
    throw new Error('The question bank response was incomplete. Please try again.');
  }
  return payload;
}

export const loadXEngine = (signal?: AbortSignal) => request('', { signal });
export const setQuestionUsed = (id: string, used: boolean) =>
  request(`/questions/${encodeURIComponent(id)}/${used ? 'used' : 'unused'}`, { method: 'POST' });
