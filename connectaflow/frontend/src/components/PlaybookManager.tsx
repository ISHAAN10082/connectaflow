"use client";

import { useState, useEffect, useCallback } from 'react';
import {
    BookOpen, Plus, Play, Pause, ChevronRight, ChevronDown, Trash2,
    Mail, Clock, ClipboardList, GitBranch, Users, Zap,
    Loader2, Target, LayoutTemplate, X, UserPlus,
    AlertCircle, Radio
} from 'lucide-react';
import { toast } from 'sonner';
import {
    listPlaybooks, createPlaybook, getPlaybook, updatePlaybook, deletePlaybook,
    createPlay, updatePlay, deletePlay,
    createPlayStep, deletePlayStep, updateEnrollmentProgress,
    autoEnrollPlaybook, getPlaybookTemplates, applyPlaybookTemplate,
    listICPs,
    type PlaybookSummary, type PlaybookDetail, type PlayData,
    type PlaybookTemplate, type ICPDefinition,
} from '../services/api';
import { getErrorMessage } from '../lib/errors';

interface Props {
    icpId?: string | null;
}

const STEP_TYPE_CONFIG: Record<string, { icon: typeof Mail; label: string; color: string; bg: string }> = {
    email: { icon: Mail, label: 'Email', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    wait: { icon: Clock, label: 'Wait', color: 'text-amber-400', bg: 'bg-amber-500/10' },
    task: { icon: ClipboardList, label: 'Task', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    condition: { icon: GitBranch, label: 'Condition', color: 'text-sky-400', bg: 'bg-sky-500/10' },
};

const STATUS_COLORS: Record<string, string> = {
    draft: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
    active: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    paused: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    archived: 'text-slate-500 bg-slate-600/10 border-slate-600/20',
};

type TriggerRuleForm = {
    fit_categories?: string[];
    min_score?: number;
    signal_types?: string[];
    min_signals?: number;
};

type StepConfigValue = string | number | string[] | undefined;
type StepConfig = Record<string, StepConfigValue>;

export function PlaybookManager({ icpId }: Props) {
    const [playbooks, setPlaybooks] = useState<PlaybookSummary[]>([]);
    const [selectedPlaybook, setSelectedPlaybook] = useState<PlaybookDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [icps, setIcps] = useState<ICPDefinition[]>([]);

    // Creation state
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newIcpId, setNewIcpId] = useState(icpId || '');

    // Template state
    const [showTemplates, setShowTemplates] = useState(false);
    const [templates, setTemplates] = useState<PlaybookTemplate[]>([]);

    // Play creation
    const [addingPlayTo, setAddingPlayTo] = useState<string | null>(null);
    const [newPlayName, setNewPlayName] = useState('');
    const [newPlayDesc, setNewPlayDesc] = useState('');

    // Step creation
    const [addingStepTo, setAddingStepTo] = useState<string | null>(null);
    const [newStepType, setNewStepType] = useState<string>('email');
    const [newStepConfig, setNewStepConfig] = useState<StepConfig>({});

    // Expanded plays
    const [expandedPlays, setExpandedPlays] = useState<Set<string>>(new Set());

    // Trigger rule editing
    const [editingTriggers, setEditingTriggers] = useState<string | null>(null);
    const [triggerForm, setTriggerForm] = useState<TriggerRuleForm>({});

    // Auto-enroll state
    const [enrolling, setEnrolling] = useState(false);
    const [actingEnrollmentId, setActingEnrollmentId] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [pbRes, icpRes] = await Promise.all([listPlaybooks(), listICPs()]);
            setPlaybooks(pbRes.data.playbooks || []);
            setIcps(icpRes.data.icps || []);
        } catch { }
        setLoading(false);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const id = window.requestAnimationFrame(() => {
            if (!cancelled) void loadData();
        });
        return () => {
            cancelled = true;
            window.cancelAnimationFrame(id);
        };
    }, [loadData]);

    const selectPlaybook = async (id: string) => {
        try {
            const { data } = await getPlaybook(id);
            setSelectedPlaybook(data);
        } catch {
            toast.error('Failed to load playbook');
        }
    };

    const handleCreate = async () => {
        if (!newName.trim()) { toast.error('Enter a name'); return; }
        try {
            const { data } = await createPlaybook({ name: newName, description: newDesc, icp_id: newIcpId || undefined });
            toast.success('Playbook created');
            setShowCreate(false);
            setNewName(''); setNewDesc(''); setNewIcpId(icpId || '');
            await loadData();
            selectPlaybook(data.id);
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to create'));
        }
    };

    const handleDeletePlaybook = async (id: string) => {
        try {
            await deletePlaybook(id);
            toast.success('Playbook deleted');
            if (selectedPlaybook?.id === id) setSelectedPlaybook(null);
            loadData();
        } catch { toast.error('Failed to delete'); }
    };

    const handleStatusChange = async (status: string) => {
        if (!selectedPlaybook) return;
        try {
            await updatePlaybook(selectedPlaybook.id, { status });
            toast.success(`Playbook ${status}`);
            selectPlaybook(selectedPlaybook.id);
            loadData();
        } catch { toast.error('Failed to update'); }
    };

    const handleCreatePlay = async () => {
        if (!addingPlayTo || !newPlayName.trim()) return;
        try {
            await createPlay(addingPlayTo, { name: newPlayName, description: newPlayDesc });
            toast.success('Play added');
            setAddingPlayTo(null); setNewPlayName(''); setNewPlayDesc('');
            selectPlaybook(addingPlayTo);
            loadData();
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed'));
        }
    };

    const handleDeletePlay = async (playId: string) => {
        if (!selectedPlaybook) return;
        try {
            await deletePlay(playId);
            toast.success('Play deleted');
            selectPlaybook(selectedPlaybook.id);
            loadData();
        } catch { toast.error('Failed to delete play'); }
    };

    const handleSaveTriggers = async (playId: string) => {
        try {
            await updatePlay(playId, { trigger_rules: triggerForm });
            toast.success('Trigger rules saved');
            setEditingTriggers(null);
            if (selectedPlaybook) selectPlaybook(selectedPlaybook.id);
        } catch { toast.error('Failed to save triggers'); }
    };

    const toNumber = (value: StepConfigValue, fallback: number) => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim()) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        }
        return fallback;
    };

    const toStringValue = (value: StepConfigValue) => {
        if (value == null) return '';
        if (Array.isArray(value)) return value.join(', ');
        return String(value);
    };

    const handleAddStep = async (playId: string) => {
        if (!selectedPlaybook) return;
        const play = selectedPlaybook.plays.find(p => p.id === playId);
        const nextNum = play ? Math.max(...play.steps.map(s => s.step_number), 0) + 1 : 1;

        let config: Record<string, unknown> = {};
        if (newStepType === 'email') {
            config = { subject: toStringValue(newStepConfig.subject), body: toStringValue(newStepConfig.body) };
        } else if (newStepType === 'wait') {
            config = { days: toNumber(newStepConfig.days, 3) };
        } else if (newStepType === 'task') {
            config = { title: toStringValue(newStepConfig.title), description: toStringValue(newStepConfig.description) };
        } else if (newStepType === 'condition') {
            config = {
                check: toStringValue(newStepConfig.check) || 'email_opened',
                yes_step: toNumber(newStepConfig.yes_step, nextNum + 1),
                no_step: toNumber(newStepConfig.no_step, nextNum + 2),
            };
        }

        try {
            await createPlayStep(playId, { step_number: nextNum, step_type: newStepType, config });
            toast.success('Step added');
            setAddingStepTo(null);
            setNewStepType('email');
            setNewStepConfig({});
            selectPlaybook(selectedPlaybook.id);
        } catch { toast.error('Failed to add step'); }
    };

    const handleDeleteStep = async (stepId: string) => {
        if (!selectedPlaybook) return;
        try {
            await deletePlayStep(stepId);
            toast.success('Step removed');
            selectPlaybook(selectedPlaybook.id);
        } catch { toast.error('Failed to delete step'); }
    };

    const handleAutoEnroll = async () => {
        if (!selectedPlaybook) return;
        setEnrolling(true);
        try {
            const { data } = await autoEnrollPlaybook(selectedPlaybook.id);
            if (data.enrolled_total === 0) {
                toast.info('No new leads matched trigger rules');
            } else {
                const summary = Object.values(data.by_play).map(p => `${p.name}: ${p.enrolled}`).join(', ');
                toast.success(`Enrolled ${data.enrolled_total} leads — ${summary}`);
            }
            selectPlaybook(selectedPlaybook.id);
            loadData();
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Auto-enroll failed'));
        }
        setEnrolling(false);
    };

    const loadTemplates = async () => {
        try {
            const { data } = await getPlaybookTemplates();
            setTemplates(data.templates || []);
            setShowTemplates(true);
        } catch { toast.error('Failed to load templates'); }
    };

    const handleApplyTemplate = async (templateId: string) => {
        if (!selectedPlaybook) return;
        try {
            const { data } = await applyPlaybookTemplate(templateId, selectedPlaybook.id);
            toast.success(`Applied template — ${data.plays_created.length} plays created`);
            setShowTemplates(false);
            selectPlaybook(selectedPlaybook.id);
            loadData();
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to apply template'));
        }
    };

    const togglePlayExpanded = (playId: string) => {
        setExpandedPlays(prev => {
            const next = new Set(prev);
            if (next.has(playId)) next.delete(playId);
            else next.add(playId);
            return next;
        });
    };

    const handleEnrollmentAction = async (
        enrollmentId: string,
        payload: { action: 'pause' | 'resume' | 'advance' | 'complete' | 'exit'; outcome?: string; notes?: string },
        successMessage: string,
    ) => {
        if (!selectedPlaybook) return;
        setActingEnrollmentId(enrollmentId);
        try {
            await updateEnrollmentProgress(enrollmentId, payload);
            toast.success(successMessage);
            await selectPlaybook(selectedPlaybook.id);
            await loadData();
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to update enrollment'));
        } finally {
            setActingEnrollmentId(null);
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
            </div>
        );
    }

    const playbookEnrollments = selectedPlaybook?.plays.flatMap(play => play.enrollments) || [];
    const activeEnrollments = playbookEnrollments.filter(enrollment => enrollment.status === 'active');
    const pausedEnrollments = playbookEnrollments.filter(enrollment => enrollment.status === 'paused');
    const completedEnrollments = playbookEnrollments.filter(enrollment => enrollment.status === 'completed');
    const actionReadyEnrollments = activeEnrollments.filter((enrollment) =>
        enrollment.current_step_detail?.step_type === 'email' || enrollment.current_step_detail?.step_type === 'task'
    );

    return (
        <div className="h-full overflow-y-auto" id="playbook-manager">
            <div className="max-w-5xl mx-auto p-8 pb-24">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                            <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight">Playbooks & Plays</h1>
                            <p className="text-sm text-slate-400">Persona-driven engagement sequences</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadTemplates}
                            className="px-4 py-2 bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <LayoutTemplate className="w-4 h-4" /> Templates
                        </button>
                        <button
                            onClick={() => setShowCreate(true)}
                            className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-cyan-500/15 flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> New Playbook
                        </button>
                    </div>
                </div>

                {/* ── Create Dialog ─────────────────────────────── */}
                {showCreate && (
                    <div className="mb-6 bg-[#131A2E] border border-cyan-500/20 rounded-2xl p-6 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-white">Create Playbook</h3>
                            <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Name</label>
                                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Series A Expansion Playbook"
                                    className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Target persona and engagement strategy"
                                    className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Linked ICP</label>
                                <select value={newIcpId} onChange={e => setNewIcpId(e.target.value)}
                                    className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-4 py-2.5 text-white text-sm focus:border-cyan-500/40 outline-none">
                                    <option value="">No ICP linked</option>
                                    {icps.map(icp => (
                                        <option key={icp.id} value={icp.id}>{icp.name}</option>
                                    ))}
                                </select>
                            </div>
                            <button onClick={handleCreate}
                                className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white rounded-xl font-semibold text-sm transition-all">
                                Create Playbook
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Template Picker ──────────────────────────── */}
                {showTemplates && (
                    <div className="mb-6 bg-[#131A2E] border border-amber-500/20 rounded-2xl p-6 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <LayoutTemplate className="w-4 h-4 text-amber-400" /> Playbook Templates
                            </h3>
                            <button onClick={() => setShowTemplates(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                        </div>
                        {!selectedPlaybook && (
                            <p className="text-sm text-amber-400 mb-4 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" /> Select a playbook first, then apply a template to it.
                            </p>
                        )}
                        <div className="space-y-3">
                            {templates.map(tmpl => (
                                <div key={tmpl.id} className="bg-[#0A0F1E] border border-slate-800/60 rounded-xl p-4 hover:border-amber-500/30 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="text-sm font-bold text-white">{tmpl.name}</h4>
                                            <p className="text-xs text-slate-400 mt-0.5">{tmpl.description}</p>
                                            <div className="flex items-center gap-3 mt-2">
                                                <span className="text-xs text-slate-500">{tmpl.plays.length} plays</span>
                                                <span className="text-xs text-slate-500">{tmpl.plays.reduce((a, p) => a + p.steps.length, 0)} total steps</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleApplyTemplate(tmpl.id)}
                                            disabled={!selectedPlaybook}
                                            className="px-4 py-2 bg-amber-500/10 text-amber-400 rounded-lg text-xs font-semibold hover:bg-amber-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            Apply
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex gap-6">
                    {/* ── Playbook List (left panel) ─────────────── */}
                    <div className="w-[280px] flex-shrink-0 space-y-2">
                        {playbooks.length === 0 ? (
                            <div className="text-center py-12 text-slate-500 text-sm">
                                <BookOpen className="w-8 h-8 mx-auto mb-3 text-slate-600" />
                                No playbooks yet.<br />Create one to get started.
                            </div>
                        ) : (
                            playbooks.map(pb => (
                                <button
                                    key={pb.id}
                                    onClick={() => selectPlaybook(pb.id)}
                                    className={`w-full text-left bg-[#131A2E] border rounded-xl px-4 py-3.5 transition-all group ${selectedPlaybook?.id === pb.id
                                        ? 'border-cyan-500/30 shadow-lg shadow-cyan-500/5'
                                        : 'border-slate-800/60 hover:border-slate-700/60'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-semibold text-white truncate">{pb.name}</h4>
                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${STATUS_COLORS[pb.status] || STATUS_COLORS.draft}`}>
                                            {pb.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1 truncate">{pb.description || 'No description'}</p>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                            <Play className="w-3 h-3" /> {pb.play_count} plays
                                        </span>
                                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                            <Users className="w-3 h-3" /> {pb.total_enrolled} enrolled
                                        </span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>

                    {/* ── Playbook Detail (right panel) ──────────── */}
                    <div className="flex-1 min-w-0">
                        {!selectedPlaybook ? (
                            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                                <div className="text-center">
                                    <ChevronRight className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                                    Select a playbook to view its plays
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                {/* Playbook Header */}
                                <div className="bg-[#131A2E] border border-slate-800/60 rounded-2xl p-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <h2 className="text-lg font-bold text-white">{selectedPlaybook.name}</h2>
                                            <p className="text-sm text-slate-400 mt-0.5">{selectedPlaybook.description || 'No description'}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleDeletePlaybook(selectedPlaybook.id)}
                                                className="p-2 text-slate-500 hover:text-red-400 transition-colors" title="Delete playbook">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Status & Actions */}
                                    <div className="flex items-center gap-2 mt-4">
                                        {selectedPlaybook.status === 'draft' && (
                                            <button onClick={() => handleStatusChange('active')}
                                                className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-semibold hover:bg-emerald-500/20 transition-colors flex items-center gap-1.5">
                                                <Play className="w-3 h-3" /> Activate
                                            </button>
                                        )}
                                        {selectedPlaybook.status === 'active' && (
                                            <button onClick={() => handleStatusChange('paused')}
                                                className="px-3 py-1.5 bg-amber-500/10 text-amber-400 rounded-lg text-xs font-semibold hover:bg-amber-500/20 transition-colors flex items-center gap-1.5">
                                                <Pause className="w-3 h-3" /> Pause
                                            </button>
                                        )}
                                        {selectedPlaybook.status === 'paused' && (
                                            <button onClick={() => handleStatusChange('active')}
                                                className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-semibold hover:bg-emerald-500/20 transition-colors flex items-center gap-1.5">
                                                <Play className="w-3 h-3" /> Resume
                                            </button>
                                        )}

                                        {selectedPlaybook.icp_id && (
                                            <button onClick={handleAutoEnroll} disabled={enrolling}
                                                className="px-3 py-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg text-xs font-semibold hover:bg-cyan-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-40">
                                                {enrolling ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                                                Auto-Enroll Leads
                                            </button>
                                        )}

                                        <button onClick={() => { setAddingPlayTo(selectedPlaybook.id); setNewPlayName(''); setNewPlayDesc(''); }}
                                            className="px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-semibold hover:bg-blue-500/20 transition-colors flex items-center gap-1.5">
                                            <Plus className="w-3 h-3" /> Add Play
                                        </button>
                                    </div>

                                    {selectedPlaybook.icp_id && (
                                        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                                            <Target className="w-3 h-3" />
                                            Linked to ICP: <span className="text-cyan-400 font-medium">{icps.find(i => i.id === selectedPlaybook.icp_id)?.name || selectedPlaybook.icp_id}</span>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-4 gap-3 mt-5">
                                        <ExecutionStatCard label="Ready To Work" value={actionReadyEnrollments.length} tone="cyan" sub="email or task step live" />
                                        <ExecutionStatCard label="Active" value={activeEnrollments.length} tone="emerald" sub="currently executing" />
                                        <ExecutionStatCard label="Paused" value={pausedEnrollments.length} tone="amber" sub="awaiting operator" />
                                        <ExecutionStatCard label="Completed" value={completedEnrollments.length} tone="blue" sub="captured outcome" />
                                    </div>

                                    {actionReadyEnrollments.length > 0 && (
                                        <div className="mt-5 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.04] p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-300/80 font-semibold">Execution Focus</p>
                                                    <h3 className="mt-1 text-sm font-bold text-white">Accounts ready for the next operator move</h3>
                                                </div>
                                                <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                                                    {actionReadyEnrollments.length} ready
                                                </span>
                                            </div>
                                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                                {actionReadyEnrollments.slice(0, 8).map((enrollment) => (
                                                    <div key={enrollment.id} className="rounded-xl border border-slate-800/50 bg-[#0E1528] px-4 py-3">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-semibold text-white">
                                                                    {enrollment.lead?.email || enrollment.domain || 'Unknown account'}
                                                                </p>
                                                                <p className="mt-1 text-xs text-slate-400">
                                                                    Step {enrollment.current_step}
                                                                    {enrollment.current_step_detail ? ` • ${enrollment.current_step_detail.label}` : ''}
                                                                </p>
                                                                {enrollment.current_step_detail?.description && (
                                                                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">{enrollment.current_step_detail.description}</p>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => handleEnrollmentAction(enrollment.id, { action: 'advance' }, 'Enrollment advanced')}
                                                                disabled={actingEnrollmentId === enrollment.id}
                                                                className="rounded-lg bg-cyan-500/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
                                                            >
                                                                {actingEnrollmentId === enrollment.id ? 'Working...' : 'Advance'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Add Play Form */}
                                {addingPlayTo === selectedPlaybook.id && (
                                    <div className="bg-[#131A2E] border border-blue-500/20 rounded-2xl p-5 animate-in fade-in slide-in-from-top-4 duration-300">
                                        <h4 className="text-sm font-bold text-white mb-3">New Play</h4>
                                        <div className="space-y-3">
                                            <input value={newPlayName} onChange={e => setNewPlayName(e.target.value)} placeholder="Play name (e.g. Cold Outreach Sequence)"
                                                className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:border-blue-500/40 outline-none" />
                                            <input value={newPlayDesc} onChange={e => setNewPlayDesc(e.target.value)} placeholder="Description (optional)"
                                                className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:border-blue-500/40 outline-none" />
                                            <div className="flex gap-2">
                                                <button onClick={handleCreatePlay}
                                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors">
                                                    Create Play
                                                </button>
                                                <button onClick={() => setAddingPlayTo(null)}
                                                    className="px-4 py-2 bg-slate-800 text-slate-400 rounded-lg text-xs font-semibold hover:text-white transition-colors">
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── Plays ─────────────────────────────────── */}
                                {selectedPlaybook.plays.length === 0 ? (
                                    <div className="text-center py-12 bg-[#131A2E] border border-slate-800/60 rounded-2xl text-slate-500 text-sm">
                                        <Play className="w-8 h-8 mx-auto mb-3 text-slate-600" />
                                        No plays yet. Add a play or apply a template.
                                    </div>
                                ) : (
                                    selectedPlaybook.plays.map(play => (
                                        <PlayCard
                                            key={play.id}
                                            play={play}
                                            expanded={expandedPlays.has(play.id)}
                                            onToggle={() => togglePlayExpanded(play.id)}
                                            onDelete={() => handleDeletePlay(play.id)}
                                            onAddStep={() => { setAddingStepTo(play.id); setNewStepType('email'); setNewStepConfig({}); }}
                                            onDeleteStep={handleDeleteStep}
                                            editingTriggers={editingTriggers === play.id}
                                            onEditTriggers={() => { setEditingTriggers(play.id); setTriggerForm((play.trigger_rules || {}) as TriggerRuleForm); }}
                                            onSaveTriggers={() => handleSaveTriggers(play.id)}
                                            onCancelTriggers={() => setEditingTriggers(null)}
                                            triggerForm={triggerForm}
                                            setTriggerForm={setTriggerForm}
                                            // Step creation inline
                                            addingStep={addingStepTo === play.id}
                                            newStepType={newStepType}
                                            setNewStepType={setNewStepType}
                                            newStepConfig={newStepConfig}
                                            setNewStepConfig={setNewStepConfig}
                                            onSubmitStep={() => handleAddStep(play.id)}
                                            onCancelStep={() => setAddingStepTo(null)}
                                            actingEnrollmentId={actingEnrollmentId}
                                            onAdvanceEnrollment={(enrollmentId) => handleEnrollmentAction(enrollmentId, { action: 'advance' }, 'Enrollment advanced')}
                                            onPauseEnrollment={(enrollmentId) => handleEnrollmentAction(enrollmentId, { action: 'pause' }, 'Enrollment paused')}
                                            onResumeEnrollment={(enrollmentId) => handleEnrollmentAction(enrollmentId, { action: 'resume' }, 'Enrollment resumed')}
                                            onWinEnrollment={(enrollmentId) => handleEnrollmentAction(enrollmentId, { action: 'complete', outcome: 'meeting_booked' }, 'Outcome captured')}
                                            onExitEnrollment={(enrollmentId) => handleEnrollmentAction(enrollmentId, { action: 'exit', outcome: 'disqualified' }, 'Enrollment exited')}
                                        />
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}


// ─── Play Card Sub-Component ─────────────────────────────────

interface PlayCardProps {
    play: PlayData;
    expanded: boolean;
    onToggle: () => void;
    onDelete: () => void;
    onAddStep: () => void;
    onDeleteStep: (stepId: string) => void;
    editingTriggers: boolean;
    onEditTriggers: () => void;
    onSaveTriggers: () => void;
    onCancelTriggers: () => void;
    triggerForm: TriggerRuleForm;
    setTriggerForm: (v: TriggerRuleForm) => void;
    addingStep: boolean;
    newStepType: string;
    setNewStepType: (v: string) => void;
    newStepConfig: StepConfig;
    setNewStepConfig: (v: StepConfig) => void;
    onSubmitStep: () => void;
    onCancelStep: () => void;
    actingEnrollmentId: string | null;
    onAdvanceEnrollment: (enrollmentId: string) => void;
    onPauseEnrollment: (enrollmentId: string) => void;
    onResumeEnrollment: (enrollmentId: string) => void;
    onWinEnrollment: (enrollmentId: string) => void;
    onExitEnrollment: (enrollmentId: string) => void;
}

function PlayCard({
    play, expanded, onToggle, onDelete, onAddStep, onDeleteStep,
    editingTriggers, onEditTriggers, onSaveTriggers, onCancelTriggers, triggerForm, setTriggerForm,
    addingStep, newStepType, setNewStepType, newStepConfig, setNewStepConfig, onSubmitStep, onCancelStep,
    actingEnrollmentId, onAdvanceEnrollment, onPauseEnrollment, onResumeEnrollment, onWinEnrollment, onExitEnrollment,
}: PlayCardProps) {
    const rules = (play.trigger_rules || {}) as TriggerRuleForm;
    const hasTriggers = Object.keys(rules).length > 0;

    return (
        <div className="bg-[#131A2E] border border-slate-800/60 rounded-2xl overflow-hidden transition-all hover:border-slate-700/60">
            {/* Play Header */}
            <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${play.status === 'active' ? 'bg-emerald-500/10' : 'bg-slate-800/60'}`}>
                        {play.status === 'active' ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-slate-500" />}
                    </div>
                    <div className="min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">{play.name}</h4>
                        <p className="text-xs text-slate-500 truncate">{play.description || 'No description'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <span className="text-[11px] text-slate-500">{play.steps.length} steps</span>
                    <span className="text-[11px] text-slate-500">{play.enrollment_count} enrolled</span>
                    {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                </div>
            </button>

            {/* Expanded Content */}
            {expanded && (
                <div className="border-t border-slate-800/60 px-5 py-4 space-y-4 animate-in fade-in duration-200">
                    {/* Trigger Rules */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Radio className="w-3 h-3" /> Trigger Rules
                            </h5>
                            {!editingTriggers && (
                                <button onClick={onEditTriggers} className="text-xs text-cyan-400 hover:text-cyan-300 font-medium">Edit</button>
                            )}
                        </div>

                        {editingTriggers ? (
                            <div className="bg-[#0A0F1E] rounded-xl p-4 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fit Categories (comma-sep)</label>
                                        <input
                                            value={(triggerForm.fit_categories || []).join(', ')}
                                            onChange={e => setTriggerForm({ ...triggerForm, fit_categories: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                            placeholder="high, medium"
                                            className="w-full bg-[#131A2E] border border-slate-800/60 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-cyan-500/40"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Min ICP Score</label>
                                        <input
                                            type="number"
                                            value={triggerForm.min_score || ''}
                                            onChange={e => setTriggerForm({ ...triggerForm, min_score: parseInt(e.target.value) || 0 })}
                                            placeholder="60"
                                            className="w-full bg-[#131A2E] border border-slate-800/60 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-cyan-500/40"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Signal Types (comma-sep)</label>
                                        <input
                                            value={(triggerForm.signal_types || []).join(', ')}
                                            onChange={e => setTriggerForm({ ...triggerForm, signal_types: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                            placeholder="hiring_sdr, hiring_ae"
                                            className="w-full bg-[#131A2E] border border-slate-800/60 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-cyan-500/40"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Min # Signals</label>
                                        <input
                                            type="number"
                                            value={triggerForm.min_signals || ''}
                                            onChange={e => setTriggerForm({ ...triggerForm, min_signals: parseInt(e.target.value) || 0 })}
                                            placeholder="1"
                                            className="w-full bg-[#131A2E] border border-slate-800/60 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-cyan-500/40"
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={onSaveTriggers} className="px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-semibold">Save</button>
                                    <button onClick={onCancelTriggers} className="px-3 py-1.5 bg-slate-800 text-slate-400 rounded-lg text-xs font-semibold">Cancel</button>
                                </div>
                            </div>
                        ) : hasTriggers ? (
                            <div className="flex flex-wrap gap-2">
                                {(rules.fit_categories?.length ?? 0) > 0 && (
                                    <span className="px-2.5 py-1 bg-cyan-500/10 text-cyan-400 rounded-lg text-[11px] font-medium">
                                        Fit: {(rules.fit_categories || []).join(', ')}
                                    </span>
                                )}
                                {(rules.min_score ?? 0) > 0 && (
                                    <span className="px-2.5 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-[11px] font-medium">
                                        Score ≥ {rules.min_score}
                                    </span>
                                )}
                                {(rules.signal_types?.length ?? 0) > 0 && (
                                    <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-lg text-[11px] font-medium">
                                        Signals: {(rules.signal_types || []).join(', ')}
                                    </span>
                                )}
                                {(rules.min_signals ?? 0) > 0 && (
                                    <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-[11px] font-medium">
                                        ≥{rules.min_signals} signals
                                    </span>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-600 italic">No trigger rules — manual enrollment only</p>
                        )}
                    </div>

                    {/* Steps */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Zap className="w-3 h-3" /> Sequence Steps
                            </h5>
                            <button onClick={onAddStep} className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
                                <Plus className="w-3 h-3" /> Add Step
                            </button>
                        </div>

                        {play.steps.length === 0 ? (
                            <p className="text-xs text-slate-600 italic py-3">No steps yet — add steps to build the sequence</p>
                        ) : (
                            <div className="space-y-2">
                                {play.steps.map((step, idx) => {
                                    const cfg = STEP_TYPE_CONFIG[step.step_type] || STEP_TYPE_CONFIG.task;
                                    const StepIcon = cfg.icon;
                                    return (
                                        <div key={step.id} className="flex items-start gap-3 group">
                                            {/* Connector line */}
                                            <div className="flex flex-col items-center pt-1">
                                                <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                                                    <StepIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
                                                </div>
                                                {idx < play.steps.length - 1 && (
                                                    <div className="w-px h-6 bg-slate-800/60 mt-1" />
                                                )}
                                            </div>
                                            {/* Step content */}
                                            <div className="flex-1 bg-[#0A0F1E] rounded-xl px-4 py-3 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className={`text-[11px] font-bold uppercase ${cfg.color}`}>
                                                        Step {step.step_number} — {cfg.label}
                                                    </span>
                                                    <button onClick={() => onDeleteStep(step.id)}
                                                        className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <StepConfigDisplay type={step.step_type} config={step.config as StepConfig} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Add Step Form */}
                        {addingStep && (
                            <div className="mt-3 bg-[#0A0F1E] border border-blue-500/20 rounded-xl p-4 animate-in fade-in duration-200">
                                <div className="flex items-center gap-2 mb-3">
                                    {Object.entries(STEP_TYPE_CONFIG).map(([type, cfg]) => {
                                        const Icon = cfg.icon;
                                        return (
                                            <button key={type} onClick={() => { setNewStepType(type); setNewStepConfig({}); }}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${newStepType === type ? `${cfg.bg} ${cfg.color} border border-current/20` : 'bg-slate-800/40 text-slate-500 hover:text-slate-300'}`}>
                                                <Icon className="w-3 h-3" /> {cfg.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <StepConfigForm type={newStepType} config={newStepConfig} setConfig={setNewStepConfig} />
                                <div className="flex gap-2 mt-3">
                                    <button onClick={onSubmitStep} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors">Add Step</button>
                                    <button onClick={onCancelStep} className="px-4 py-2 bg-slate-800 text-slate-400 rounded-lg text-xs font-semibold hover:text-white transition-colors">Cancel</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Enrollments summary */}
                    {play.enrollments.length > 0 && (
                        <div>
                            <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Users className="w-3 h-3" /> Enrolled ({play.enrollment_count})
                            </h5>
                            <div className="space-y-2 max-h-72 overflow-y-auto">
                                {play.enrollments.slice(0, 20).map(e => (
                                    <div key={e.id} className="bg-[#0A0F1E] rounded-xl px-3 py-3 border border-slate-800/30">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-white font-medium truncate">
                                                        {e.lead?.email || e.domain || 'Unknown'}
                                                    </span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${e.status === 'active'
                                                            ? 'text-emerald-400 bg-emerald-500/10'
                                                            : e.status === 'completed'
                                                                ? 'text-blue-400 bg-blue-500/10'
                                                                : e.status === 'paused'
                                                                    ? 'text-amber-400 bg-amber-500/10'
                                                                    : 'text-slate-500 bg-slate-800/40'
                                                        }`}>
                                                        {e.status}
                                                    </span>
                                                </div>
                                                <div className="mt-1 text-[11px] text-slate-400">
                                                    Step {e.current_step}
                                                    {e.current_step_detail ? ` • ${e.current_step_detail.label}: ${e.current_step_detail.description}` : ''}
                                                </div>
                                                {e.next_step_detail && e.status === 'active' && (
                                                    <div className="mt-1 text-[11px] text-slate-500">
                                                        Next: {e.next_step_detail.label} • {e.next_step_detail.description}
                                                    </div>
                                                )}
                                                {e.step_history && e.step_history.length > 0 && (
                                                    <div className="mt-1 text-[11px] text-slate-500">
                                                        Last event: {e.step_history[e.step_history.length - 1]?.action}
                                                        {e.step_history[e.step_history.length - 1]?.outcome ? ` • ${e.step_history[e.step_history.length - 1]?.outcome}` : ''}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap justify-end gap-2 flex-shrink-0">
                                                {e.status === 'active' && (
                                                    <>
                                                        <EnrollmentActionButton label="Advance" tone="blue" busy={actingEnrollmentId === e.id} onClick={() => onAdvanceEnrollment(e.id)} />
                                                        <EnrollmentActionButton label="Pause" tone="amber" busy={actingEnrollmentId === e.id} onClick={() => onPauseEnrollment(e.id)} />
                                                    </>
                                                )}
                                                {e.status === 'paused' && (
                                                    <EnrollmentActionButton label="Resume" tone="emerald" busy={actingEnrollmentId === e.id} onClick={() => onResumeEnrollment(e.id)} />
                                                )}
                                                {e.status !== 'completed' && e.status !== 'exited' && (
                                                    <>
                                                        <EnrollmentActionButton label="Mark Won" tone="emerald" busy={actingEnrollmentId === e.id} onClick={() => onWinEnrollment(e.id)} />
                                                        <EnrollmentActionButton label="Exit" tone="slate" busy={actingEnrollmentId === e.id} onClick={() => onExitEnrollment(e.id)} />
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {play.enrollments.length > 20 && (
                                    <p className="text-xs text-slate-600 text-center py-1">+{play.enrollments.length - 20} more</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/40">
                        <button onClick={onDelete} className="px-3 py-1.5 text-red-400/60 hover:text-red-400 text-xs font-medium transition-colors flex items-center gap-1">
                            <Trash2 className="w-3 h-3" /> Delete Play
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}


// ─── Step Config Display ─────────────────────────────────────

function ExecutionStatCard({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: 'cyan' | 'emerald' | 'amber' | 'blue' }) {
    const toneStyles = {
        cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
        emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
        amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
        blue: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    };

    return (
        <div className={`rounded-xl border px-4 py-3 ${toneStyles[tone]}`}>
            <div className="text-xl font-bold text-white">{value}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mt-1">{label}</div>
            <div className="text-[11px] text-slate-400 mt-1">{sub}</div>
        </div>
    );
}

function EnrollmentActionButton({
    label,
    tone,
    busy,
    onClick,
}: {
    label: string;
    tone: 'blue' | 'amber' | 'emerald' | 'slate';
    busy: boolean;
    onClick: () => void;
}) {
    const toneStyles = {
        blue: 'bg-blue-500/10 text-blue-300 hover:bg-blue-500/20',
        amber: 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
        emerald: 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
        slate: 'bg-slate-800 text-slate-300 hover:bg-slate-700',
    };

    return (
        <button
            onClick={onClick}
            disabled={busy}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50 ${toneStyles[tone]}`}
        >
            {busy ? '...' : label}
        </button>
    );
}

function StepConfigDisplay({ type, config }: { type: string; config: StepConfig }) {
    const formatValue = (value: StepConfigValue, fallback: string) => {
        if (value == null || value === '') return fallback;
        if (Array.isArray(value)) return value.join(', ');
        return String(value);
    };

    if (type === 'email') {
        return (
            <div className="space-y-1">
                <p className="text-xs text-white font-medium">Subject: <span className="text-slate-300 font-normal">{formatValue(config.subject, '(empty)')}</span></p>
                <p className="text-xs text-slate-400 line-clamp-2 whitespace-pre-wrap">{formatValue(config.body, '(empty body)')}</p>
            </div>
        );
    }
    if (type === 'wait') {
        const daysValue = typeof config.days === 'number' ? config.days : Number(config.days || 0);
        const days = Number.isFinite(daysValue) ? daysValue : 0;
        return <p className="text-xs text-amber-300">Wait {days} day{days !== 1 ? 's' : ''}</p>;
    }
    if (type === 'task') {
        return (
            <div>
                <p className="text-xs text-white font-medium">{formatValue(config.title, '(untitled)')}</p>
                {config.description && <p className="text-xs text-slate-400 mt-0.5">{formatValue(config.description, '')}</p>}
            </div>
        );
    }
    if (type === 'condition') {
        const yesValue = typeof config.yes_step === 'number' ? config.yes_step : Number(config.yes_step || 0);
        const noValue = typeof config.no_step === 'number' ? config.no_step : Number(config.no_step || 0);
        const yesStep = Number.isFinite(yesValue) ? yesValue : '?';
        const noStep = Number.isFinite(noValue) ? noValue : '?';
        return (
            <p className="text-xs text-sky-300">
                If <span className="font-mono text-sky-400">{formatValue(config.check, '?')}</span> → step {yesStep}, else → step {noStep}
            </p>
        );
    }
    return <p className="text-xs text-slate-500">{JSON.stringify(config)}</p>;
}


// ─── Step Config Form ────────────────────────────────────────

function StepConfigForm({ type, config, setConfig }: { type: string; config: StepConfig; setConfig: (v: StepConfig) => void }) {
    if (type === 'email') {
        return (
            <div className="space-y-2">
                <input value={config.subject || ''} onChange={e => setConfig({ ...config, subject: e.target.value })}
                    placeholder="Subject line (supports {{company}}, {{first_name}})"
                    className="w-full bg-[#131A2E] border border-slate-800/60 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-blue-500/40" />
                <textarea value={config.body || ''} onChange={e => setConfig({ ...config, body: e.target.value })}
                    placeholder="Email body (supports template variables)"
                    rows={4}
                    className="w-full bg-[#131A2E] border border-slate-800/60 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-blue-500/40 resize-none" />
            </div>
        );
    }
    if (type === 'wait') {
        return (
            <input type="number" value={config.days || ''} onChange={e => setConfig({ ...config, days: Number(e.target.value) || 0 })}
                placeholder="Days to wait"
                className="w-48 bg-[#131A2E] border border-slate-800/60 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-amber-500/40" />
        );
    }
    if (type === 'task') {
        return (
            <div className="space-y-2">
                <input value={config.title || ''} onChange={e => setConfig({ ...config, title: e.target.value })}
                    placeholder="Task title"
                    className="w-full bg-[#131A2E] border border-slate-800/60 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-emerald-500/40" />
                <input value={config.description || ''} onChange={e => setConfig({ ...config, description: e.target.value })}
                    placeholder="Task description"
                    className="w-full bg-[#131A2E] border border-slate-800/60 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-emerald-500/40" />
            </div>
        );
    }
    if (type === 'condition') {
        return (
            <div className="grid grid-cols-3 gap-2">
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Check</label>
                    <select value={config.check || 'email_opened'} onChange={e => setConfig({ ...config, check: e.target.value })}
                        className="w-full bg-[#131A2E] border border-slate-800/60 rounded-lg px-3 py-2 text-white text-xs outline-none">
                        <option value="email_opened">Email Opened</option>
                        <option value="email_replied">Email Replied</option>
                        <option value="link_clicked">Link Clicked</option>
                        <option value="meeting_booked">Meeting Booked</option>
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">If Yes → Step</label>
                    <input type="number" value={config.yes_step || ''} onChange={e => setConfig({ ...config, yes_step: Number(e.target.value) || 0 })}
                        className="w-full bg-[#131A2E] border border-slate-800/60 rounded-lg px-3 py-2 text-white text-xs outline-none" />
                </div>
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">If No → Step</label>
                    <input type="number" value={config.no_step || ''} onChange={e => setConfig({ ...config, no_step: Number(e.target.value) || 0 })}
                        className="w-full bg-[#131A2E] border border-slate-800/60 rounded-lg px-3 py-2 text-white text-xs outline-none" />
                </div>
            </div>
        );
    }
    return null;
}
