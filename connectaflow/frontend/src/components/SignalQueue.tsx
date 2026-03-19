"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Radio, Zap, TrendingUp, AlertTriangle, Clock, ExternalLink, RefreshCw, Loader2, Search, ShieldAlert, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { getSignalQueue, type SignalQueueItem } from '../services/api';
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
    const [queue, setQueue] = useState<SignalQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(0);
    const [summaryCounts, setSummaryCounts] = useState({ act_now: 0, work_soon: 0, review_first: 0 });

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

    useEffect(() => { loadQueue(); }, [loadQueue]);

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
            <div className="max-w-6xl mx-auto p-8 pb-24">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-lg shadow-rose-500/20">
                            <Radio className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight">Warm Signal Queue</h1>
                            <p className="text-sm text-slate-400">Contact these companies today — ranked by ICP × Signal × Recency</p>
                        </div>
                    </div>
                    <button
                        onClick={loadQueue}
                        disabled={loading}
                        className="p-2.5 bg-[#131A2E] border border-slate-800/60 rounded-xl text-slate-400 hover:text-white hover:border-slate-700 transition-all"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                </div>

                <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input
                            value={query}
                            onChange={(event) => {
                                setPage(0);
                                setQuery(event.target.value);
                            }}
                            placeholder="Search domain, company, signal, or evidence"
                            className="w-full rounded-2xl border border-slate-800/60 bg-[#131A2E] py-3 pl-9 pr-4 text-sm text-white outline-none focus:border-cyan-500/40"
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        {queueSections.map((section) => (
                            <div key={section.key} className="rounded-2xl border border-slate-800/60 bg-[#131A2E] px-4 py-3">
                                <p className="text-[11px] uppercase tracking-wider text-slate-500">{section.title}</p>
                                <p className="mt-1 text-lg font-bold text-white">{section.count}</p>
                            </div>
                        ))}
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
