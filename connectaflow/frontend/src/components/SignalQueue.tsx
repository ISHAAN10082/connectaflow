"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Radio, Zap, TrendingUp, AlertTriangle, Clock, ExternalLink, RefreshCw, Loader2, Search, ShieldAlert, ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { toast } from 'sonner';
import { getSignalQueue, listExternalSignals, updateExternalSignal, downloadExternalSignalsCSV, type SignalQueueItem, type ExternalSignal } from '../services/api';
import { getErrorMessage } from '../lib/errors';

interface Props {
    icpId: string | null;
}

const SIGNAL_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Zap }> = {
    hiring_sdr: { label: 'Hiring SDR', color: 'text-cyan-400', bg: 'bg-cyan-500/10', icon: Zap },
    hiring_ae: { label: 'Hiring AE', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Zap },
    hiring_vp_sales: { label: 'Hiring VP Sales', color: 'text-rose-400', bg: 'bg-rose-500/10', icon: TrendingUp },
    hiring_ai_ml: { label: 'Hiring AI/ML', color: 'text-cyan-400', bg: 'bg-cyan-500/10', icon: Zap },
    hiring_engineering: { label: 'Hiring Engineers', color: 'text-teal-400', bg: 'bg-teal-500/10', icon: Zap },
    hiring_marketing: { label: 'Hiring Marketing', color: 'text-sky-400', bg: 'bg-sky-500/10', icon: Zap },
    enterprise_pricing: { label: 'Enterprise Pricing', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: TrendingUp },
    not_hiring: { label: 'Not Hiring', color: 'text-slate-400', bg: 'bg-slate-500/10', icon: AlertTriangle },
    early_stage: { label: 'Early Stage', color: 'text-orange-400', bg: 'bg-orange-500/10', icon: AlertTriangle },
};

const PAGE_SIZE = 40;

export function SignalQueue({ icpId }: Props) {
    const [activeTab, setActiveTab] = useState<'internal' | 'external'>('internal');
    const [queue, setQueue] = useState<SignalQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(0);
    const [summaryCounts, setSummaryCounts] = useState({ act_now: 0, work_soon: 0, review_first: 0 });
    const [externalSignals, setExternalSignals] = useState<ExternalSignal[]>([]);
    const [externalTotal, setExternalTotal] = useState(0);
    const [externalLoading, setExternalLoading] = useState(false);

    const loadQueue = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await getSignalQueue(icpId || undefined, PAGE_SIZE, page * PAGE_SIZE, query || undefined);
            setQueue(data.queue || []);
            setTotal(data.total || 0);
            setSummaryCounts(data.summary || { act_now: 0, work_soon: 0, review_first: 0 });
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to load signal queue'));
        } finally {
            setLoading(false);
        }
    }, [icpId, page, query]);

    const loadExternalSignals = useCallback(async () => {
        setExternalLoading(true);
        try {
            const { data } = await listExternalSignals({ status: 'new', limit: 50 });
            setExternalSignals(data.signals || []);
            setExternalTotal(data.total || 0);
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to load external signals'));
        } finally {
            setExternalLoading(false);
        }
    }, []);

    useEffect(() => { loadQueue(); }, [loadQueue]);

    useEffect(() => {
        if (activeTab === 'external') {
            void loadExternalSignals();
        }
    }, [activeTab, loadExternalSignals]);

    const handleDismissExternal = async (id: string) => {
        try {
            await updateExternalSignal(id, 'dismissed');
            setExternalSignals((prev) => prev.filter((s) => s.id !== id));
            toast.success('Signal dismissed');
        } catch {
            toast.error('Failed to dismiss signal');
        }
    };

    const handleAddExternal = async (id: string) => {
        try {
            await updateExternalSignal(id, 'added');
            setExternalSignals((prev) => prev.map((s) =>
                s.id === id ? { ...s, status: 'added' } : s
            ));
            toast.success('Signal added to your system — visible in Internal Signals');
        } catch {
            toast.error('Failed to add signal');
        }
    };

    const queueSections = useMemo(() => {
        const hotNow = queue.filter((item) => item.priority_band === 'act_now');
        const workSoon = queue.filter((item) => item.priority_band === 'work_soon');
        const reviewFirst = queue.filter((item) => item.priority_band === 'review_first');

        return [
            {
                key: 'hot-now',
                title: 'Act Now',
                description: 'Strong urgency and enough evidence to work immediately.',
                icon: TrendingUp,
                tone: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/8',
                items: hotNow,
                count: summaryCounts.act_now,
            },
            {
                key: 'work-soon',
                title: 'Work Soon',
                description: 'Promising accounts that need attention after the hottest opportunities.',
                icon: Zap,
                tone: 'text-amber-300 border-amber-500/20 bg-amber-500/8',
                items: workSoon,
                count: summaryCounts.work_soon,
            },
            {
                key: 'review-first',
                title: 'Review First',
                description: 'Signals exist, but confidence or fit is still too weak to trust blindly.',
                icon: ShieldAlert,
                tone: 'text-slate-300 border-slate-500/20 bg-slate-500/8',
                items: reviewFirst,
                count: summaryCounts.review_first,
            },
        ];
    }, [queue, summaryCounts]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="h-full overflow-y-auto" id="signal-queue">
            <div className="max-w-6xl mx-auto p-6 pb-16">
                {/* Tab bar: Internal / External */}
                <div className="flex gap-2 mb-6">
                    <button
                        onClick={() => setActiveTab('internal')}
                        className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${activeTab === 'internal' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' : 'border-slate-800/60 text-slate-400 hover:text-white'}`}
                    >
                        Internal Signals
                    </button>
                    <button
                        onClick={() => setActiveTab('external')}
                        className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${activeTab === 'external' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' : 'border-slate-800/60 text-slate-400 hover:text-white'}`}
                    >
                        External Discovery {externalTotal > 0 && <span className="ml-1 rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-xs">{externalTotal}</span>}
                    </button>
                </div>

                {/* External Signals Tab */}
                {activeTab === 'external' && (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-lg font-bold text-white">External Signal Discovery</h2>
                                <p className="text-sm text-slate-400">Domains discovered via background scan matching your ICPs. Runs every 6 hours.</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => downloadExternalSignalsCSV('new')} className="flex items-center gap-2 rounded-xl border border-slate-800/60 bg-[#10172B] px-3 py-2 text-sm text-slate-300 hover:text-white">
                                    <Download className="w-4 h-4" /> Download CSV
                                </button>
                                <button onClick={() => void loadExternalSignals()} disabled={externalLoading} className="flex items-center gap-2 rounded-xl border border-slate-800/60 bg-[#10172B] px-3 py-2 text-sm text-slate-300 hover:text-white">
                                    <RefreshCw className={`w-4 h-4 ${externalLoading ? 'animate-spin' : ''}`} /> Refresh
                                </button>
                            </div>
                        </div>
                        {externalLoading ? (
                            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>
                        ) : externalSignals.length === 0 ? (
                            <div className="rounded-2xl border border-slate-800/60 bg-[#131A2E] p-12 text-center">
                                <Radio className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                                <p className="text-slate-400">No external signals yet. Discovery runs every 6 hours.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {externalSignals.map((sig) => (
                                    <div key={sig.id} className="rounded-2xl border border-slate-800/60 bg-[#131A2E] p-4 flex items-start gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-semibold text-white text-sm">{sig.company_name || sig.domain}</span>
                                                <span className="text-xs text-slate-500">{sig.domain}</span>
                                                <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-400">{sig.signal_type.replace(/_/g, ' ')}</span>
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sig.strength >= 0.8 ? 'bg-emerald-500/15 text-emerald-400' : sig.strength >= 0.6 ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/15 text-slate-400'}`}>
                                                    {(sig.strength * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                            {sig.evidence && <p className="text-xs text-slate-400 mb-1">{sig.evidence}</p>}
                                            <p className="text-xs text-slate-600">{new Date(sig.discovered_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {sig.status !== 'added' ? (
                                                <button
                                                    onClick={() => void handleAddExternal(sig.id)}
                                                    className="rounded-xl border border-emerald-700/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors font-medium"
                                                    title="Add to system"
                                                >
                                                    + Add
                                                </button>
                                            ) : (
                                                <span className="rounded-xl border border-emerald-700/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-400 font-medium">
                                                    ✓ Added
                                                </span>
                                            )}
                                            <button onClick={() => void handleDismissExternal(sig.id)} className="rounded-xl border border-slate-800/60 bg-[#0E1528] p-1.5 text-slate-500 hover:text-red-400 transition-colors" title="Dismiss">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Internal Signals Tab - existing content below */}
                {activeTab === 'internal' && (
                <div>
                <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800/60 bg-[#131A2E] px-4 py-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/12 text-rose-300">
                            <Radio className="h-4 w-4" />
                        </div>
                        <div>
                            <h1 className="text-base font-semibold text-white">Warm Signal Queue</h1>
                            <p className="text-xs text-slate-500">Ranked by ICP fit, signal strength, and recency.</p>
                        </div>
                    </div>

                    <div className="relative min-w-[260px] flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input
                            value={query}
                            onChange={(event) => {
                                setPage(0);
                                setQuery(event.target.value);
                            }}
                            placeholder="Search domain, company, signal, or evidence"
                            className="w-full rounded-xl border border-slate-800/60 bg-[#0E1528] py-2.5 pl-9 pr-4 text-sm text-white outline-none focus:border-cyan-500/40"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {queueSections.map((section) => (
                            <span key={section.key} className="rounded-full border border-slate-700/80 bg-[#0E1528] px-3 py-1 text-xs text-slate-300">
                                <span className="text-slate-500">{section.title}</span>{' '}
                                <span className="font-semibold text-white">{section.count}</span>
                            </span>
                        ))}
                        <button
                            onClick={loadQueue}
                            disabled={loading}
                            className="rounded-xl border border-slate-800/60 bg-[#0E1528] p-2 text-slate-400 transition hover:text-white"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </button>
                    </div>
                </div>

                {/* Empty state */}
                {!loading && queue.length === 0 && (
                    <div className="bg-[#131A2E] border border-slate-800/60 rounded-2xl p-12 text-center">
                        <Radio className="w-10 h-10 text-slate-700 mx-auto mb-4" />
                        <h3 className="text-base font-semibold text-slate-400 mb-2">
                            {total === 0 ? 'No signals detected yet' : 'No queue items match this search'}
                        </h3>
                        <p className="text-sm text-slate-500">Enrich companies first, then review the strongest urgent accounts here.</p>
                    </div>
                )}

                {/* Queue list */}
                {queue.length > 0 && (
                    <div className="space-y-6">
                        {/* Summary bar */}
                        <div className="flex items-center gap-4 mb-2 px-1">
                            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                                Showing {queue.length} of {total} companies with signals
                            </span>
                            <div className="flex-1 h-px bg-slate-800/60" />
                            <span className="text-xs text-slate-500">Page {page + 1} of {totalPages}</span>
                        </div>

                        {queueSections.map((section) => (
                            section.items.length > 0 && (
                                <div key={section.key} className="space-y-3">
                                    <div className={`rounded-2xl border px-4 py-3 ${section.tone}`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <section.icon className="h-4 w-4" />
                                                <div>
                                                    <p className="text-sm font-semibold text-white">{section.title}</p>
                                                    <p className="text-xs text-slate-300">{section.description}</p>
                                                </div>
                                            </div>
                                            <span className="text-xs font-semibold text-white">{section.count}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {section.items.map((item, idx) => (
                                            <div
                                                key={item.domain}
                                                className="bg-[#131A2E] border border-slate-800/60 rounded-2xl p-5 hover:border-slate-700/60 transition-all group"
                                            >
                                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                                                        idx < 3 && section.key === 'hot-now'
                                                            ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400'
                                                            : 'bg-slate-800/40 text-slate-500'
                                                    }`}>
                                                        {idx + 1}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <div className="mb-2 flex flex-wrap items-center gap-3">
                                                            <h3 className="text-sm font-bold text-white truncate">{item.company_name}</h3>
                                                            <span className="text-xs text-slate-500 font-mono">{item.domain}</span>
                                                            <a
                                                                href={`https://${item.domain}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="opacity-70 transition-opacity hover:opacity-100"
                                                            >
                                                                <ExternalLink className="w-3.5 h-3.5 text-slate-500 hover:text-white" />
                                                            </a>
                                                        </div>

                                                        <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                                                            <QueueMetric label="Composite" value={item.composite_score.toFixed(0)} />
                                                            <QueueMetric label="ICP" value={item.icp_score.toFixed(0)} />
                                                            <QueueMetric label="Signal" value={item.signal_score.toFixed(0)} />
                                                            <QueueMetric label="Quality" value={`${item.quality_score.toFixed(0)}%`} />
                                                        </div>

                                                        <div className="mb-3 rounded-xl border border-slate-800/50 bg-[#0E1528] px-3 py-2">
                                                            <p className="text-[11px] uppercase tracking-wider text-slate-500">Why this rank</p>
                                                            <p className="mt-1 text-xs text-slate-300">{item.ranking_reason}</p>
                                                        </div>

                                                        <div className="flex flex-wrap gap-2 mb-3">
                                                            {item.signals.map((sig, sigIdx) => {
                                                                const config = SIGNAL_CONFIG[sig.type] || { label: sig.type, color: 'text-slate-400', bg: 'bg-slate-500/10', icon: Zap };
                                                                return (
                                                                    <div key={sigIdx} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${config.bg}`}>
                                                                        <config.icon className={`w-3 h-3 ${config.color}`} />
                                                                        <span className={`text-xs font-semibold ${config.color}`}>{sig.label || config.label}</span>
                                                                        <span className="text-[10px] text-slate-500">{sig.effective_strength.toFixed(0)}</span>
                                                                        {sig.age_days <= 7 && (
                                                                            <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded font-bold">NEW</span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>

                                                        {item.signals[0]?.evidence && (
                                                            <div className="rounded-xl border border-slate-800/50 bg-[#0E1528] px-3 py-2">
                                                                <p className="text-[11px] uppercase tracking-wider text-slate-500">Why now</p>
                                                                <p className="mt-1 text-xs text-slate-300 break-words max-h-20 overflow-y-auto pr-1">
                                                                    {item.signals[0].evidence}
                                                                </p>
                                                            </div>
                                                        )}

                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            <a
                                                                href={`/?screen=leads&q=${encodeURIComponent(item.domain)}`}
                                                                className="rounded-lg border border-slate-800/60 bg-[#0E1528] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:text-white"
                                                            >
                                                                Find Contacts
                                                            </a>
                                                            <a
                                                                href={`/?screen=enrichment`}
                                                                className="rounded-lg border border-slate-800/60 bg-[#0E1528] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:text-white"
                                                            >
                                                                Review Enrichment
                                                            </a>
                                                            <a
                                                                href={`/?screen=playbooks`}
                                                                className="rounded-lg border border-slate-800/60 bg-[#0E1528] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:text-white"
                                                            >
                                                                Launch Play
                                                            </a>
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 rounded-2xl border border-slate-800/50 bg-[#0E1528] px-4 py-3 lg:min-w-[150px]">
                                                        <div className="flex items-center gap-1 text-xs text-slate-400">
                                                            <Clock className="w-3 h-3" />
                                                            {item.signals[0]?.age_days != null
                                                                ? item.signals[0].age_days < 1
                                                                    ? 'Fresh today'
                                                                    : `${item.signals[0].age_days.toFixed(0)}d old`
                                                                : 'Unknown'}
                                                        </div>
                                                        <div className="mt-3 space-y-1">
                                                            <p className="text-[11px] uppercase tracking-wider text-slate-500">Recommendation</p>
                                                            <p className="text-sm font-semibold text-white">{item.recommended_action}</p>
                                                            <p className="text-xs text-slate-500">
                                                                {section.key === 'hot-now' ? 'Strong enough to route into execution.' : section.key === 'work-soon' ? 'Prepare the account after the hottest opportunities.' : 'Signals exist, but still need human validation.'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        ))}

                        {totalPages > 1 && (
                            <div className="flex items-center justify-between rounded-2xl border border-slate-800/60 bg-[#131A2E] px-4 py-3">
                                <span className="text-xs text-slate-500">Page {page + 1} of {totalPages}</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPage((current) => Math.max(0, current - 1))}
                                        disabled={page === 0}
                                        className="rounded-xl border border-slate-800/60 bg-[#0E1528] p-2 text-slate-400 transition-all hover:text-white disabled:opacity-30"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                                        disabled={page >= totalPages - 1}
                                        className="rounded-xl border border-slate-800/60 bg-[#0E1528] p-2 text-slate-400 transition-all hover:text-white disabled:opacity-30"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                </div>
                )} {/* end activeTab === 'internal' */}
            </div>
        </div>
    );
}

function QueueMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-800/50 bg-[#0E1528] px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-semibold text-white">{value}</p>
        </div>
    );
}
