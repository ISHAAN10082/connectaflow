"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles, Upload, Loader2, ChevronDown, ChevronRight, Database, Search, ChevronLeft, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { importCSV, startBatchEnrichment, getJobStatus, getProfiles, scoreBatch, type CompanyProfile, type EnrichmentJobStatus, type DataPoint, type ICPScoreResult, type ImportLeadsResult } from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { isHttpUrl } from '../lib/links';
import { describeEvidence, formatDataValue, formatSourceLabel } from '../lib/provenance';

interface Props {
    icpId: string | null;
    initialDomains?: string | null;
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

const PHASE_LABELS: Record<string, string> = {
    queued: 'Queued',
    loading_cache: 'Checking cached company profiles',
    commoncrawl_lookup: 'Searching Common Crawl and public archives',
    cc_complete: 'Common Crawl lookup complete, preparing live fetch',
    completed: 'Completed',
};

const FIELD_PRIORITIES: Record<string, number> = {
    company_name: 1,
    company_description: 2,
    industry: 3,
    business_model: 4,
    hq_location: 5,
    employee_count: 6,
    company_phone: 7,
    linkedin_url: 8,
    pricing_model: 9,
    funding_stage: 10,
    tech_stack: 11,
};

export function EnrichmentDashboard({ icpId, initialDomains }: Props) {
    const [domains, setDomains] = useState('');
    const [jobStatus, setJobStatus] = useState<EnrichmentJobStatus | null>(null);
    const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
    const [totalProfiles, setTotalProfiles] = useState(0);
    const [profileQuery, setProfileQuery] = useState('');
    const [profilePage, setProfilePage] = useState(0);
    const [scores, setScores] = useState<Record<string, ICPScoreResult>>({});
    const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [lastImport, setLastImport] = useState<ImportLeadsResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollRef = useRef<NodeJS.Timeout | null>(null);

    const pageSize = 50;

    const loadProfiles = useCallback(async () => {
        try {
            const { data } = await getProfiles(profilePage * pageSize, pageSize, undefined, profileQuery || undefined);
            setProfiles(data.profiles || []);
            setTotalProfiles(data.total || 0);
        } catch { }
    }, [profilePage, profileQuery]);

    useEffect(() => { loadProfiles(); }, [loadProfiles]);
    useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);
    useEffect(() => {
        if (initialDomains) setDomains(initialDomains);
    }, [initialDomains]);

    useEffect(() => {
        setProfilePage(0);
    }, [profileQuery]);

    const formatFieldLabel = (field: string) => field
        .replace(/^hq_/, 'HQ ')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());

    const phaseLabel = jobStatus?.phase
        ? (PHASE_LABELS[jobStatus.phase] || jobStatus.phase.replace(/_/g, ' '))
        : null;

    const totalProfilePages = Math.max(1, Math.ceil(totalProfiles / pageSize));

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
                                const scoreMap: Record<string, ICPScoreResult> = {};
                                for (const s of (scoreData.scores || [])) scoreMap[s.domain] = s;
                                setScores(scoreMap);
                            } catch { }
                        }
                    } else {
                        toast.error(data.error || 'Enrichment failed');
                    }
                }
            } catch { }
        }, 2000);
    }, [icpId, loadProfiles]);

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
            setJobStatus({ job_id: data.job_id, status: 'queued', phase: 'queued', total: data.total, completed: 0, failed: 0, progress_pct: 0, results: [], error: null });
            startPolling(data.job_id);
            toast.success(`Enriching ${data.total} companies...`);
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to start'));
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
            setLastImport(data);
            if (data.job_id) {
                setJobStatus({ job_id: data.job_id, status: 'queued', phase: 'queued', total: data.domains_imported, completed: 0, failed: 0, progress_pct: 0, results: [], error: null });
                startPolling(data.job_id);
                toast.success(`Imported ${data.leads_imported + data.leads_updated} leads and queued ${data.domains_imported} domains for enrichment`);
            } else {
                setJobStatus(null);
                toast.success(`Imported ${data.leads_imported + data.leads_updated} leads`);
                if (data.rows_skipped > 0) {
                    toast.info(`${data.rows_skipped} rows were skipped because they had no usable email or domain`);
                }
            }
            if (data.domains_truncated) {
                toast.info(`Only the first 500 unique domains were queued for enrichment`);
            }
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'File import failed'));
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
                    <div className="grid md:grid-cols-3 gap-3 mb-4">
                        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                            <p className="text-xs uppercase tracking-wider text-cyan-300 font-semibold">Test Path A</p>
                            <p className="text-xs text-slate-300 mt-1 leading-5">Paste a few real public company domains and confirm profiles, evidence, and quality scores appear.</p>
                        </div>
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                            <p className="text-xs uppercase tracking-wider text-emerald-300 font-semibold">Test Path B</p>
                            <p className="text-xs text-slate-300 mt-1 leading-5">Upload a lead spreadsheet with work emails. We create leads first, then enrich any business domains we can infer.</p>
                        </div>
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                            <p className="text-xs uppercase tracking-wider text-amber-300 font-semibold">What To Expect</p>
                            <p className="text-xs text-slate-300 mt-1 leading-5">Not every row becomes enrichable. Freemail rows should still import as leads, but only company domains get queued.</p>
                        </div>
                    </div>

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
                            <Upload className="w-4 h-4" /> Upload CSV/XLSX
                        </button>
                        <button
                            onClick={() => setDomains('notion.so\ngong.io\nramp.com\nintercom.com\nvanta.com\nmerge.dev')}
                            disabled={loading}
                            className="px-5 py-2.5 bg-[#0A0F1E] border border-slate-700/60 hover:border-slate-600 text-slate-300 rounded-xl font-medium text-sm transition-all"
                        >
                            Load Demo Domains
                        </button>
                        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleCSVUpload} />
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                        Upload lead files with domains, websites, or work emails. We&apos;ll create lead records and enrich any business domains we can infer.
                    </p>
                </div>

                {lastImport && (
                    <div className="grid md:grid-cols-5 gap-3 mb-6">
                        <ImportStat label="Rows Processed" value={lastImport.rows_processed} />
                        <ImportStat label="Leads Imported" value={lastImport.leads_imported} />
                        <ImportStat label="Leads Updated" value={lastImport.leads_updated} />
                        <ImportStat label="Domains Queued" value={lastImport.domains_imported} />
                        <ImportStat label="Rows Skipped" value={lastImport.rows_skipped} />
                    </div>
                )}

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
                        {phaseLabel && (
                            <p className="mb-3 text-xs text-slate-400">{phaseLabel}</p>
                        )}
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${jobStatus.progress_pct}%` }}
                            />
                        </div>
                        {jobStatus.failed > 0 && (
                            <p className="mt-2 text-xs text-amber-400">{jobStatus.failed} failed (will retry on next run)</p>
                        )}
                        {jobStatus.status === 'failed' && jobStatus.error && (
                            <p className="mt-2 text-xs text-red-400 break-words">{jobStatus.error}</p>
                        )}
                    </div>
                )}

                {/* Results table */}
                {profiles.length > 0 && (
                    <div className="bg-[#131A2E] border border-slate-800/60 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
                            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                <Database className="w-4 h-4 text-slate-400" />
                                Enriched Companies ({totalProfiles})
                            </h2>
                            <div className="relative w-full max-w-sm">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                <input
                                    value={profileQuery}
                                    onChange={(event) => setProfileQuery(event.target.value)}
                                    placeholder="Search company, domain, or enriched field"
                                    className="w-full rounded-xl border border-slate-800/60 bg-[#0E1528] py-2.5 pl-9 pr-4 text-sm text-white outline-none focus:border-cyan-500/40"
                                />
                            </div>
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
                                            {/* ICP score + tier */}
                                            {score && (
                                                <div className="flex items-center gap-2">
                                                    <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${FIT_COLORS[score.fit_category]?.bg || ''} ${FIT_COLORS[score.fit_category]?.text || 'text-slate-400'}`}>
                                                        {score.final_score?.toFixed(0) || '—'}
                                                        {score.score_low != null && score.score_high != null && (
                                                            <span className="font-normal ml-1 opacity-60">
                                                                ±{((score.score_high - score.score_low) / 2).toFixed(0)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {score.tier && (
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                            score.tier === 'T1' ? 'bg-emerald-500/20 text-emerald-400' :
                                                            score.tier === 'T2' ? 'bg-amber-500/20 text-amber-400' :
                                                            'bg-slate-500/20 text-slate-400'
                                                        }`}>{score.tier}</span>
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
                                                <a
                                                    href={`https://${profile.domain}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-2 rounded-lg border border-slate-800/60 bg-[#0E1528] p-1.5 text-slate-500 transition-colors hover:text-white"
                                                    onClick={(event) => event.stopPropagation()}
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                </a>
                                            </div>
                                        </button>
                                        {/* Expanded detail */}
                                        {isExpanded && (
                                            <div className="px-5 pb-5 md:px-12 animate-in fade-in slide-in-from-top-2 duration-300">
                                                {/* ICP Criterion Score Breakdown */}
                                                {score && Object.keys(score.criterion_scores || {}).length > 0 && (
                                                    <div className="mb-3 bg-[#0A0F1E] rounded-xl border border-slate-800/40 p-4">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">ICP Score Breakdown</p>
                                                            <div className="flex items-center gap-2">
                                                                {score.tier && (
                                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                                        score.tier === 'T1' ? 'bg-emerald-500/20 text-emerald-400' :
                                                                        score.tier === 'T2' ? 'bg-amber-500/20 text-amber-400' :
                                                                        'bg-slate-500/20 text-slate-400'
                                                                    }`}>{score.tier}</span>
                                                                )}
                                                                <span className={`text-sm font-bold ${FIT_COLORS[score.fit_category]?.text || 'text-slate-400'}`}>
                                                                    {score.final_score?.toFixed(1) || '—'} / 100
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {Object.entries(score.criterion_scores).map(([criterion, val]) => (
                                                                <div key={criterion} className="flex items-center gap-3">
                                                                    <span className="text-[11px] text-slate-400 w-32 shrink-0 capitalize">{criterion.replace(/_/g, ' ')}</span>
                                                                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full ${
                                                                                (val ?? 0) >= 70 ? 'bg-emerald-500' :
                                                                                (val ?? 0) >= 40 ? 'bg-amber-500' :
                                                                                'bg-red-500'
                                                                            }`}
                                                                            style={{ width: `${val ?? 0}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-[11px] font-mono text-slate-400 w-8 text-right">{val != null ? `${val.toFixed(0)}` : '—'}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {score.missing_fields.length > 0 && (
                                                            <p className="mt-2 text-[10px] text-amber-400">
                                                                Missing fields: {score.missing_fields.join(', ')}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="bg-[#0A0F1E] rounded-xl border border-slate-800/40 divide-y divide-slate-800/30 max-h-[420px] overflow-y-auto">
                                                    {Object.entries(profile.enriched_data || {})
                                                        .sort(([fieldA], [fieldB]) => {
                                                            const priorityA = FIELD_PRIORITIES[fieldA] ?? 999;
                                                            const priorityB = FIELD_PRIORITIES[fieldB] ?? 999;
                                                            if (priorityA !== priorityB) return priorityA - priorityB;
                                                            return fieldA.localeCompare(fieldB);
                                                        })
                                                        .map(([field, dp]) => {
                                                        const point = dp as DataPoint;
                                                        return (
                                                            <div key={field} className="px-4 py-3">
                                                                {(() => {
                                                                    const evidenceState = describeEvidence(point.evidence);
                                                                    return (
                                                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                                                                    <span className="text-xs text-slate-500 font-mono lg:w-32 shrink-0">{formatFieldLabel(field)}</span>
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="max-h-28 overflow-y-auto rounded-lg bg-white/[0.02] px-3 py-2">
                                                                            <p className="text-sm text-white break-words whitespace-pre-wrap">
                                                                                {formatDataValue(point.value) || '—'}
                                                                            </p>
                                                                        </div>
                                                                        <div className="mt-2 max-h-24 overflow-y-auto rounded-lg border border-slate-800/50 bg-[#10172B] px-3 py-2">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${evidenceState.tone}`}>
                                                                                    {evidenceState.label}
                                                                                </span>
                                                                            </div>
                                                                            <p className="mt-2 text-xs text-slate-400 break-words whitespace-pre-wrap">{evidenceState.detail}</p>
                                                                        </div>
                                                                        {point.source_url && (
                                                                            <div className="mt-2 max-h-20 overflow-y-auto rounded-lg border border-slate-800/50 bg-[#10172B] px-3 py-2">
                                                                                <p className="text-[11px] uppercase tracking-wider text-slate-500">Source URL</p>
                                                                                {isHttpUrl(point.source_url) ? (
                                                                                    <a
                                                                                        href={point.source_url}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="mt-1 inline-block text-xs text-cyan-300 break-all underline underline-offset-2 hover:text-cyan-200"
                                                                                    >
                                                                                        {point.source_url}
                                                                                    </a>
                                                                                ) : (
                                                                                    <p className="mt-1 text-xs text-slate-400 break-all">{point.source_url}</p>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-3 shrink-0 lg:self-center">
                                                                        <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                                                                            <div
                                                                                className={`h-full rounded-full ${point.confidence >= 0.7 ? 'bg-emerald-500' : point.confidence >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                                                style={{ width: `${point.confidence * 100}%` }}
                                                                            />
                                                                        </div>
                                                                        <span className="text-[10px] text-slate-500 font-mono w-8">{(point.confidence * 100).toFixed(0)}%</span>
                                                                        <span className="text-[10px] text-slate-600 font-mono max-w-[120px] break-words text-right">{formatSourceLabel(point.source)}</span>
                                                                    </div>
                                                                </div>
                                                                    );
                                                                })()}
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
                        {totalProfilePages > 1 && (
                            <div className="flex items-center justify-between border-t border-slate-800/60 px-4 py-3">
                                <span className="text-xs text-slate-500">
                                    Page {profilePage + 1} of {totalProfilePages}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setProfilePage((current) => Math.max(0, current - 1))}
                                        disabled={profilePage === 0}
                                        className="rounded-xl border border-slate-800/60 bg-[#0E1528] p-2 text-slate-400 transition-all hover:text-white disabled:opacity-30"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => setProfilePage((current) => Math.min(totalProfilePages - 1, current + 1))}
                                        disabled={profilePage >= totalProfilePages - 1}
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

function ImportStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-xl border border-slate-800/60 bg-[#131A2E] px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
            <p className="text-lg font-bold text-white mt-1">{value}</p>
        </div>
    );
}
