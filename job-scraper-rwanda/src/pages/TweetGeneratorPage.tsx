import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, Bookmark, Check, Copy, Heart, History, Loader2, MessageCircle, MoreHorizontal, RefreshCw, Repeat2, Shuffle, Undo2, Upload, UserRound } from 'lucide-react';
import { loadXEngine, setQuestionUsed } from '../services/xEngineService';
import type { XEngineSnapshot, XQuestion } from '../types/xEngine';

const STORAGE_KEY = 'kazio.x-engine.selection.v1';
const button = 'inline-flex min-h-12 sm:min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition duration-150 hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]';
const secondaryButton = `${button} bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]`;

function rememberedSelection(): { category: string; id: string | null } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { category: typeof saved.category === 'string' ? saved.category : '', id: typeof saved.id === 'string' ? saved.id : null };
  } catch { return { category: '', id: null }; }
}

function shuffled(ids: string[]): string[] {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function dateLabel(value: string | null) {
  if (!value) return 'Date not recorded';
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = calendarDate
    ? new Date(Number(calendarDate[1]), Number(calendarDate[2]) - 1, Number(calendarDate[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TweetGeneratorPage() {
  const [remembered] = useState(rememberedSelection);
  const [snapshot, setSnapshot] = useState<XEngineSnapshot | null>(null);
  const [category, setCategory] = useState(remembered.category);
  const [currentId, setCurrentId] = useState<string | null>(remembered.id);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastUsedId, setLastUsedId] = useState<string | null>(null);
  const bag = useRef<string[]>([]);
  const mutationInFlight = useRef(false);

  const available = (data: XEngineSnapshot, filter: string) => data.questions.filter(q => q.status === 'UNUSED' && (!filter || q.category === filter));

  function choose(questions: XQuestion[], previous: string | null): string | null {
    const ids = new Set(questions.map(q => q.id));
    bag.current = bag.current.filter(id => ids.has(id) && id !== previous);
    if (!bag.current.length) bag.current = shuffled(questions.filter(q => q.id !== previous).map(q => q.id));
    return bag.current.pop() ?? (questions.find(q => q.id === previous)?.id || questions[0]?.id || null);
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadXEngine(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      const filter = data.categories.includes(remembered.category) ? remembered.category : '';
      const pool = available(data, filter);
      bag.current = [];
      setSnapshot(data);
      setCategory(filter);
      setCurrentId(pool.some(q => q.id === remembered.id) ? remembered.id : choose(pool, null));
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load your question bank.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry, remembered]);

  useEffect(() => {
    if (!snapshot) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ category, id: currentId })); } catch { /* Private browsing can disable storage; selection still works. */ }
  }, [category, currentId, snapshot]);

  const questions = snapshot?.questions || [];
  const pool = useMemo(() => questions.filter(q => q.status === 'UNUSED' && (!category || q.category === category)), [snapshot, category]);
  const current = pool.find(q => q.id === currentId);
  const used = useMemo(() => questions.filter(q => q.status === 'USED').sort((a, b) => (b.usedOn || '').localeCompare(a.usedOn || '')), [snapshot]);
  const remaining = questions.length - used.length;
  const busy = loading || savingId !== null;

  function changeCategory(value: string) {
    if (mutationInFlight.current || !snapshot) return;
    bag.current = [];
    setCategory(value);
    setCurrentId(choose(available(snapshot, value), null));
    setNotice('');
  }

  async function save(question: XQuestion, markUsed: boolean) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setSavingId(question.id);
    setError('');
    setNotice('');
    try {
      const data = await setQuestionUsed(question.id, markUsed);
      const filter = data.categories.includes(category) ? category : '';
      const nextPool = available(data, filter);
      setSnapshot(data);
      setCategory(filter);
      if (markUsed) {
        setLastUsedId(question.id);
        setCurrentId(choose(nextPool, question.id));
        setNotice(`${question.id} marked used. Your spreadsheet is saved.`);
      } else {
        if (lastUsedId === question.id) setLastUsedId(null);
        if (!nextPool.some(q => q.id === currentId)) setCurrentId(choose(nextPool, null));
        setNotice(`${question.id} is available again. Your spreadsheet is saved.`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this change. Please try again.');
    } finally {
      mutationInFlight.current = false;
      setSavingId(null);
    }
  }

  async function copy() {
    if (!current) return;
    try { await navigator.clipboard.writeText(current.question); setNotice('Copied. Your question is ready to post on X.'); }
    catch { setNotice('Copy is unavailable here. Select the question text and copy it manually.'); }
  }

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-4 text-[var(--text)]">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight">Tweet generator</h1>
        {snapshot && <span className="text-xs text-[var(--text-secondary)]">{remaining} left · {used.length} used</span>}
      </header>

      {error && <div role="alert" className="rounded-lg bg-[var(--red-soft)] p-4 text-sm text-[var(--red)]"><p>{error}</p><button type="button" disabled={busy} className={`${secondaryButton} mt-3`} onClick={() => { if (snapshot) setError(''); else setRetry(n => n + 1); }}><RefreshCw size={14} />{snapshot ? 'Dismiss' : 'Retry'}</button></div>}

      {loading ? <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-[var(--text-secondary)]"><Loader2 className="animate-spin" size={18} />Loading questions…</div> : snapshot && <>
        <div className="flex items-center gap-3">
          <label htmlFor="x-category" className="sr-only">Choose a topic</label>
          <select id="x-category" value={category} disabled={busy} onChange={event => changeCategory(event.target.value)} className="min-h-12 sm:min-h-10 min-w-0 flex-1 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm disabled:opacity-50"><option value="">All topics</option>{snapshot.categories.map(name => <option key={name} value={name}>{name}</option>)}</select>
          <span className="shrink-0 text-xs text-[var(--text-secondary)]">{pool.length} available</span>
        </div>

        {current ? <section aria-label="Question picker" className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]"><span>Post preview</span><span>{current.id}</span></div>
          <article aria-label="X post preview" className="rounded-lg border border-[#eff3f4] bg-white p-4 text-[#0f1419] [font-family:Arial,Helvetica,sans-serif]">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eff3f4] text-[#536471]" aria-hidden="true"><UserRound size={23} strokeWidth={1.6} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1 text-[15px] leading-5">
                  <div className="min-w-0 flex-1 flex flex-wrap gap-x-1"><span className="font-bold">Your name</span><span className="text-[#536471]">@yourhandle · now</span></div>
                  <MoreHorizontal size={19} className="shrink-0 text-[#536471]" aria-hidden="true" />
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-[16px] leading-6">{current.question}</p>
                <div aria-hidden="true" className="mt-4 flex items-center justify-between text-[#536471]">
                  <MessageCircle size={18} strokeWidth={1.6} /><Repeat2 size={19} strokeWidth={1.6} /><Heart size={18} strokeWidth={1.6} /><BarChart2 size={18} strokeWidth={1.6} />
                  <span className="flex gap-3"><Bookmark size={18} strokeWidth={1.6} /><Upload size={18} strokeWidth={1.6} /></span>
                </div>
              </div>
            </div>
          </article>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || pool.length < 2} className={secondaryButton} onClick={() => { setCurrentId(choose(pool, currentId)); setNotice(''); }}><Shuffle size={16} aria-hidden="true" />Repick</button>
            <button type="button" disabled={busy} className={`${button} bg-[#0f1419] text-white hover:bg-[#272c30]`} onClick={copy}><Copy size={16} aria-hidden="true" />Copy tweet</button>
            <button type="button" disabled={busy} className={`${button} ml-auto bg-[var(--accent-soft)] text-[var(--accent)]`} onClick={() => save(current, true)}>{savingId === current.id ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} aria-hidden="true" />}{savingId === current.id ? 'Saving…' : 'Used'}</button>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">Mark used after posting. Repick keeps the question available.</p>
        </section> : <div className="rounded-lg bg-[var(--surface-2)] p-6 text-center"><h2 className="text-base font-semibold">{remaining ? 'No unused questions in this topic' : questions.length ? 'You’ve used every question' : 'Your question bank is empty'}</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">{remaining ? 'Choose another topic to keep going.' : questions.length ? 'Restore a question from your history to use it again.' : 'Add questions to the spreadsheet, then reload.'}</p>{category && <button className={`${secondaryButton} mt-4`} onClick={() => changeCategory('')}>All topics</button>}</div>}

        <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-xs text-[var(--accent)]">{notice && <span>{notice}</span>}{lastUsedId && used.some(q => q.id === lastUsedId) && <button disabled={busy} className={secondaryButton} onClick={() => { const q = used.find(q => q.id === lastUsedId); if (q) save(q, false); }}><Undo2 size={14} />Undo</button>}</div>

        <section aria-label="Used question history">
          <button type="button" className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg text-sm text-[var(--text-secondary)]" aria-expanded={historyOpen} aria-controls="x-used-history" onClick={() => setHistoryOpen(open => !open)}><span className="flex items-center gap-2"><History size={16} />Used history · {used.length}</span><span>{historyOpen ? 'Hide' : 'Show'}</span></button>
          <div id="x-used-history" hidden={!historyOpen} className="space-y-3">{used.length ? used.map(question => <article key={question.id} className="rounded-lg bg-[var(--surface-2)] p-4"><p className="text-xs text-[var(--text-secondary)]">{question.id} · {dateLabel(question.usedOn)}</p><p className="mt-2 text-sm leading-relaxed">{question.question}</p><button type="button" disabled={busy} aria-label={`Restore question ${question.id} to unused`} className={`${button} mt-2 bg-[var(--bg)]`} onClick={() => save(question, false)}>{savingId === question.id ? <Loader2 className="animate-spin" size={14} /> : <Undo2 size={14} />}Restore</button></article>) : <p className="py-3 text-sm text-[var(--text-secondary)]">Your used questions will appear here.</p>}</div>
        </section>
      </>}
    </div>
  );
}

export default TweetGeneratorPage;
