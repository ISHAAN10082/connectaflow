"use client";

import { useState, useEffect } from 'react';
import { Radio, Zap, TrendingUp, AlertTriangle, Clock, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getSignalQueue, type SignalQueueItem } from '../services/api';

interface Props {
    icpId: string | null;
}

const SIGNAL_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Zap }> = {
    hiring_sdr: { label: 'Hiring SDR', color: 'text-violet-400', bg: 'bg-violet-500/10', icon: Zap },
    hiring_ae: { label: 'Hiring AE', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Zap },
    hiring_vp_sales: { label: 'Hiring VP Sales', color: 'text-rose-400', bg: 'bg-rose-500/10', icon: TrendingUp },
    hiring_ai_ml: { label: 'Hiring AI/ML', color: 'text-cyan-400', bg: 'bg-cyan-500/10', icon: Zap },
    hiring_engineering: { label: 'Hiring Engineers', color: 'text-indigo-400', bg: 'bg-indigo-500/10', icon: Zap },
    hiring_marketing: { label: 'Hiring Marketing', color: 'text-purple-400', bg: 'bg-purple-500/10', icon: Zap },
    enterprise_pricing: { label: 'Enterprise Pricing', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: TrendingUp },
    not_hiring: { label: 'Not Hiring', color: 'text-slate-400', bg: 'bg-slate-500/10', icon: AlertTriangle },
    early_stage: { label: 'Early Stage', color: 'text-orange-400', bg: 'bg-orange-500/10', icon: AlertTriangle },
};

export function SignalQueue({ icpId }: Props) {
    const [queue, setQueue] = useState<SignalQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    const loadQueue = async () => {
        setLoading(true);
        try {
            const { data } = await getSignalQueue(icpId || undefined, 100);
            setQueue(data.queue || []);
            setTotal(data.total || 0);
        } catch (err: any) {
            toast.error('Failed to load signal queue');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadQueue(); }, [icpId]);

    return (
        <div className="h-full overflow-y-auto" id="signal-queue">
            <div className="max-w-4xl mx-auto p-8 pb-24">
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

                {/* Empty state */}
                {!loading && queue.length === 0 && (
                    <div className="bg-[#131A2E] border border-slate-800/60 rounded-2xl p-12 text-center">
                        <Radio className="w-10 h-10 text-slate-700 mx-auto mb-4" />
                        <h3 className="text-base font-semibold text-slate-400 mb-2">No signals detected yet</h3>
                        <p className="text-sm text-slate-500">Enrich companies first — signals are detected automatically from careers pages and page structure.</p>
                    </div>
                )}

                {/* Queue list */}
                {queue.length > 0 && (
                    <div className="space-y-3">
                        {/* Summary bar */}
                        <div className="flex items-center gap-4 mb-2 px-1">
                            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                                {total} companies with signals
                            </span>
                            <div className="flex-1 h-px bg-slate-800/60" />
                        </div>

                        {queue.map((item, idx) => (
                            <div
                                key={item.domain}
                                className="bg-[#131A2E] border border-slate-800/60 rounded-2xl p-5 hover:border-slate-700/60 transition-all group"
                            >
                                <div className="flex items-start gap-4">
                                    {/* Rank */}
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${idx < 3
                                            ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400'
                                            : 'bg-slate-800/40 text-slate-500'
                                        }`}>
                                        {idx + 1}
                                    </div>

                                    {/* Company info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-sm font-bold text-white truncate">{item.company_name}</h3>
                                            <span className="text-xs text-slate-500 font-mono">{item.domain}</span>
                                            <a
                                                href={`https://${item.domain}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5 text-slate-500 hover:text-white" />
                                            </a>
                                        </div>

                                        {/* Signals */}
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {item.signals.map((sig, sigIdx) => {
                                                const config = SIGNAL_CONFIG[sig.type] || { label: sig.type, color: 'text-slate-400', bg: 'bg-slate-500/10', icon: Zap };
                                                return (
                                                    <div key={sigIdx} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${config.bg}`}>
                                                        <config.icon className={`w-3 h-3 ${config.color}`} />
                                                        <span className={`text-xs font-semibold ${config.color}`}>{config.label}</span>
                                                        {sig.age_days <= 7 && (
                                                            <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded font-bold">NEW</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Evidence preview */}
                                        {item.signals[0]?.evidence && (
                                            <p className="text-xs text-slate-500 line-clamp-1 italic">
                                                &ldquo;{item.signals[0].evidence}&rdquo;
                                            </p>
                                        )}
                                    </div>

                                    {/* Scores */}
                                    <div className="flex items-center gap-4 shrink-0">
                                        {/* Composite score */}
                                        <div className="text-right">
                                            <div className={`text-lg font-bold ${item.composite_score >= 60 ? 'text-emerald-400'
                                                    : item.composite_score >= 30 ? 'text-amber-400'
                                                        : 'text-slate-400'
                                                }`}>
                                                {item.composite_score.toFixed(0)}
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Score</div>
                                        </div>
                                        {/* Signal freshness */}
                                        <div className="text-right">
                                            <div className="flex items-center gap-1 text-xs text-slate-400">
                                                <Clock className="w-3 h-3" />
                                                {item.signals[0]?.age_days != null
                                                    ? item.signals[0].age_days < 1
                                                        ? 'Today'
                                                        : `${item.signals[0].age_days.toFixed(0)}d ago`
                                                    : '—'
                                                }
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
