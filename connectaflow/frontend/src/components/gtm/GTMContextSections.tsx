"use client";

import { useState } from 'react';
import { FlaskRound, MessageSquare, Pencil, Trash2, Copy, X, Check } from 'lucide-react';
import type {
    BuyingTriggerData,
    GTMContextDetail,
    GTMPlayData,
    PersonaData,
    SignalDefinitionData,
} from '../../services/api';
import api from '../../services/api';

export function Chip({ text, color }: { text: string; color: string }) {
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>{text}</span>;
}

function TokenGroup({ items, color }: { items: string[]; color: string }) {
    if (!items.length) return <span className="text-sm text-slate-500">—</span>;
    return (
        <div className="flex flex-wrap gap-2">
            {items.map((item) => (
                <Chip key={item} text={item} color={color} />
            ))}
        </div>
    );
}

export function Overview({ detail }: { detail: GTMContextDetail }) {
    const info = [
        { label: 'Core Problem', value: detail.core_problem },
        { label: 'Product Category', value: detail.product_category },
        { label: 'Value Proposition', value: detail.value_proposition },
        { label: 'Why Customers Buy', value: detail.why_customers_buy },
        { label: 'Why Customers Churn', value: detail.why_customers_churn },
        { label: 'Decision Process', value: detail.decision_process },
        { label: 'Common Objections', value: detail.common_objections?.join(', ') },
        { label: 'Key Integrations', value: detail.key_integrations?.join(', ') },
        { label: 'Geographic Focus', value: detail.geographic_focus },
        { label: 'Competitors', value: detail.competitors?.join(', ') },
        { label: 'Sales Cycle', value: detail.sales_cycle_days },
        { label: 'Avg Deal Size', value: detail.avg_deal_size },
        { label: 'Market Maturity', value: detail.market_maturity },
    ];

    return (
        <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
                {info.map((item) => (
                    <div key={item.label} className="p-3 rounded-xl bg-[#0A0F1E] border border-slate-800/60">
                        <p className="text-[11px] uppercase text-slate-500 font-semibold tracking-wider">{item.label}</p>
                        <p className="mt-1 text-sm text-white leading-relaxed break-words whitespace-pre-wrap">{item.value || '—'}</p>
                    </div>
                ))}
            </div>
            <div className="bg-[#0A0F1E] border border-slate-800/60 rounded-xl p-4">
                <p className="text-xs uppercase text-slate-500 font-semibold mb-2">Customer Examples</p>
                <div className="flex flex-wrap gap-2 text-[12px] text-slate-200">
                    {detail.customer_examples?.length
                        ? detail.customer_examples.map((customer) => <Chip key={customer} text={customer} color="bg-slate-800 text-slate-200" />)
                        : '—'}
                </div>
            </div>
        </div>
    );
}

export function Personas({ personas, missionId, onReload }: {
    personas: PersonaData[];
    missionId?: string;
    onReload?: () => void;
}) {
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleDelete = async (id: string) => {
        if (!missionId) return;
        setDeletingId(id);
        try {
            await api.delete(`/gtm/personas/${id}`);
            onReload?.();
        } catch {
            // silently fail
        } finally {
            setDeletingId(null);
        }
    };

    if (!personas.length) return <EmptyState text="No personas yet. Generate strategy to create them." />;
    return (
        <div className="grid md:grid-cols-2 gap-4">
            {personas.map((persona) => (
                <div key={persona.id} className="p-4 rounded-xl bg-[#0A0F1E] border border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-white">{persona.name}</p>
                            <p className="text-xs text-slate-500">{persona.department} • {persona.seniority}</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <Chip text={persona.decision_role || 'Role'} color="bg-cyan-500/15 text-cyan-200" />
                            {missionId && (
                                <button
                                    onClick={() => void handleDelete(persona.id)}
                                    disabled={deletingId === persona.id}
                                    className="ml-1 rounded-lg p-1 text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                                    title="Delete persona"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                    <Field label="Titles" value={persona.job_titles?.join(', ')} />
                    <Field label="KPIs" value={persona.kpis?.join(', ')} />
                    <Field label="Pain Points" value={persona.pain_points?.join('; ')} />
                    <Field label="Buying Style" value={persona.buying_style} />
                    <Field label="Information Diet" value={persona.information_diet?.join(', ')} />
                    <Field label="Objections" value={persona.objections?.join('; ')} />
                    <Field label="Internal Politics" value={persona.internal_politics} />
                    <Field label="Trigger Phrases" value={persona.trigger_phrases?.join('; ')} />
                    <Field label="Day in Life" value={persona.day_in_life} />
                    <Field label="Success Looks Like" value={persona.success_looks_like} />
                    <Field label="Nightmare Scenario" value={persona.nightmare_scenario} />
                    <Field label="Evaluation Criteria" value={persona.evaluation_criteria?.join(', ')} />
                    <Field label="Messaging Do" value={persona.messaging_do?.join('; ')} />
                    <Field label="Messaging Don't" value={persona.messaging_dont?.join('; ')} />
                </div>
            ))}
        </div>
    );
}

export function Triggers({ triggers, missionId, onReload }: {
    triggers: BuyingTriggerData[];
    missionId?: string;
    onReload?: () => void;
}) {
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleDelete = async (id: string) => {
        if (!missionId) return;
        setDeletingId(id);
        try {
            await api.delete(`/gtm/triggers/${id}`);
            onReload?.();
        } catch {} finally { setDeletingId(null); }
    };

    if (!triggers.length) return <EmptyState text="No triggers yet." />;
    return (
        <div className="grid md:grid-cols-2 gap-4">
            {triggers.map((trigger) => (
                <div key={trigger.id} className="p-4 rounded-xl bg-[#0A0F1E] border border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-white">{trigger.name}</p>
                            <p className="text-xs text-slate-500">{trigger.category || 'uncategorized'}</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <Chip text={trigger.urgency_level || 'timing'} color="bg-amber-500/15 text-amber-200" />
                            {missionId && (
                                <button
                                    onClick={() => void handleDelete(trigger.id)}
                                    disabled={deletingId === trigger.id}
                                    className="ml-1 rounded-lg p-1 text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                                    title="Delete trigger"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                    <Field label="Description" value={trigger.description} />
                    <Field label="Why it matters" value={trigger.why_it_matters} />
                    <Field label="Ideal timing" value={trigger.ideal_timing} />
                    <Field label="Qualifying questions" value={trigger.qualifying_questions?.join('; ')} />
                </div>
            ))}
        </div>
    );
}

export function Signals({ signals, missionId, onReload }: {
    signals: SignalDefinitionData[];
    missionId?: string;
    onReload?: () => void;
}) {
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleDelete = async (id: string) => {
        if (!missionId) return;
        setDeletingId(id);
        try {
            await api.delete(`/gtm/signals/${id}`);
            onReload?.();
        } catch {} finally { setDeletingId(null); }
    };

    if (!signals.length) return <EmptyState text="No signal definitions yet." />;
    return (
        <div className="grid md:grid-cols-2 gap-4">
            {signals.map((signal) => (
                <div key={signal.id} className="min-w-0 p-4 rounded-xl bg-[#0A0F1E] border border-slate-800/60 space-y-4 overflow-hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white">{signal.name}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {signal.source?.split('|').map((item) => item.trim()).filter(Boolean).map((item) => (
                                    <Chip key={`src-${item}`} text={item} color="bg-slate-800 text-slate-200" />
                                ))}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {signal.detection_method?.split('|').map((item) => item.trim()).filter(Boolean).map((item) => (
                                    <Chip key={`det-${item}`} text={item} color="bg-slate-700/70 text-slate-200" />
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <Chip text={`Strength ${Math.round((signal.strength_score || 0) * 100)}%`} color="bg-cyan-500/15 text-cyan-200" />
                            {missionId && (
                                <button
                                    onClick={() => void handleDelete(signal.id)}
                                    disabled={deletingId === signal.id}
                                    className="ml-1 rounded-lg p-1 text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                                    title="Delete signal"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                    <Field label="Description" value={signal.description} />
                    <div>
                        <p className="text-[11px] uppercase text-slate-500 font-semibold tracking-wider">Keywords</p>
                        <div className="mt-2">
                            <TokenGroup items={signal.keywords || []} color="bg-indigo-500/15 text-indigo-200" />
                        </div>
                    </div>
                    <Field label="False positives" value={signal.false_positive_notes} />
                    <div>
                        <p className="text-[11px] uppercase text-slate-500 font-semibold tracking-wider">Fields used</p>
                        <div className="mt-2">
                            <TokenGroup items={signal.enrichment_fields_used || []} color="bg-emerald-500/15 text-emerald-200" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function Plays({ plays, missionId, onReload }: {
    plays: GTMPlayData[];
    missionId?: string;
    onReload?: () => void;
}) {
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleDelete = async (id: string) => {
        if (!missionId) return;
        setDeletingId(id);
        try {
            await api.delete(`/gtm/plays/${id}`);
            onReload?.();
        } catch {} finally { setDeletingId(null); }
    };

    if (!plays.length) return <EmptyState text="No plays yet." />;
    return (
        <div className="space-y-4">
            {plays.map((play) => (
                <div key={play.id} className="p-4 rounded-xl bg-[#0A0F1E] border border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-white">{play.name}</p>
                            <p className="text-xs text-slate-500">{play.icp_statement}</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <Chip text={play.status || 'draft'} color="bg-emerald-500/15 text-emerald-200" />
                            {missionId && (
                                <button
                                    onClick={() => void handleDelete(play.id)}
                                    disabled={deletingId === play.id}
                                    className="ml-1 rounded-lg p-1 text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                                    title="Delete play"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                    <Field label="Trigger / Signal / Persona" value={[play.trigger_id, play.signal_id, play.persona_id].filter(Boolean).join(' • ') || '—'} />
                    <Field label="Messaging angle" value={play.messaging_angle} />
                    <Field label="Channel sequence" value={play.channel_sequence?.join(' → ')} />
                    <Field label="Timing rationale" value={play.timing_rationale} />
                    <Field label="Opening hook" value={play.opening_hook} />
                    <Field label="Objection handling" value={formatObjections(play.objection_handling)} />
                    <Field label="Competitive positioning" value={play.competitive_positioning} />
                    <Field label="Success criteria" value={play.success_criteria} />
                    <Field label="Email subject lines" value={play.email_subject_lines?.join(' | ')} />
                    <Field label="Call talk track" value={play.call_talk_track} />
                </div>
            ))}
        </div>
    );
}

export function Enrichment({ patterns }: { patterns: Record<string, unknown> | null }) {
    if (!patterns) return <EmptyState text="No enrichment feedback yet. Run Refine from Enrichment." />;
    return (
        <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(patterns).map(([key, value]) => (
                <div key={key} className="min-w-0 p-4 rounded-xl bg-[#0A0F1E] border border-slate-800/60 space-y-2 overflow-hidden">
                    <div className="flex items-center gap-2 text-slate-300">
                        <FlaskRound className="w-4 h-4 text-cyan-300" />
                        <p className="text-sm font-semibold capitalize">{key.replace('_', ' ')}</p>
                    </div>
                    <pre className="overflow-x-auto text-xs text-slate-300 whitespace-pre-wrap break-words leading-relaxed">{JSON.stringify(value, null, 2)}</pre>
                </div>
            ))}
        </div>
    );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
    return (
        <div className="min-w-0">
            <p className="text-[11px] uppercase text-slate-500 font-semibold tracking-wider">{label}</p>
            <p className="mt-1 text-sm text-white leading-relaxed break-words whitespace-pre-wrap">{value || '—'}</p>
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
            <MessageSquare className="w-4 h-4" />
            <span>{text}</span>
        </div>
    );
}

function formatObjections(objections?: Record<string, string>) {
    if (!objections) return '—';
    return Object.entries(objections).map(([key, value]) => `${key}: ${value}`).join(' | ');
}
