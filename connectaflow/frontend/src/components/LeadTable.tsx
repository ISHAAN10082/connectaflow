"use client";

import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
    Building2, Database, Save, ExternalLink, Snowflake, CalendarClock
} from 'lucide-react';
import { toast } from 'sonner';
import {
    getLead,
    getLeads,
    updateLead,
    updateProfile,
    generateMeetingBrief,
    getMeetingBrief,
    applyCooldown,
    removeCooldown,
    type DataPoint,
    type DataValue,
    type Lead,
    type MeetingBrief,
} from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { isHttpUrl, isTelValue } from '../lib/links';
import { describeEvidence, formatDataValue, formatSourceLabel } from '../lib/provenance';

const QUALITY_DOT: Record<string, string> = {
    high: 'bg-emerald-400',
    medium: 'bg-amber-400',
    low: 'bg-orange-400',
    insufficient: 'bg-slate-500',
    pending: 'bg-slate-600',
};

const STATUS_OPTIONS = ['Not Contacted', 'Contacted', 'Replied', 'Meeting Booked', 'Cool Down'];

const PROFILE_FIELDS: { key: string; label: string; multiline?: boolean; numeric?: boolean }[] = [
    { key: 'company_name', label: 'Company Name' },
    { key: 'industry', label: 'Industry' },
    { key: 'business_model', label: 'Business Model' },
    { key: 'hq_location', label: 'HQ Location' },
    { key: 'company_phone', label: 'Company Phone' },
    { key: 'linkedin_url', label: 'LinkedIn Profile', multiline: true },
    { key: 'employee_count', label: 'Employee Count', numeric: true },
    { key: 'pricing_model', label: 'Pricing Model' },
    { key: 'funding_stage', label: 'Funding Stage' },
    { key: 'company_description', label: 'Company Description', multiline: true },
];

type LeadDraft = {
    first_name: string;
    last_name: string;
    email: string;
    domain: string;
    status: string;
    notes: string;
    follow_up_date: string;
};

type ProfileDraft = Record<string, string>;

const PAGE_SIZE = 50;

function normalizeFieldValue(raw: string, numeric?: boolean): DataValue {
    const trimmed = raw.trim();
    if (numeric) {
        if (!trimmed) return null;
        const numericValue = Number(trimmed);
        if (!Number.isFinite(numericValue)) {
            throw new Error('Numeric fields must contain valid numbers');
        }
        return numericValue;
    }
    return trimmed ? trimmed : null;
}

function comparableValue(value: DataValue): string {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).join('\n');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value).trim();
}

function displayLeadName(lead: Lead): string {
    const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
    return fullName || lead.email;
}

function makeLeadDraft(lead: Lead): LeadDraft {
    return {
        first_name: lead.first_name || '',
        last_name: lead.last_name || '',
        email: lead.email || '',
        domain: lead.domain || '',
        status: lead.status || 'Not Contacted',
        notes: typeof lead.custom_data?.notes === 'string' ? lead.custom_data.notes : '',
        follow_up_date: lead.follow_up_date ? lead.follow_up_date.slice(0, 10) : '',
    };
}

function makeProfileDraft(lead: Lead): ProfileDraft {
    const enriched = lead.company_profile?.enriched_data || {};
    const draft: ProfileDraft = {};
    for (const field of PROFILE_FIELDS) {
        draft[field.key] = formatDataValue(enriched[field.key]?.value);
    }
    if (!draft.company_name && lead.company_profile?.name) {
        draft.company_name = lead.company_profile.name;
    }
    return draft;
}

export function LeadTable() {
    const searchParams = useSearchParams();
    const initialQuery = searchParams.get('q') || '';
    const [leads, setLeads] = useState<Lead[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [queryInput, setQueryInput] = useState(initialQuery);
    const [query, setQuery] = useState(initialQuery);
    const [statusFilter, setStatusFilter] = useState('all');
    const [enrichedOnly, setEnrichedOnly] = useState(false);
    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [leadDraft, setLeadDraft] = useState<LeadDraft | null>(null);
    const [profileDraft, setProfileDraft] = useState<ProfileDraft>({});
    const [savingLead, setSavingLead] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [meetingBrief, setMeetingBrief] = useState<MeetingBrief | null>(null);
    const [generatingBrief, setGeneratingBrief] = useState(false);
    const [showBriefPanel, setShowBriefPanel] = useState(false);
    const [cooldownLoading, setCooldownLoading] = useState(false);

    const loadLeads = useCallback(async (skip = 0) => {
        setLoading(true);
        try {
            const { data } = await getLeads({
                skip,
                limit: PAGE_SIZE,
                status: statusFilter === 'all' ? undefined : statusFilter,
                q: query || undefined,
                enriched_only: enrichedOnly,
            });
            setLeads(data.leads || []);
            setTotal(data.total || 0);

            if (selectedLeadId && !data.leads.some((lead) => lead.id === selectedLeadId)) {
                setSelectedLeadId(null);
                setSelectedLead(null);
                setLeadDraft(null);
                setProfileDraft({});
            }
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to load leads'));
        } finally {
            setLoading(false);
        }
    }, [enrichedOnly, query, selectedLeadId, statusFilter]);

    const loadLeadDetail = useCallback(async (leadId: string) => {
        setDetailLoading(true);
        try {
            const { data } = await getLead(leadId);
            setSelectedLead(data);
            setLeadDraft(makeLeadDraft(data));
            setProfileDraft(makeProfileDraft(data));
            setSelectedLeadId(leadId);
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to load lead details'));
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setPage(0);
            setQuery(queryInput.trim());
        }, 250);
        return () => window.clearTimeout(timeout);
    }, [queryInput]);

    useEffect(() => {
        void loadLeads(page * PAGE_SIZE);
    }, [loadLeads, page]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const provenanceRows = useMemo(() => {
        const enriched = selectedLead?.company_profile?.enriched_data || {};
        return Object.entries(enriched)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([field, point]) => ({
                field,
                value: formatDataValue(point.value),
                source: point.source,
                source_url: point.source_url,
                confidence: point.confidence,
                evidence: point.evidence,
            }));
    }, [selectedLead]);

    const changedProfileFieldCount = useMemo(() => {
        if (!selectedLead) return 0;
        const enriched = selectedLead.company_profile?.enriched_data || {};
        return PROFILE_FIELDS.reduce((count, field) => {
            const draftValue = profileDraft[field.key] ?? '';
            let normalizedDraft = '';
            try {
                normalizedDraft = comparableValue(normalizeFieldValue(draftValue, field.numeric));
            } catch {
                return count + 1;
            }
            const original = field.key === 'company_name'
                ? (selectedLead.company_profile?.name || formatDataValue(enriched[field.key]?.value))
                : formatDataValue(enriched[field.key]?.value);
            return normalizedDraft !== comparableValue(original) ? count + 1 : count;
        }, 0);
    }, [profileDraft, selectedLead]);

    const handleSaveLead = async () => {
        if (!selectedLead || !leadDraft) return;
        setSavingLead(true);
        const prevStatus = selectedLead.status;
        try {
            const nextCustomData = {
                ...(selectedLead.custom_data || {}),
                notes: leadDraft.notes || undefined,
            };
            const { data } = await updateLead(selectedLead.id, {
                first_name: leadDraft.first_name || null,
                last_name: leadDraft.last_name || null,
                email: leadDraft.email,
                domain: leadDraft.domain || null,
                status: leadDraft.status,
                custom_data: nextCustomData,
                follow_up_date: leadDraft.follow_up_date || null,
            });
            toast.success('Lead updated');
            setSelectedLead((current) => current ? { ...current, ...data, custom_data: nextCustomData } : data);
            await loadLeads(page * PAGE_SIZE);
            await loadLeadDetail(selectedLead.id);

            // Auto-generate meeting brief when status transitions to "Meeting Booked"
            if (leadDraft.status === 'Meeting Booked' && prevStatus !== 'Meeting Booked') {
                setGeneratingBrief(true);
                try {
                    await generateMeetingBrief(selectedLead.id);
                    // getMeetingBrief to get the full record with id/generated_at
                    const { data: fullBrief } = await getMeetingBrief(selectedLead.id);
                    setMeetingBrief(fullBrief);
                    setShowBriefPanel(true);
                    toast.success('Meeting brief generated!');
                } catch {
                    toast.error('Brief generation failed — you can retry from the lead panel');
                } finally {
                    setGeneratingBrief(false);
                }
            }
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to save lead'));
        } finally {
            setSavingLead(false);
        }
    };

    const handleSaveProfile = async () => {
        if (!selectedLead?.domain) {
            toast.error('This lead has no company domain to update');
            return;
        }

        setSavingProfile(true);
        try {
            const enriched = selectedLead.company_profile?.enriched_data || {};
            const fields = PROFILE_FIELDS.flatMap((field) => {
                const raw = profileDraft[field.key] ?? '';
                const value = normalizeFieldValue(raw, field.numeric);
                const original = field.key === 'company_name'
                    ? (selectedLead.company_profile?.name || formatDataValue(enriched[field.key]?.value))
                    : formatDataValue(enriched[field.key]?.value);

                if (comparableValue(value) === comparableValue(original)) {
                    return [];
                }

                return [{
                    field_name: field.key,
                    value,
                    confidence: 0.99,
                    evidence: 'Manual override from operator workspace',
                    source: 'manual_override',
                }];
            });

            if (fields.length === 0) {
                toast.info('No company field changes to save');
                return;
            }

            await updateProfile(selectedLead.domain, {
                name: fields.some((field) => field.field_name === 'company_name') && typeof fields.find((field) => field.field_name === 'company_name')?.value === 'string'
                    ? String(fields.find((field) => field.field_name === 'company_name')?.value || '').trim()
                    : undefined,
                fields,
            });
            toast.success('Company profile updated');
            await loadLeads(page * PAGE_SIZE);
            await loadLeadDetail(selectedLead.id);
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to save company profile'));
        } finally {
            setSavingProfile(false);
        }
    };

    const handleApplyCooldown = async () => {
        if (!selectedLead) return;
        setCooldownLoading(true);
        try {
            await applyCooldown(selectedLead.id, 6);
            toast.success('Lead placed in cool-down for 6 months');
            await loadLeads(page * PAGE_SIZE);
            await loadLeadDetail(selectedLead.id);
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to apply cool-down'));
        } finally {
            setCooldownLoading(false);
        }
    };

    const handleRemoveCooldown = async () => {
        if (!selectedLead) return;
        setCooldownLoading(true);
        try {
            await removeCooldown(selectedLead.id);
            toast.success('Cool-down removed');
            await loadLeads(page * PAGE_SIZE);
            await loadLeadDetail(selectedLead.id);
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to remove cool-down'));
        } finally {
            setCooldownLoading(false);
        }
    };

    return (
        <div id="lead-table" className="space-y-4">
            <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800/60 bg-[#0B1120]/95 px-4 py-3 backdrop-blur">
                <div className="relative min-w-[260px] flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        value={queryInput}
                        onChange={(event) => setQueryInput(event.target.value)}
                        placeholder="Search email, name, domain, or status"
                        className="w-full rounded-xl border border-slate-800/60 bg-[#131A2E] py-2.5 pl-9 pr-4 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-500/40"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(event) => {
                        setPage(0);
                        setStatusFilter(event.target.value);
                    }}
                    className="rounded-xl border border-slate-800/60 bg-[#131A2E] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/40"
                >
                    <option value="all">All statuses</option>
                    {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status}</option>
                    ))}
                </select>
                <label className="flex items-center gap-2 rounded-xl border border-slate-800/60 bg-[#131A2E] px-3 py-2.5 text-sm text-slate-300">
                    <input
                        type="checkbox"
                        checked={enrichedOnly}
                        onChange={(event) => {
                            setPage(0);
                            setEnrichedOnly(event.target.checked);
                        }}
                        className="rounded border-slate-700 bg-slate-900"
                    />
                    Enriched only
                </label>
                <button
                    onClick={() => void loadLeads(page * PAGE_SIZE)}
                    className="rounded-xl border border-slate-800/60 bg-[#131A2E] px-3 py-2.5 text-slate-400 transition-colors hover:text-white"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </button>
                <span className="text-xs text-slate-500">{total} leads</span>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
                <div className="overflow-hidden rounded-2xl border border-slate-800/60 bg-[#131A2E]">
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px]">
                        <thead className="sticky top-0 z-10 border-b border-slate-800/60 bg-[#11182D]">
                            <tr>
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Contact</th>
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Company</th>
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Quality</th>
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Updated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {leads.map((lead) => {
                                const profile = lead.company_profile;
                                const qualityTier = profile?.quality_tier || 'pending';
                                return (
                                    <tr
                                        key={lead.id}
                                        onClick={() => void loadLeadDetail(lead.id)}
                                        className={`cursor-pointer transition-colors hover:bg-white/[0.03] ${
                                            selectedLeadId === lead.id ? 'bg-cyan-500/8' : ''
                                        }`}
                                    >
                                        <td className="px-4 py-3 align-top">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-white">{displayLeadName(lead)}</p>
                                                <p className="truncate text-xs text-slate-400">{lead.email}</p>
                                                <p className="truncate text-xs font-mono text-slate-500">{lead.domain || '—'}</p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <p className="text-sm text-white">{profile?.name || '—'}</p>
                                            <p className="text-xs text-slate-500">{lead.enrichment_status}</p>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            {profile ? (
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`h-2 w-2 rounded-full ${QUALITY_DOT[qualityTier] || 'bg-slate-600'}`} />
                                                        <span className="text-xs capitalize text-slate-300">{qualityTier}</span>
                                                        <span className="text-xs font-mono text-slate-500">{((profile.quality_score || 0) * 100).toFixed(0)}%</span>
                                                    </div>
                                                    {lead.icp_tier && (
                                                        <span className={`self-start rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                                            lead.icp_tier === 'T1' ? 'bg-emerald-500/20 text-emerald-400' :
                                                            lead.icp_tier === 'T2' ? 'bg-amber-500/20 text-amber-400' :
                                                            'bg-slate-500/20 text-slate-400'
                                                        }`}>{lead.icp_tier}</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-600">No profile</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <div className="flex flex-col gap-1">
                                                <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                                                    lead.status === 'Meeting Booked' ? 'bg-emerald-500/15 text-emerald-300' :
                                                    lead.status === 'Cool Down' ? 'bg-blue-500/15 text-blue-300' :
                                                    lead.status === 'Replied' ? 'bg-purple-500/15 text-purple-300' :
                                                    lead.status === 'Contacted' ? 'bg-cyan-500/15 text-cyan-300' :
                                                    'bg-slate-500/10 text-slate-300'
                                                }`}>
                                                    {lead.status === 'Cool Down' && <Snowflake className="inline w-3 h-3 mr-1" />}
                                                    {lead.status}
                                                </span>
                                                {lead.follow_up_date && (() => {
                                                    const due = new Date(lead.follow_up_date);
                                                    const today = new Date();
                                                    const isDue = due <= today;
                                                    return (
                                                        <span className={`text-[10px] flex items-center gap-1 ${isDue ? 'text-amber-400' : 'text-slate-500'}`}>
                                                            <CalendarClock className="w-3 h-3" />
                                                            {isDue ? 'Due ' : ''}{due.toLocaleDateString()}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 align-top text-xs text-slate-500">
                                            {new Date(lead.updated_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                );
                            })}
                            {!loading && leads.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-14 text-center text-sm text-slate-500">
                                        No leads matched this view.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-slate-800/60 px-4 py-3">
                            <span className="text-xs text-slate-500">
                                Page {page + 1} of {totalPages}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                                    disabled={page === 0}
                                    className="rounded-xl border border-slate-800/60 bg-[#0E1528] p-2 text-slate-400 transition-all hover:text-white disabled:opacity-30"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                                    disabled={page >= totalPages - 1}
                                    className="rounded-xl border border-slate-800/60 bg-[#0E1528] p-2 text-slate-400 transition-all hover:text-white disabled:opacity-30"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4 xl:sticky xl:top-6 self-start">
                    <div className="rounded-2xl border border-slate-800/60 bg-[#131A2E] p-5 max-h-[42vh] overflow-y-auto">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Lead Record</p>
                                <h3 className="mt-1 text-base font-bold text-white">Editable contact profile</h3>
                            </div>
                            {detailLoading && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}
                        </div>

                        {!selectedLead || !leadDraft ? (
                            <p className="text-sm text-slate-500">Select a row to inspect the contact, company enrichment, and provenance.</p>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                                    <Field label="First name">
                                        <input value={leadDraft.first_name} onChange={(event) => setLeadDraft({ ...leadDraft, first_name: event.target.value })} className={INPUT_CLASS} />
                                    </Field>
                                    <Field label="Last name">
                                        <input value={leadDraft.last_name} onChange={(event) => setLeadDraft({ ...leadDraft, last_name: event.target.value })} className={INPUT_CLASS} />
                                    </Field>
                                    <Field label="Email">
                                        <input value={leadDraft.email} onChange={(event) => setLeadDraft({ ...leadDraft, email: event.target.value })} className={INPUT_CLASS} />
                                    </Field>
                                    <Field label="Domain">
                                        <input value={leadDraft.domain} onChange={(event) => setLeadDraft({ ...leadDraft, domain: event.target.value })} className={INPUT_CLASS} />
                                    </Field>
                                    <Field label="Status">
                                        <select value={leadDraft.status} onChange={(event) => setLeadDraft({ ...leadDraft, status: event.target.value })} className={INPUT_CLASS}>
                                            {STATUS_OPTIONS.map((status) => (
                                                <option key={status} value={status}>{status}</option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Field label="Notes">
                                        <textarea value={leadDraft.notes} onChange={(event) => setLeadDraft({ ...leadDraft, notes: event.target.value })} rows={3} className={TEXTAREA_CLASS} />
                                    </Field>
                                    <Field label="Follow-up Date">
                                        <input
                                            type="date"
                                            value={leadDraft.follow_up_date}
                                            onChange={(event) => setLeadDraft({ ...leadDraft, follow_up_date: event.target.value })}
                                            className={INPUT_CLASS}
                                        />
                                    </Field>
                                </div>
                                {/* ICP Tier badge */}
                                {selectedLead.icp_tier && (
                                    <div className="flex items-center gap-2">
                                        <span className={`rounded px-2 py-1 text-xs font-bold ${
                                            selectedLead.icp_tier === 'T1' ? 'bg-emerald-500/20 text-emerald-400' :
                                            selectedLead.icp_tier === 'T2' ? 'bg-amber-500/20 text-amber-400' :
                                            'bg-slate-500/20 text-slate-400'
                                        }`}>{selectedLead.icp_tier}</span>
                                        <span className="text-xs text-slate-400">ICP Tier</span>
                                        {selectedLead.icp_final_score != null && (
                                            <span className="text-xs text-slate-500">Score: {(selectedLead.icp_final_score).toFixed(1)}</span>
                                        )}
                                    </div>
                                )}
                                {/* Cooldown status */}
                                {selectedLead.status === 'Cool Down' && selectedLead.cooldown_until && (
                                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/8 p-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-semibold text-blue-300 flex items-center gap-1">
                                                <Snowflake className="w-3 h-3" /> In Cool-Down
                                            </p>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                Until {new Date(selectedLead.cooldown_until).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => void handleRemoveCooldown()}
                                            disabled={cooldownLoading}
                                            className="text-xs px-2 py-1 rounded-lg bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
                                        >
                                            {cooldownLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Lift Cool-Down'}
                                        </button>
                                    </div>
                                )}
                                {/* Meeting Brief trigger hint */}
                                {leadDraft.status === 'Meeting Booked' && (
                                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-3 text-xs text-emerald-300">
                                        {generatingBrief ? (
                                            <span className="flex items-center gap-2"><RefreshCw className="w-3 h-3 animate-spin" /> Generating meeting brief…</span>
                                        ) : showBriefPanel && meetingBrief ? (
                                            <button onClick={() => setShowBriefPanel(true)} className="underline">View meeting brief ↓</button>
                                        ) : (
                                            <span>Save to auto-generate a meeting brief.</span>
                                        )}
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => void handleSaveLead()}
                                        disabled={savingLead}
                                        className="inline-flex items-center gap-2 rounded-xl bg-cyan-500/15 px-4 py-2.5 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:opacity-50"
                                    >
                                        {savingLead ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Save Lead
                                    </button>
                                    {selectedLead.status !== 'Cool Down' && (
                                        <button
                                            onClick={() => void handleApplyCooldown()}
                                            disabled={cooldownLoading}
                                            className="inline-flex items-center gap-2 rounded-xl bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
                                        >
                                            {cooldownLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Snowflake className="w-4 h-4" />}
                                            Cool Down
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Meeting Brief Panel */}
                    {showBriefPanel && meetingBrief && (
                        <div className="rounded-2xl border border-emerald-500/20 bg-[#131A2E] p-5">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-sm font-bold text-white">Meeting Brief</p>
                                <button onClick={() => setShowBriefPanel(false)} className="text-slate-500 hover:text-white text-xs">Hide</button>
                            </div>
                            <div className="space-y-3 text-xs">
                                <div>
                                    <p className="text-[11px] uppercase text-slate-500 mb-1">Company Overview</p>
                                    <p className="text-slate-300">{meetingBrief.content_json.company_overview}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-400 font-semibold">ICP {meetingBrief.content_json.icp_tier || 'N/A'}</span>
                                    <span className="text-slate-300">Score: {meetingBrief.content_json.icp_fit_score}%</span>
                                </div>
                                {meetingBrief.content_json.key_talking_points?.length > 0 && (
                                    <div>
                                        <p className="text-[11px] uppercase text-slate-500 mb-1">Key Talking Points</p>
                                        <ul className="space-y-1">
                                            {meetingBrief.content_json.key_talking_points.map((pt, i) => (
                                                <li key={i} className="text-slate-300">• {pt}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {meetingBrief.content_json.likely_objections?.length > 0 && (
                                    <div>
                                        <p className="text-[11px] uppercase text-slate-500 mb-1">Likely Objections</p>
                                        <ul className="space-y-1">
                                            {meetingBrief.content_json.likely_objections.map((obj, i) => (
                                                <li key={i} className="text-amber-300">⚠ {obj}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {meetingBrief.content_json.suggested_questions?.length > 0 && (
                                    <div>
                                        <p className="text-[11px] uppercase text-slate-500 mb-1">Suggested Questions</p>
                                        <ul className="space-y-1">
                                            {meetingBrief.content_json.suggested_questions.map((q, i) => (
                                                <li key={i} className="text-cyan-300">? {q}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="rounded-2xl border border-slate-800/60 bg-[#131A2E] p-5 max-h-[52vh] overflow-y-auto">
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Company Profile</p>
                                <h3 className="mt-1 text-base font-bold text-white">Enrichment fields and provenance</h3>
                            </div>
                            {selectedLead?.domain && (
                                <a
                                    href={`https://${selectedLead.domain}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-xl border border-slate-800/60 bg-[#0E1528] p-2 text-slate-400 transition-colors hover:text-white"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            )}
                        </div>

                        {!selectedLead ? (
                            <p className="text-sm text-slate-500">Select a lead to inspect its company profile.</p>
                        ) : !selectedLead.company_profile ? (
                            <p className="text-sm text-slate-500">This lead does not have an enriched company profile yet.</p>
                        ) : (
                            <div className="space-y-5">
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="rounded-xl bg-[#0E1528] px-3 py-2">
                                        <p className="text-[11px] uppercase tracking-wider text-slate-500">Quality</p>
                                        <p className="text-sm font-semibold text-white">
                                            {selectedLead.company_profile.quality_tier || 'pending'}{' '}
                                            <span className="text-slate-500">
                                                {((selectedLead.company_profile.quality_score || 0) * 100).toFixed(0)}%
                                            </span>
                                        </p>
                                    </div>
                                    {selectedLead.icp_tier && (
                                        <div className="rounded-xl bg-[#0E1528] px-3 py-2">
                                            <p className="text-[11px] uppercase tracking-wider text-slate-500">ICP Tier</p>
                                            <p className={`text-sm font-bold ${
                                                selectedLead.icp_tier === 'T1' ? 'text-emerald-400' :
                                                selectedLead.icp_tier === 'T2' ? 'text-amber-400' :
                                                'text-slate-400'
                                            }`}>
                                                {selectedLead.icp_tier}
                                                {selectedLead.icp_final_score != null && (
                                                    <span className="ml-1 text-slate-500 text-xs font-normal">
                                                        {(selectedLead.icp_final_score).toFixed(1)}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    )}
                                    <div className="rounded-xl bg-[#0E1528] px-3 py-2">
                                        <p className="text-[11px] uppercase tracking-wider text-slate-500">Sources</p>
                                        <p className="max-w-[320px] max-h-14 overflow-y-auto text-xs text-slate-300 break-words">
                                            {(selectedLead.company_profile.sources_used || []).join(', ') || '—'}
                                        </p>
                                    </div>
                                    <div className="rounded-xl bg-[#0E1528] px-3 py-2">
                                        <p className="text-[11px] uppercase tracking-wider text-slate-500">Last enriched</p>
                                        <p className="text-xs text-slate-300">
                                            {selectedLead.company_profile.enriched_at
                                                ? new Date(selectedLead.company_profile.enriched_at).toLocaleString()
                                                : '—'}
                                        </p>
                                    </div>
                                    {selectedLead.company_profile.enriched_data?.company_phone && (
                                        <div className="rounded-xl bg-[#0E1528] px-3 py-2">
                                            <p className="text-[11px] uppercase tracking-wider text-slate-500">Company phone</p>
                                            {(() => {
                                                const phoneValue = formatDataValue((selectedLead.company_profile.enriched_data.company_phone as DataPoint)?.value);
                                                return isTelValue(phoneValue) ? (
                                                    <a
                                                        href={`tel:${phoneValue.split('\n')[0].trim()}`}
                                                        className="inline-block max-w-[220px] text-xs text-cyan-300 break-words whitespace-pre-wrap underline underline-offset-2 hover:text-cyan-200"
                                                    >
                                                        {phoneValue || '—'}
                                                    </a>
                                                ) : (
                                                    <p className="max-w-[220px] text-xs text-slate-300 break-words whitespace-pre-wrap">
                                                        {phoneValue || '—'}
                                                    </p>
                                                );
                                            })()}
                                        </div>
                                    )}
                                    {selectedLead.company_profile.enriched_data?.linkedin_url && (
                                        <div className="rounded-xl bg-[#0E1528] px-3 py-2">
                                            <p className="text-[11px] uppercase tracking-wider text-slate-500">LinkedIn</p>
                                            {(() => {
                                                const linkedinValue = formatDataValue((selectedLead.company_profile.enriched_data.linkedin_url as DataPoint)?.value);
                                                const primaryLink = linkedinValue.split('\n')[0]?.trim();
                                                return isHttpUrl(primaryLink) ? (
                                                    <a
                                                        href={primaryLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-block max-w-[240px] max-h-14 overflow-y-auto text-xs text-cyan-300 break-all whitespace-pre-wrap underline underline-offset-2 hover:text-cyan-200"
                                                    >
                                                        {linkedinValue || '—'}
                                                    </a>
                                                ) : (
                                                    <p className="max-w-[240px] max-h-14 overflow-y-auto text-xs text-slate-300 break-all whitespace-pre-wrap">
                                                        {linkedinValue || '—'}
                                                    </p>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>

                                <div className="grid gap-3">
                                    {PROFILE_FIELDS.map((field) => (
                                        <Field key={field.key} label={field.label}>
                                            {field.multiline ? (
                                                <textarea
                                                    rows={4}
                                                    value={profileDraft[field.key] || ''}
                                                    onChange={(event) => setProfileDraft({ ...profileDraft, [field.key]: event.target.value })}
                                                    className={TEXTAREA_CLASS}
                                                />
                                            ) : (
                                                <input
                                                    value={profileDraft[field.key] || ''}
                                                    onChange={(event) => setProfileDraft({ ...profileDraft, [field.key]: event.target.value })}
                                                    className={INPUT_CLASS}
                                                />
                                            )}
                                        </Field>
                                    ))}
                                </div>

                                <button
                                    onClick={() => void handleSaveProfile()}
                                    disabled={savingProfile || changedProfileFieldCount === 0}
                                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                                >
                                    {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                                    Save Changed Overrides
                                </button>
                                <p className="text-xs text-slate-500">
                                    {changedProfileFieldCount > 0
                                        ? `${changedProfileFieldCount} field${changedProfileFieldCount === 1 ? '' : 's'} edited in this draft`
                                        : 'Only fields you change will become manual overrides'}
                                </p>

                                <div className="rounded-2xl border border-slate-800/60 bg-[#0E1528]">
                                    <div className="flex items-center gap-2 border-b border-slate-800/60 px-4 py-3">
                                        <Database className="w-4 h-4 text-slate-500" />
                                        <h4 className="text-sm font-semibold text-white">Field provenance</h4>
                                    </div>
                                    <div className="max-h-[320px] overflow-y-auto">
                                        {provenanceRows.length === 0 ? (
                                            <p className="px-4 py-6 text-sm text-slate-500">No enriched fields yet.</p>
                                        ) : (
                                            <div className="divide-y divide-slate-800/50">
                                                {provenanceRows.map((row) => (
                                                    <div key={row.field} className="px-4 py-3">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{row.field.replace(/_/g, ' ')}</p>
                                                                <div className="mt-1 max-h-24 overflow-y-auto rounded-lg bg-white/[0.02] px-3 py-2">
                                                                    <p className="text-sm text-white break-words whitespace-pre-wrap">{row.value || '—'}</p>
                                                                </div>
                                                            </div>
                                                            <div className="shrink-0 text-right">
                                                                <p className="text-xs font-mono text-slate-400">{Math.round((row.confidence || 0) * 100)}%</p>
                                                                <p className="text-[11px] text-slate-500">{formatSourceLabel(row.source)}</p>
                                                            </div>
                                                        </div>
                                                        {row.evidence && (
                                                            <div className="mt-2 rounded-lg border border-slate-800/50 bg-[#10172B] px-3 py-2">
                                                                {(() => {
                                                                    const evidence = describeEvidence(row.evidence);
                                                                    return (
                                                                        <>
                                                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${evidence.tone}`}>
                                                                                {evidence.label}
                                                                            </span>
                                                                            <p className="mt-2 text-xs text-slate-400 break-words whitespace-pre-wrap">{evidence.detail}</p>
                                                                        </>
                                                                    );
                                                                })()}
                                                            </div>
                                                        )}
                                                        {row.source_url && (
                                                            <div className="mt-2 rounded-lg border border-slate-800/50 bg-[#10172B] px-3 py-2">
                                                                <p className="text-[11px] uppercase tracking-wider text-slate-500">Source URL</p>
                                                                {isHttpUrl(row.source_url) ? (
                                                                    <a
                                                                        href={row.source_url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="mt-1 inline-block text-xs text-cyan-300 break-all underline underline-offset-2 hover:text-cyan-200"
                                                                    >
                                                                        {row.source_url}
                                                                    </a>
                                                                ) : (
                                                                    <p className="mt-1 text-xs text-slate-400 break-all">{row.source_url}</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
            {children}
        </label>
    );
}

const INPUT_CLASS = 'w-full rounded-xl border border-slate-800/60 bg-[#0E1528] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/40';
const TEXTAREA_CLASS = 'w-full rounded-xl border border-slate-800/60 bg-[#0E1528] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/40 resize-y';
