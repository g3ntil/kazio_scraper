import React, { useState, useEffect, useCallback } from 'react';
import { 
  Key, 
  RefreshCw, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ShieldCheck, 
  ShieldAlert,
  Zap, 
  Cpu, 
  Layers, 
  Activity, 
  RotateCcw, 
  X, 
  Sliders, 
  HelpCircle,
  Sparkles,
  Server,
  ArrowRight,
  Flame,
  Check
} from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { GeminiKey } from '../types/dashboard';

export const KeysPage: React.FC = () => {
  const { data: dashboardData, refreshAll } = useDashboard();
  const [keys, setKeys] = useState<GeminiKey[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add Key Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newProvider, setNewProvider] = useState<'gemini' | 'openrouter'>('gemini');
  const [newApiKey, setNewApiKey] = useState<string>('');
  const [newRpmLimit, setNewRpmLimit] = useState<number>(15);
  const [newRpdLimit, setNewRpdLimit] = useState<number>(1500);
  const [isSubmittingKey, setIsSubmittingKey] = useState<boolean>(false);
  const [addKeyError, setAddKeyError] = useState<string | null>(null);

  // Search / Filter for Keys table
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<'all' | 'gemini' | 'openrouter'>('all');

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai-keys/telemetry', { headers: { Accept: 'application/json' } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Key telemetry failed (${response.status})`);
      setKeys((body.keys as GeminiKey[]) || []);
    } catch (err: any) {
      console.error('Failed to load protected AI key telemetry:', err);
      showToast(`Could not load protected key telemetry: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 4000);
  };

  const handleToggleActive = async (key: GeminiKey) => {
    setActionLoading(key.id);
    try {
      const nextActive = !key.active;
      const response = await fetch(`/api/ai-keys/${key.id}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nextActive ? 'enable' : 'disable' })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Key update failed');
      showToast(`Key #${key.id} is now ${nextActive ? 'enabled' : 'disabled'}.`);
      await loadKeys();
      await refreshAll();
    } catch (err: any) {
      showToast(`Failed to update key #${key.id}: ${err.message}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearBlock = async (keyId: number) => {
    setActionLoading(keyId);
    try {
      const response = await fetch(`/api/ai-keys/${keyId}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_block' })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Block clear failed');
      showToast(`Cleared cooldown block and reset failure count for Key #${keyId}.`);
      await loadKeys();
      await refreshAll();
    } catch (err: any) {
      showToast(`Failed to clear block for key #${keyId}: ${err.message}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetCounter = async (keyId: number) => {
    setActionLoading(keyId);
    try {
      const response = await fetch(`/api/ai-keys/${keyId}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_counter' })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Counter reset failed');
      showToast(`Daily request counter reset to 0 for Key #${keyId}.`);
      await loadKeys();
      await refreshAll();
    } catch (err: any) {
      showToast(`Failed to reset counter for key #${keyId}: ${err.message}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newApiKey.trim()) {
      setAddKeyError('Please provide a valid API key string.');
      return;
    }

    setIsSubmittingKey(true);
    setAddKeyError(null);

    try {
      const response = await fetch('/api/ai-keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: newProvider, apiKey: newApiKey.trim(),
          rpmLimit: Number(newRpmLimit) || 15,
          rpdLimit: Number(newRpdLimit) || 1500
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Failed to register key');

      showToast(`Successfully registered new ${newProvider.toUpperCase()} key to rotation pool.`);
      setIsAddModalOpen(false);
      setNewApiKey('');
      setNewRpmLimit(15);
      setNewRpdLimit(1500);
      await loadKeys();
      await refreshAll();
    } catch (err: any) {
      setAddKeyError(err.message || 'Failed to insert API key.');
    } finally {
      setIsSubmittingKey(false);
    }
  };

  // Calculated Capacity & Key Pool Metrics
  const activeKeys = keys.filter(k => k.active && k.status === 'active');
  const activeGeminiKeys = keys.filter(k => k.provider === 'gemini' && k.active && k.status === 'active');
  const activeOpenRouterKeys = keys.filter(k => k.provider === 'openrouter' && k.active && k.status === 'active');
  const totalRpdCapacity = activeKeys.reduce((acc, k) => acc + (k.rpd_limit || 200), 0);
  
  const nowIso = new Date().toISOString();
  const todayDateStr = nowIso.split('T')[0];

  const totalUsedToday = keys.reduce((acc, k) => {
    if (k.day_window_start && k.day_window_start.startsWith(todayDateStr)) {
      return acc + (k.requests_today || 0);
    }
    return acc;
  }, 0);

  const usableKeysCount = activeKeys.filter(k => {
    const isBlocked = (k.rpm_blocked_until && k.rpm_blocked_until > nowIso) || 
                      (k.rpd_blocked_until && k.rpd_blocked_until > nowIso);
    const currentWindowRequests = k.day_window_start?.startsWith(todayDateStr) ? (k.requests_today || 0) : 0;
    const isOverDaily = currentWindowRequests >= (k.rpd_limit || 200);
    return !isBlocked && !isOverDaily;
  }).length;

  const coolingDownKeysCount = keys.filter(k => {
    return (k.rpm_blocked_until && k.rpm_blocked_until > nowIso) || 
           (k.rpd_blocked_until && k.rpd_blocked_until > nowIso);
  }).length;

  const awaitingPipeline = dashboardData?.capacity?.awaiting || 0;
  const daysToClear = totalRpdCapacity > 0 ? (awaitingPipeline / totalRpdCapacity).toFixed(1) : '—';

  // Filtered Keys list
  const filteredKeys = keys.filter(k => {
    if (providerFilter !== 'all' && k.provider !== providerFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = `key #${k.id}`.includes(q) || `${k.id}`.includes(q);
      const matchProvider = k.provider.toLowerCase().includes(q);
      const matchStatus = k.status.toLowerCase().includes(q);
      return matchId || matchProvider || matchStatus;
    }
    return true;
  });

  return (
    <div className="space-y-6 font-body pb-12">
      {/* Toast Notification */}
      {feedbackMessage && (
        <div className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between shadow-sm border transition-all ${
          feedbackMessage.type === 'success' 
            ? 'bg-[#eef5eb] text-[#16813d] border-[#16813d]/20' 
            : 'bg-[#fdf2f2] text-[#ba1a1a] border-[#ba1a1a]/20'
        }`}>
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#16813d]" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#ba1a1a]" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button 
            onClick={() => setFeedbackMessage(null)}
            className="text-stone-400 hover:text-stone-600 ml-4 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-sans font-bold text-[#442a22] tracking-tight">AI Keys &amp; Capacity Manager</h1>
            <span className="px-2 py-0.5 rounded-full bg-[#293417]/10 text-[#293417] text-[11px] font-bold uppercase tracking-wider">
              {usableKeysCount} Usable in Pool
            </span>
          </div>
          <p className="text-xs text-[#725a39] mt-1">
            Manage multi-key round-robin rotation, automatic backoff recovery, daily rate ceilings, and OpenRouter fallbacks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              loadKeys();
              refreshAll();
            }}
            disabled={loading}
            className="px-3.5 py-2 rounded-lg bg-white hover:bg-[#f5f2ea] border border-[#e6e2d6] text-[#442a22] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-98"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#293417]' : 'text-[#725a39]'}`} />
            Refresh Pool
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-[#442a22] hover:bg-[#2e1c17] text-[#fbf9f5] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-98"
          >
            <Plus className="w-4 h-4 text-[#e6e2d6]" />
            Add Key to Pool
          </button>
        </div>
      </div>

      {/* Capacity Summary Cards (5-grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Active Gemini Keys */}
        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-2xs hover:border-[#725a39]/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[#725a39] uppercase tracking-wider">Active Gemini Keys</span>
            <div className="p-1.5 rounded-md bg-[#293417]/10 text-[#293417]">
              <Cpu className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-sans font-bold text-[#442a22]">
            {activeGeminiKeys.length}
          </div>
          <div className="text-[11px] text-[#725a39] mt-1 flex items-center gap-1">
            <span>of {keys.length} configured keys</span>
          </div>
        </div>

        {/* Configured Daily RPD */}
        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-2xs hover:border-[#725a39]/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[#725a39] uppercase tracking-wider">Daily RPD Capacity</span>
            <div className="p-1.5 rounded-md bg-[#725a39]/10 text-[#725a39]">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-sans font-bold text-[#442a22]">
            {totalRpdCapacity.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#725a39] mt-1">
            <span>Requests/day combined</span>
          </div>
        </div>

        {/* Requests Used Today */}
        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-2xs hover:border-[#725a39]/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[#725a39] uppercase tracking-wider">Requests Used Today</span>
            <div className="p-1.5 rounded-md bg-[#442a22]/10 text-[#442a22]">
              <Activity className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-sans font-bold text-[#442a22]">
            {totalUsedToday.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#725a39] mt-1 flex items-center justify-between">
            <span>{totalRpdCapacity > 0 ? Math.round((totalUsedToday / totalRpdCapacity) * 100) : 0}% consumed</span>
            <div className="w-14 bg-[#f3efe6] h-1.5 rounded-full overflow-hidden">
              <div 
                style={{ width: `${Math.min(100, totalRpdCapacity > 0 ? (totalUsedToday / totalRpdCapacity) * 100 : 0)}%` }} 
                className="h-full bg-[#293417] rounded-full"
              />
            </div>
          </div>
        </div>

        {/* OpenRouter Fallbacks */}
        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-2xs hover:border-[#725a39]/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[#725a39] uppercase tracking-wider">OpenRouter Fallback</span>
            <div className="p-1.5 rounded-md bg-[#a5690c]/10 text-[#a5690c]">
              <Zap className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-sans font-bold text-[#442a22]">
            {activeOpenRouterKeys.length}
          </div>
          <div className="text-[11px] text-[#725a39] mt-1">
            <span>{activeOpenRouterKeys.length > 0 ? 'Standby active' : 'None configured'}</span>
          </div>
        </div>

        {/* Usable Rotation State */}
        <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-2xs hover:border-[#725a39]/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[#725a39] uppercase tracking-wider">Pool Availability</span>
            <div className="p-1.5 rounded-md bg-[#16813d]/10 text-[#16813d]">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-sans font-bold text-[#16813d]">
            {usableKeysCount} <span className="text-xs text-[#725a39] font-normal">usable</span>
          </div>
          <div className="text-[11px] text-[#725a39] mt-1 flex items-center gap-1">
            {coolingDownKeysCount > 0 ? (
              <span className="text-[#ba1a1a] font-semibold">{coolingDownKeysCount} cooling down</span>
            ) : (
              <span className="text-[#16813d]">100% operational</span>
            )}
            <span className="text-stone-300">·</span>
            <span>~{daysToClear}d to drain</span>
          </div>
        </div>
      </div>

      {/* Main Content Area: Key Pool Table + Side Info Panel */}
      <div className="space-y-6">
        {/* Keys Pool Management Table */}
        <div className="bg-white rounded-lg border border-[#e6e2d6] shadow-2xs overflow-hidden">
          {/* Table Toolbar */}
          <div className="p-4 border-b border-[#e6e2d6] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#fdfcfb]">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-[#442a22]" />
              <span className="text-xs font-sans font-bold text-[#442a22] uppercase tracking-wider">
                Configured Key Pool ({filteredKeys.length} of {keys.length} Keys)
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Provider Filter */}
              <div className="flex rounded-md border border-[#e6e2d6] overflow-hidden p-0.5 bg-white text-[11px]">
                <button
                  onClick={() => setProviderFilter('all')}
                  className={`px-2.5 py-1 rounded font-medium cursor-pointer transition-colors ${
                    providerFilter === 'all' 
                      ? 'bg-[#442a22] text-[#fbf9f5]' 
                      : 'text-[#725a39] hover:bg-[#f5f2ea]'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setProviderFilter('gemini')}
                  className={`px-2.5 py-1 rounded font-medium cursor-pointer transition-colors ${
                    providerFilter === 'gemini' 
                      ? 'bg-[#442a22] text-[#fbf9f5]' 
                      : 'text-[#725a39] hover:bg-[#f5f2ea]'
                  }`}
                >
                  Gemini
                </button>
                <button
                  onClick={() => setProviderFilter('openrouter')}
                  className={`px-2.5 py-1 rounded font-medium cursor-pointer transition-colors ${
                    providerFilter === 'openrouter' 
                      ? 'bg-[#442a22] text-[#fbf9f5]' 
                      : 'text-[#725a39] hover:bg-[#f5f2ea]'
                  }`}
                >
                  OpenRouter
                </button>
              </div>

              {/* Text Search */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search key ID or status..."
                className="px-3 py-1 bg-white border border-[#e6e2d6] rounded-md text-xs text-[#442a22] placeholder:text-stone-400 focus:outline-none focus:border-[#442a22]"
              />
            </div>
          </div>

          {/* Security Notice Strip */}
          <div className="px-4 py-2 bg-[#fbf9f5] border-b border-[#e6e2d6] flex items-center justify-between text-[11px] text-[#725a39]">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#293417]" />
              <span>Zero client leakage: Raw secret keys are write-only and never queried or rendered in browser DOM.</span>
            </div>
            <span className="font-mono text-[10px] text-stone-400">table: gemini_keys</span>
          </div>

          {/* Table Content */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-xs text-[#725a39] gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-[#293417]" />
              <span>Loading AI Key Pool &amp; Usage Telemetry...</span>
            </div>
          ) : filteredKeys.length === 0 ? (
            <div className="py-16 text-center text-xs text-[#725a39]">
              <p className="font-medium text-[#442a22]">No API keys found matching your filter.</p>
              <p className="mt-1 text-stone-400">Click &quot;Add Key to Pool&quot; above to add your first Gemini or OpenRouter key.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#fbf9f5] border-b border-[#e6e2d6] text-[#725a39] uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Key ID</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4">Rotation Status</th>
                    <th className="py-3 px-4 min-w-[160px]">Daily Usage (RPD)</th>
                    <th className="py-3 px-4">Target Rate</th>
                    <th className="py-3 px-4">Last Activity</th>
                    <th className="py-3 px-4">Fail Count</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6e2d6]">
                  {filteredKeys.map((k) => {
                    const isBlocked = (k.rpm_blocked_until && k.rpm_blocked_until > nowIso) || 
                                      (k.rpd_blocked_until && k.rpd_blocked_until > nowIso);
                    const currentWindowRequests = k.day_window_start?.startsWith(todayDateStr) ? (k.requests_today || 0) : 0;
                    const isOverDaily = currentWindowRequests >= (k.rpd_limit || 1500);
                    const usagePct = Math.min(Math.round((currentWindowRequests / (k.rpd_limit || 1500)) * 100), 100);
                    const isLoadingThis = actionLoading === k.id;

                    // Block time remaining calculation
                    let blockNote = '';
                    if (isBlocked) {
                      const blockTarget = (k.rpm_blocked_until && k.rpm_blocked_until > nowIso) 
                        ? k.rpm_blocked_until 
                        : k.rpd_blocked_until;
                      if (blockTarget) {
                        const diffSec = Math.max(0, Math.round((new Date(blockTarget).getTime() - new Date().getTime()) / 1000));
                        blockNote = diffSec > 60 ? `${Math.round(diffSec / 60)}m remaining` : `${diffSec}s remaining`;
                      }
                    }

                    return (
                      <tr key={k.id} className="hover:bg-[#fdfcfb] transition-colors group">
                        {/* Key ID */}
                        <td className="py-3.5 px-4 font-mono font-bold text-[#442a22]">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#293417]" />
                            <span>Key #{k.id}</span>
                          </div>
                        </td>

                        {/* Provider */}
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                            k.provider === 'gemini' 
                              ? 'bg-blue-50 text-blue-700 border-blue-200' 
                              : 'bg-purple-50 text-purple-700 border-purple-200'
                          }`}>
                            <Cpu className="w-2.5 h-2.5" />
                            {k.provider}
                          </span>
                        </td>

                        {/* Status Chip */}
                        <td className="py-3.5 px-4">
                          {!k.active ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#725a39]/10 text-[#725a39] border border-[#725a39]/20 text-[10px] font-bold uppercase tracking-wide">
                              Disabled
                            </span>
                          ) : isBlocked ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#ba1a1a]/10 text-[#ba1a1a] border border-[#ba1a1a]/20 text-[10px] font-bold uppercase tracking-wide">
                                <Flame className="w-2.5 h-2.5 text-[#ba1a1a]" />
                                Cooling Down
                              </span>
                              {blockNote && <p className="text-[10px] text-[#ba1a1a] mt-0.5 font-mono">{blockNote}</p>}
                            </div>
                          ) : isOverDaily ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#a5690c]/10 text-[#a5690c] border border-[#a5690c]/20 text-[10px] font-bold uppercase tracking-wide">
                              <AlertTriangle className="w-2.5 h-2.5 text-[#a5690c]" />
                              Daily Limit
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#16813d]/10 text-[#16813d] border border-[#16813d]/20 text-[10px] font-bold uppercase tracking-wide">
                              <Check className="w-2.5 h-2.5 text-[#16813d]" />
                              Usable
                            </span>
                          )}
                        </td>

                        {/* Daily Usage Progress Bar */}
                        <td className="py-3.5 px-4">
                          <div className="w-full max-w-[170px]">
                            <div className="flex justify-between text-[11px] font-mono text-[#725a39] mb-1">
                              <span className="font-semibold text-[#442a22]">{currentWindowRequests}</span>
                              <span className="text-stone-400">/ {k.rpd_limit || 1500} RPD</span>
                            </div>
                            <div className="w-full bg-[#f3efe6] h-1.5 rounded-full overflow-hidden">
                              <div 
                                style={{ width: `${usagePct}%` }}
                                className={`h-full rounded-full transition-all duration-300 ${
                                  usagePct >= 95 
                                    ? 'bg-[#ba1a1a]' 
                                    : usagePct >= 80 
                                      ? 'bg-[#a5690c]' 
                                      : 'bg-[#293417]'
                                }`}
                              />
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-stone-400 mt-0.5">
                              <span>{usagePct}% consumed</span>
                              {k.day_window_start && (
                                <span className="text-[9px]">reset: {k.day_window_start.split('T')[0]}</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Target Rate (RPM) */}
                        <td className="py-3.5 px-4 font-mono text-[#725a39]">
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-[#442a22]">{k.rpm_limit || 15}</span>
                            <span className="text-[10px] text-stone-400">req/min</span>
                          </div>
                          <span className="text-[9px] text-[#725a39]/70 uppercase">advisory</span>
                        </td>

                        {/* Last Activity */}
                        <td className="py-3.5 px-4 font-mono text-[#725a39] text-[11px]">
                          {k.last_used_at ? (
                            <div>
                              <span className="text-[#442a22]">{k.last_used_at.split('T')[0]}</span>
                              <span className="text-stone-400 block text-[10px]">{k.last_used_at.split('T')[1]?.substring(0, 8)} UTC</span>
                            </div>
                          ) : (
                            <span className="text-stone-400 italic">Never used</span>
                          )}
                        </td>

                        {/* Fail Count */}
                        <td className="py-3.5 px-4 font-mono">
                          {k.fail_count && k.fail_count > 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-[#ba1a1a]/10 text-[#ba1a1a] font-bold text-[11px]">
                              {k.fail_count}
                            </span>
                          ) : (
                            <span className="text-stone-400 text-[11px]">0</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                          {isBlocked && (
                            <button
                              onClick={() => handleClearBlock(k.id)}
                              disabled={isLoadingThis}
                              className="px-2.5 py-1 rounded-md bg-[#ba1a1a]/10 hover:bg-[#ba1a1a]/20 text-[#ba1a1a] border border-[#ba1a1a]/20 text-[11px] font-semibold cursor-pointer transition-colors active:scale-95 disabled:opacity-50"
                              title="Clear temporary rate-limit cooldown quarantine"
                            >
                              {isLoadingThis ? 'Clearing...' : 'Clear Block'}
                            </button>
                          )}

                          <button
                            onClick={() => handleResetCounter(k.id)}
                            disabled={isLoadingThis}
                            className="px-2.5 py-1 rounded-md bg-white hover:bg-[#ede9de] border border-[#e6e2d6] text-[#725a39] text-[11px] font-semibold cursor-pointer transition-colors active:scale-95 disabled:opacity-50 inline-flex items-center gap-1"
                            title="Reset daily requests counter to 0"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            Reset
                          </button>

                          <button
                            onClick={() => handleToggleActive(k)}
                            disabled={isLoadingThis}
                            className={`px-3 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors active:scale-95 disabled:opacity-50 ${
                              k.active 
                                ? 'bg-[#725a39]/15 hover:bg-[#725a39]/25 text-[#442a22]' 
                                : 'bg-[#293417] hover:bg-[#1f2812] text-[#fbf9f5]'
                            }`}
                          >
                            {k.active ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rotation Architecture & Operational Documentation Guide */}
        <div className="bg-[#fbf9f5] rounded-lg border border-[#e6e2d6] p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sliders className="w-4 h-4 text-[#442a22]" />
            <h2 className="text-sm font-sans font-bold text-[#442a22] uppercase tracking-wider">
              AI Key Pool Rotation &amp; Failover Architecture
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Round-Robin Scheduling */}
            <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-2xs">
              <div className="flex items-center gap-2 mb-2 text-[#293417]">
                <RotateCcw className="w-4 h-4" />
                <h3 className="font-sans font-bold text-xs text-[#442a22]">Round-Robin Scheduling</h3>
              </div>
              <p className="text-[11px] text-[#725a39] leading-relaxed">
                The extraction edge function cycles evenly through all enabled keys with remaining quota, maximizing concurrent throughput without saturating any single API key window.
              </p>
            </div>

            {/* Automated Cooldown */}
            <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-2xs">
              <div className="flex items-center gap-2 mb-2 text-[#ba1a1a]">
                <Flame className="w-4 h-4" />
                <h3 className="font-sans font-bold text-xs text-[#442a22]">Transient Backoff (429/503)</h3>
              </div>
              <p className="text-[11px] text-[#725a39] leading-relaxed">
                If Gemini responds with HTTP 429 (Rate Limit) or 503 (Overloaded), the key is quarantined for 60–180 seconds. Ingestion immediately routes to the next key without failing the job.
              </p>
            </div>

            {/* Daily Quota Guard */}
            <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-2xs">
              <div className="flex items-center gap-2 mb-2 text-[#a5690c]">
                <Clock className="w-4 h-4" />
                <h3 className="font-sans font-bold text-xs text-[#442a22]">24-Hour RPD Windows</h3>
              </div>
              <p className="text-[11px] text-[#725a39] leading-relaxed">
                Each key tracks its daily request limit (default 1,500 RPD on free tier). When exhausted, it switches to <span className="font-semibold text-[#a5690c]">Daily Limit</span> until the UTC day window rolls over.
              </p>
            </div>

            {/* OpenRouter Fallback */}
            <div className="bg-white p-4 rounded-lg border border-[#e6e2d6] shadow-2xs">
              <div className="flex items-center gap-2 mb-2 text-purple-700">
                <Zap className="w-4 h-4" />
                <h3 className="font-sans font-bold text-xs text-[#442a22]">OpenRouter Backup</h3>
              </div>
              <p className="text-[11px] text-[#725a39] leading-relaxed">
                If all Gemini keys encounter quota exhaustion or temporary blocks, the extraction worker seamlessly fails over to OpenRouter backup endpoints to keep ingestion flowing.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* "Add Key" Slide-over / Modal Dialog */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-lg border border-[#e6e2d6] shadow-xl max-w-[480px] w-full overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#e6e2d6] flex items-center justify-between bg-[#fbf9f5]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-md bg-[#442a22] text-[#fbf9f5]">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-sm text-[#442a22]">Register New API Key</h3>
                  <p className="text-[11px] text-[#725a39]">Add a Google Gemini or OpenRouter credential to the rotation pool.</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 cursor-pointer p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddKeySubmit} className="p-5 space-y-4">
              {addKeyError && (
                <div className="p-3 rounded-lg bg-[#fdf2f2] text-[#ba1a1a] border border-[#ba1a1a]/20 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{addKeyError}</span>
                </div>
              )}

              {/* Provider Selection */}
              <div>
                <label className="block text-xs font-bold text-[#442a22] uppercase tracking-wider mb-1.5">
                  AI Provider
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewProvider('gemini')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      newProvider === 'gemini' 
                        ? 'bg-[#293417]/10 border-[#293417] text-[#293417]' 
                        : 'bg-white border-[#e6e2d6] text-[#725a39] hover:bg-[#fbf9f5]'
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    Google Gemini
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProvider('openrouter')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      newProvider === 'openrouter' 
                        ? 'bg-purple-50 border-purple-500 text-purple-700' 
                        : 'bg-white border-[#e6e2d6] text-[#725a39] hover:bg-[#fbf9f5]'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    OpenRouter
                  </button>
                </div>
              </div>

              {/* API Key Input (Secret Masked) */}
              <div>
                <label className="block text-xs font-bold text-[#442a22] uppercase tracking-wider mb-1.5">
                  API Key Secret <span className="text-[#ba1a1a]">*</span>
                </label>
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder={newProvider === 'gemini' ? 'AIzaSy...' : 'sk-or-v1-...'}
                  required
                  className="w-full px-3 py-2 bg-white border border-[#e6e2d6] rounded-lg text-xs font-mono text-[#442a22] focus:outline-none focus:border-[#442a22] placeholder:text-stone-400"
                />
                <p className="text-[10px] text-[#725a39] mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-[#293417]" />
                  Secure Write-Only: Once saved, this key can never be viewed or decrypted in the frontend.
                </p>
              </div>

              {/* Limit Configuration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#442a22] uppercase tracking-wider mb-1">
                    RPM Limit (req/min)
                  </label>
                  <input
                    type="number"
                    value={newRpmLimit}
                    onChange={(e) => setNewRpmLimit(Number(e.target.value))}
                    min={1}
                    max={600}
                    className="w-full px-3 py-2 bg-white border border-[#e6e2d6] rounded-lg text-xs font-mono text-[#442a22] focus:outline-none focus:border-[#442a22]"
                  />
                  <span className="text-[10px] text-stone-400">Default: 15 RPM</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#442a22] uppercase tracking-wider mb-1">
                    RPD Limit (req/day)
                  </label>
                  <input
                    type="number"
                    value={newRpdLimit}
                    onChange={(e) => setNewRpdLimit(Number(e.target.value))}
                    min={10}
                    max={100000}
                    className="w-full px-3 py-2 bg-white border border-[#e6e2d6] rounded-lg text-xs font-mono text-[#442a22] focus:outline-none focus:border-[#442a22]"
                  />
                  <span className="text-[10px] text-stone-400">Default: 1,500 RPD</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[#e6e2d6] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white hover:bg-[#f5f2ea] border border-[#e6e2d6] text-[#725a39] text-xs font-semibold cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingKey}
                  className="px-5 py-2 rounded-lg bg-[#442a22] hover:bg-[#2e1c17] text-[#fbf9f5] text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-60"
                >
                  {isSubmittingKey ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving to Pool...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Save Key to Pool
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
