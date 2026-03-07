"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles, Upload, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, Globe, BarChart3, AlertTriangle, Database } from 'lucide-react';
import { toast } from 'sonner';
import { importCSV, startBatchEnrichment, getJobStatus, getProfiles, scoreBatch, type CompanyProfile, type EnrichmentJobStatus, type DataPoint } from '../services/api';

interface Props {
    icpId: string | null;
}

const QUALITY_COLORS: Record<string, string> = {
    high: 'from-emerald-500 to-green-500',
    medium: 'from-amber-500 to-yellow-500',
    low: 'from-orange-500 to-red-500',
    insufficient: 'from-slate-600 to-slate-500',
    pending: 'from-slate-700 to-slate-600',
};

const FIT_COLORS: Record<string, { bg: string; text: string }> = {
    high: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
    medium: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
    low: { bg: 'bg-red-500/10', text: 'text-red-400' },
    insufficient: { bg: 'bg-slate-500/10', text: 'text-slate-400' },
    unscored: { bg: 'bg-slate-500/10', text: 'text-slate-500' },
};

export function EnrichmentDashboard({ icpId }: Props) {
    const [domains, setDomains] = useState('');
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobStatus, setJobStatus] = useState<EnrichmentJobStatus | null>(null);
    const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
    const [scores, setScores] = useState<Record<string, any>>({});
    const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => { loadProfiles(); }, []);
    useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

    const loadProfiles = async () => {
        try {
            const { data } = await getProfiles(0, 100);
            setProfiles(data.profiles || []);
        } catch { }
    };

    const startPolling = useCallback((jId: string) => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const { data } = await getJobStatus(jId);
                setJobStatus(data);
                if (data.status === 'completed' || data.status === 'failed') {
                    clearInterval(pollRef.current!);
                    pollRef.current = null;
                    if (data.status === 'completed') {
                        toast.success(`Enrichment complete: ${data.completed}/${data.total} companies`);
                        loadProfiles();
                        // Auto-score if ICP is selected
                        if (icpId) {
                            try {
                                const { data: scoreData } = await scoreBatch(icpId);
                                const scoreMap: Record<string, any> = {};
                                for (const s of scoreData.scores) scoreMap[s.domain] = s;
                                setScores(scoreMap);
                            } catch { }
                        }
                    } else {
                        toast.error('Enrichment failed');
                    }
                }
            } catch { }
        }, 2000);
    }, [icpId]);

    const handleDomainSubmit = async () => {
        const domainList = domains
            .split(/[\n,]/)
            .map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, ''))
            .filter(d => d && d.includes('.'));

        if (!domainList.length) { toast.error('Enter valid domains'); return; }
        if (domainList.length > 500) { toast.error('Maximum 500 domains'); return; }

        setLoading(true);
        try {
            const { data } = await startBatchEnrichment(domainList, icpId || undefined);
            setJobId(data.job_id);
            setJobStatus({ job_id: data.job_id, status: 'queued', total: data.total, completed: 0, failed: 0, progress_pct: 0, results: [] });
            startPolling(data.job_id);
            toast.success(`Enriching ${data.total} companies...`);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Failed to start');
        } finally {
            setLoading(false);
        }
    };

    const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        try {
            const { data } = await importCSV(file);
            setJobId(data.job_id);
            setJobStatus({ job_id: data.job_id, status: 'queued', total: data.domains_imported, completed: 0, failed: 0, progress_pct: 0, results: [] });
            startPolling(data.job_id);
            toast.success(`Imported ${data.domains_imported} domains — enriching...`);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'CSV import failed');
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="h-full overflow-y-auto" id="enrichment-dashboard">
            <div className="max-w-5xl mx-auto p-8 pb-24">
                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Enrichment Engine</h1>
                        <p className="text-sm text-slate-400">Multi-source verified data with quality guarantees</p>
                    </div>
                </div>

                {/* Input area */}
                <div className="bg-[#131A2E] border border-slate-800/60 rounded-2xl p-6 mb-6">
                    <div className="flex gap-4 mb-4">
                        <textarea
                            value={domains}
                            onChange={e => setDomains(e.target.value)}
                            placeholder="Enter domains (one per line or comma-separated)&#10;e.g. stripe.com, notion.so, github.com"
                            rows={3}
                            className="flex-1 bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all resize-none font-mono"
                        />
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleDomainSubmit}
                            disabled={loading || !domains.trim()}
                            className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-40 shadow-lg shadow-cyan-500/15 flex items-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Enrich
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={loading}
                            className="px-5 py-2.5 bg-[#0A0F1E] border border-slate-700/60 hover:border-slate-600 text-slate-300 rounded-xl font-medium text-sm transition-all flex items-center gap-2"
                        >
                            <Upload className="w-4 h-4" /> Upload CSV
                        </button>
                        <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleCSVUpload} />
                    </div>
                </div>

                {/* Progress bar */}
                {jobStatus && jobStatus.status !== 'completed' && (
                    <div className="bg-[#131A2E] border border-slate-800/60 rounded-2xl p-5 mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                                <span className="text-sm font-semibold text-white">
                                    Enriching {jobStatus.completed}/{jobStatus.total}
                                </span>
                            </div>
                            <span className="text-sm text-slate-400 font-mono">{jobStatus.progress_pct}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${jobStatus.progress_pct}%` }}
                            />
                        </div>
                        {jobStatus.failed > 0 && (
                            <p className="mt-2 text-xs text-amber-400">{jobStatus.failed} failed (will retry on next run)</p>
                        )}
                    </div>
                )}

                {/* Results table */}
                {profiles.length > 0 && (
                    <div className="bg-[#131A2E] border border-slate-800/60 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
                            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                <Database className="w-4 h-4 text-slate-400" />
                                Enriched Companies ({profiles.length})
                            </h2>
                        </div>
                        <div className="divide-y divide-slate-800/40">
                            {profiles.map(profile => {
                                const score = scores[profile.domain];
                                const isExpanded = expandedDomain === profile.domain;
                                return (
                                    <div key={profile.domain}>
                                        <button
                                            onClick={() => setExpandedDomain(isExpanded ? null : profile.domain)}
                                            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors text-left"
                                        >
                                            {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                                            {/* Domain + name */}
                                            <div className="min-w-[200px]">
                                                <p className="text-sm font-semibold text-white">{profile.name || profile.domain}</p>
                                                <p className="text-xs text-slate-500 font-mono">{profile.domain}</p>
                                            </div>
                                            {/* Quality meter */}
                                            <div className="flex items-center gap-2 min-w-[140px]">
                                                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full bg-gradient-to-r ${QUALITY_COLORS[profile.quality_tier] || QUALITY_COLORS.pending} rounded-full`}
                                                        style={{ width: `${profile.quality_score * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-slate-400 font-mono">{(profile.quality_score * 100).toFixed(0)}%</span>
                                            </div>
                                            {/* ICP score */}
                                            {score && (
                                                <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${FIT_COLORS[score.fit_category]?.bg || ''} ${FIT_COLORS[score.fit_category]?.text || 'text-slate-400'}`}>
                                                    {score.final_score?.toFixed(0) || '—'}
                                                    {score.score_low != null && score.score_high != null && (
                                                        <span className="font-normal ml-1 opacity-60">
                                                            ±{((score.score_high - score.score_low) / 2).toFixed(0)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {/* Sources */}
                                            <div className="flex gap-1 ml-auto">
                                                {(profile.sources_used || []).slice(0, 3).map(s => (
                                                    <span key={s} className="px-1.5 py-0.5 bg-slate-800/60 text-slate-500 rounded text-[10px] font-mono">{s.replace('commoncrawl_', 'CC:')}</span>
                                                ))}
                                                {(profile.sources_used || []).length > 3 && (
                                                    <span className="text-xs text-slate-600">+{profile.sources_used.length - 3}</span>
                                                )}
                                            </div>
                                        </button>
                                        {/* Expanded detail */}
                                        {isExpanded && (
                                            <div className="px-12 pb-5 animate-in fade-in slide-in-from-top-2 duration-300">
                                                <div className="bg-[#0A0F1E] rounded-xl border border-slate-800/40 divide-y divide-slate-800/30">
                                                    {Object.entries(profile.enriched_data || {}).map(([field, dp]) => {
                                                        const point = dp as DataPoint;
                                                        return (
                                                            <div key={field} className="flex items-center px-4 py-3 gap-4">
                                                                <span className="text-xs text-slate-500 font-mono w-32 shrink-0">{field}</span>
                                                                <span className="text-sm text-white flex-1 truncate">
                                                                    {typeof point.value === 'object' ? JSON.stringify(point.value) : String(point.value)}
                                                                </span>
                                                                <div className="flex items-center gap-3 shrink-0">
                                                                    <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full ${point.confidence >= 0.7 ? 'bg-emerald-500' : point.confidence >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                                            style={{ width: `${point.confidence * 100}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-[10px] text-slate-500 font-mono w-8">{(point.confidence * 100).toFixed(0)}%</span>
                                                                    <span className="text-[10px] text-slate-600 font-mono w-20 truncate">{point.source}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
