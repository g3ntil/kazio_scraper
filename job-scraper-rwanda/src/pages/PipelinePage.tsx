import React, { useEffect, useState } from 'react';
import { Play, Upload, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';

async function request(url: string, body?: unknown) {
  const response = await fetch(url, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

const label: Record<string, string> = {
  idle: 'Not started', waiting: 'Waiting', listing: 'Finding jobs', details: 'Loading job pages',
  done: 'Complete', partial: 'Needs review', failed: 'Failed', syncing: 'Saving to Supabase',
  starting: 'Starting extraction', requested: 'Extractor contacted', disabled: 'Disabled',
};
const readableError = (message: string) => /503|high demand/i.test(message)
  ? 'AI provider is temporarily busy. Supabase will retry; the job status below shows the latest result.'
  : message;

export function PipelinePage() {
  const { logs, setActivePage } = useDashboard();
  const [state, setState] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [interval, setIntervalSeconds] = useState(() => Number(localStorage.getItem('scrape-interval-seconds')) || 2);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [next, rows] = await Promise.all([request('/api/pipeline'), request('/api/pipeline/jobs')]);
        if (!stopped) { setState(next); setJobs(rows); setError(''); }
      } catch (err: any) { if (!stopped) setError(`Live updates unavailable: ${err.message}. Retrying automatically.`); }
      finally { if (!stopped) timer = setTimeout(poll, 2500); }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);

  const run = async (mode: 'scrape' | 'sync') => {
    setPending(true); setError('');
    try {
      await request(mode === 'scrape' ? '/api/scrape/all' : '/api/pipeline/sync',
        mode === 'scrape' ? { background: true, intervalMs: interval * 1000 } : {});
      setState(await request('/api/pipeline'));
    } catch (err: any) { setError(err.message); }
    finally { setPending(false); }
  };
  const sources = Object.entries(state?.sources || {}) as [string, any][];
  const busy = pending || state?.running || state?.syncing;
  const cached = sources.reduce((sum, [id]) => sum + (state?.cached?.[id] || 0), 0);
  const settled = sources.filter(([, source]) => ['done', 'partial', 'failed'].includes(source.stage)).length;
  const completedJobs = jobs.filter(job => job.extraction_status === 'done').length;
  const visible = jobs.filter(job => filter === 'all' || job.source === filter);
  const button = 'min-h-12 px-5 py-3 rounded-lg font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#293417]';

  return <div className="space-y-8 font-body">
    <section className="space-y-5">
      <div><h1 className="text-3xl font-sans font-bold tracking-tight">Scrape & sync</h1>
        <p className="mt-2 text-[#725a39] max-w-2xl">Collect jobs from all four websites, save them to Supabase, and follow automatic extraction here. JobWeb Rwanda is excluded.</p></div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">Time between job pages
          <div className="mt-2 flex items-center gap-2"><input type="number" min="1" max="30" step="1" value={interval} disabled={busy}
            onChange={event => { const value = Number(event.target.value); setIntervalSeconds(value); localStorage.setItem('scrape-interval-seconds', String(value)); }}
            className="w-24 min-h-12 px-3 rounded-lg border border-[#cfc7b7] bg-white focus-visible:outline-2 focus-visible:outline-[#293417]" /> <span className="font-normal text-[#725a39]">seconds</span></div>
        </label>
        <button className={`${button} bg-[#442a22] text-[#fbf9f5] hover:bg-[#2e1c17]`} disabled={!state || busy || interval < 1 || interval > 30}
          onClick={() => run('scrape')}><Play size={16} />{state?.running ? 'Scraping websites…' : 'Scrape all 4 websites'}</button>
        <button className={`${button} bg-[#293417] text-white hover:bg-[#3c4926]`} disabled={!state || busy || !cached}
          onClick={() => run('sync')}><Upload size={16} />{state?.syncing ? 'Syncing to Supabase…' : 'Sync all to Supabase'}</button>
      </div>
      <p className="text-sm text-[#725a39]">Incomplete descriptions are retried up to three times. Completed scrapes are saved on this computer until you sync. You can leave this page and return to follow progress.</p>
      {error && <div role="alert" className="p-4 rounded-lg bg-[#ba1a1a]/10 text-[#9c1717]">{error}</div>}
      {state?.error && <p role="alert" className="text-[#ba1a1a]">{state.error}</p>}
    </section>

    <section aria-labelledby="journey-title" className="rounded-lg border border-[#ddd6c8] bg-[#fffdf9] overflow-hidden">
      <div className="p-5 border-b border-[#e6e2d6] flex flex-wrap justify-between gap-2">
        <h2 id="journey-title" className="font-bold text-lg">Scraping journey</h2>
        <span role="status" className="text-sm text-[#725a39]">{!state ? 'Connecting…' : state.running ? `${settled} of 4 websites finished` : state.finishedAt ? `Last run finished · ${settled} of 4 websites checked` : 'Ready to start'}</span>
      </div>
      <div className="divide-y divide-[#e6e2d6]">
        {sources.map(([id, source]) => <div key={id} className="p-5 grid md:grid-cols-[180px_1fr_200px] gap-4 items-start">
          <div><h3 className="font-semibold">{source.name}</h3><p className="text-sm mt-1 text-[#725a39]">{label[source.stage]}</p></div>
          <div className="min-w-0">
            {source.stage === 'listing' || source.stage === 'waiting' ? <p className="text-sm text-[#725a39]">{source.stage === 'listing' ? 'Reading the website’s job listings…' : 'This website is next in the queue.'}</p> :
              <><div className="flex justify-between text-sm mb-2"><span>{source.completed} / {source.found} job pages checked</span><span>{source.enriched} ready</span></div>
              <progress aria-label={`${source.name} job pages checked`} value={source.completed} max={Math.max(1, source.found)} className="w-full h-2 accent-[#293417]" /></>}
            {source.currentJob && <p className="mt-2 text-sm break-words">{source.currentJob}</p>}
            {source.incomplete > 0 && <p className="text-sm text-[#8b5709] mt-2">{source.incomplete} incomplete descriptions need another scrape.</p>}
            {source.error && <p className="text-sm text-[#ba1a1a] mt-2">{source.error}</p>}
          </div>
          <div className="text-sm space-y-1"><p>{state.cached[id] || 0} jobs in local buffer</p>
            <p className="text-[#725a39]">Sync: {label[source.sync]}</p>
            <p>{source.added} added on this computer · {source.existing} already saved in last sync</p>
            {source.held > 0 && <p className="text-[#8b5709]">{source.held} held locally</p>}
            {source.extraction !== 'idle' && <p className="text-[#725a39]">{label[source.extraction]}</p>}
            {source.extractionError && <p className="text-[#ba1a1a]">Last request: {readableError(source.extractionError)}</p>}
          </div>
        </div>)}
      </div>
    </section>

    <section aria-labelledby="new-jobs-title" className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3"><div>
        <h2 id="new-jobs-title" className="text-xl font-bold">New jobs added to raw tables</h2>
        <p className="text-sm text-[#725a39] mt-1">{jobs.length} added from this computer · {completedJobs} extracted. Status refreshes automatically.</p>
      </div><label className="text-sm">Website <select value={filter} onChange={event => setFilter(event.target.value)} className="min-h-12 ml-2 px-3 rounded-lg bg-white border border-[#cfc7b7]">
        <option value="all">All websites</option>{sources.map(([id, source]) => <option key={id} value={id}>{source.name}</option>)}
      </select></label></div>
      {visible.length === 0 ? <div className="py-10 px-5 bg-[#f3efe6] rounded-lg text-[#725a39]">No new jobs added yet. Scrape the websites, then select “Sync all to Supabase”. Existing jobs will not be counted as new.</div> :
        <div className="overflow-x-auto rounded-lg border border-[#ddd6c8]"><table className="w-full text-sm text-left">
          <thead className="bg-[#f3efe6]"><tr><th className="p-4">Job</th><th className="p-4">Raw table</th><th className="p-4">Extraction</th></tr></thead>
          <tbody className="divide-y divide-[#e6e2d6]">{visible.map(job => <tr key={`${job.source}:${job.key}`}>
            <td className="p-4 min-w-64"><a href={job.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">{job.title}</a><p className="text-xs text-[#725a39] mt-1">{new Date(job.addedAt).toLocaleString()}</p></td>
            <td className="p-4 font-mono text-xs">{job.table}</td>
            <td className="p-4"><span className="inline-flex items-center gap-2">{job.extraction_status === 'done' ? <CheckCircle2 size={16} className="text-[#16813d]" /> : job.extraction_status === 'failed' ? <AlertCircle size={16} className="text-[#ba1a1a]" /> : <RefreshCw size={16} />}{job.extraction_status?.replaceAll('_', ' ') || 'Pending'}</span>{job.extraction_error && <p className="text-[#ba1a1a] mt-1 max-w-sm">{readableError(job.extraction_error)}</p>}</td>
          </tr>)}</tbody></table></div>}
      <p className="text-sm text-[#725a39]">Sync requests extraction immediately. Supabase continues the queue in scheduled batches. <button onClick={() => setActivePage('queue')} className="underline underline-offset-4 font-semibold">Open extraction queue</button></p>
    </section>
    <section><h2 className="text-xl font-bold mb-3">Live activity</h2><div className="max-h-72 overflow-y-auto rounded-lg bg-[#f3efe6] p-4 space-y-3 text-sm">
      {logs.slice(0, 30).map(log => <p key={log.id}><time className="text-[#725a39] mr-3 font-mono text-xs">{new Date(log.timestamp).toLocaleTimeString()}</time>{log.message}</p>)}
    </div></section>
  </div>;
}
