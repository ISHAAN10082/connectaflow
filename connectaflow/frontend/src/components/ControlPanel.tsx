"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    Sparkles, BarChart3, Radio, Target, Download, Zap,
    BookOpen, Plus, Building2, FlaskRound, RefreshCw, ArrowRight, CheckCircle2, CircleDashed,
    Database, Compass, ClipboardCheck, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { GTMIntelligence } from './GTMIntelligence';
import { EnrichmentDashboard } from './EnrichmentDashboard';
import { SignalQueue } from './SignalQueue';
import { KPIDashboard } from './KPIDashboard';
import { LeadTable } from './LeadTable';
import { PlaybookManager } from './PlaybookManager';
import {
    applyPlaybookTemplate,
    createGTMContext,
    createPlaybook,
    createWorkspace,
    exportEnrichedCSV,
    generateGTMStrategy,
    getActiveWorkspaceId,
    getProfiles,
    getSignalQueue,
    listGTMContexts,
    listPlaybooks,
    listWorkspaces,
    setActiveWorkspaceId,
    type GTMContextSummary,
    type WorkspaceData,
} from '../services/api';
import { getErrorMessage } from '../lib/errors';

type Screen = 'gtm-context' | 'playbooks' | 'enrichment' | 'signals' | 'leads' | 'analytics';

const NAV_ITEMS: { key: Screen; label: string; icon: typeof Sparkles; desc: string; module: string }[] = [
    { key: 'gtm-context', label: 'Mission Setup', icon: Target, desc: 'Define the GTM thesis, ICP, personas, and plays.', module: 'GTM Intelligence' },
    { key: 'enrichment', label: 'Accounts', icon: Sparkles, desc: 'Import domains and enrich accounts with evidence and provenance.', module: 'Enrichment' },
    { key: 'signals', label: 'Queue', icon: Radio, desc: 'Review urgency, confidence, and who deserves attention now.', module: 'Signal Queue' },
    { key: 'playbooks', label: 'Plays', icon: BookOpen, desc: 'Operationalize the next move and keep execution moving.', module: 'Playbooks' },
    { key: 'leads', label: 'Records', icon: Database, desc: 'Search, edit, and maintain the actual contact database.', module: 'Leads' },
    { key: 'analytics', label: 'Outcomes', icon: BarChart3, desc: 'See throughput, health, and what the system is learning.', module: 'Command Center' },
];

const DEMO_ENRICHMENT_DOMAINS = [
    'notion.so',
    'intercom.com',
    'gong.io',
    'ramp.com',
    'vanta.com',
    'merge.dev',
];

export function ControlPanel() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const initialScreen = searchParams.get('screen');
    const resolvedInitialScreen = NAV_ITEMS.some((item) => item.key === initialScreen)
        ? (initialScreen as Screen)
        : 'gtm-context';

    const [activeScreen, setActiveScreen] = useState<Screen>(resolvedInitialScreen);
    const [selectedIcpId, setSelectedIcpId] = useState<string | null>(null);
    const [preferredGtmContextId, setPreferredGtmContextId] = useState<string | null>(null);
    const [workspaceId, setWorkspaceId] = useState<string | null>(null);
    const [workspaceVersion, setWorkspaceVersion] = useState(0);
    const [workspaces, setWorkspaces] = useState<WorkspaceData[]>([]);
    const [loadingSummary, setLoadingSummary] = useState(true);
    const [bootstrappingDemo, setBootstrappingDemo] = useState(false);
    const [demoDomainsSeed, setDemoDomainsSeed] = useState('');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [summary, setSummary] = useState({
        contexts: 0,
        playbooks: 0,
        enrichedCompanies: 0,
        signaledCompanies: 0,
    });
    const [activeContext, setActiveContext] = useState<GTMContextSummary | null>(null);

    useEffect(() => {
        const nextScreen = searchParams.get('screen');
        if (nextScreen && NAV_ITEMS.some((item) => item.key === nextScreen) && nextScreen !== activeScreen) {
            setActiveScreen(nextScreen as Screen);
        }
    }, [activeScreen, searchParams]);

    const navigateToScreen = useCallback((screen: Screen) => {
        setActiveScreen(screen);
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.set('screen', screen);
        router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    }, [pathname, router, searchParams]);

    const loadSummary = useCallback(async () => {
        setLoadingSummary(true);
        try {
            const [contextsResp, playbooksResp, profilesResp, signalsResp, workspacesResp] = await Promise.all([
                listGTMContexts().catch(() => ({ data: { contexts: [] } })),
                listPlaybooks().catch(() => ({ data: { playbooks: [] } })),
                getProfiles(0, 1).catch(() => ({ data: { profiles: [], total: 0 } })),
                getSignalQueue(undefined, 1).catch(() => ({ data: { queue: [], total: 0 } })),
                listWorkspaces().catch(() => ({ data: { workspaces: [] } })),
            ]);

            const availableWorkspaces = workspacesResp.data.workspaces || [];
            const storedWorkspace = getActiveWorkspaceId();
            const resolvedWorkspace = storedWorkspace && availableWorkspaces.some((ws) => ws.id === storedWorkspace)
                ? storedWorkspace
                : availableWorkspaces[0]?.id ?? null;

            if (resolvedWorkspace) {
                setWorkspaceId(resolvedWorkspace);
                setActiveWorkspaceId(resolvedWorkspace);
            }

            setWorkspaces(availableWorkspaces);
            const contexts = contextsResp.data.contexts || [];
            const chosenContext = contexts.find((ctx) => ctx.id === preferredGtmContextId)
                || [...contexts].sort((a, b) => (b.persona_count + b.trigger_count + b.play_count) - (a.persona_count + a.trigger_count + a.play_count))[0]
                || null;
            setActiveContext(chosenContext);
            setSummary({
                contexts: contexts.length,
                playbooks: (playbooksResp.data.playbooks || []).length,
                enrichedCompanies: profilesResp.data.total || 0,
                signaledCompanies: signalsResp.data.total || 0,
            });
        } finally {
            setLoadingSummary(false);
        }
    }, [preferredGtmContextId]);

    useEffect(() => {
        void loadSummary();
    }, [loadSummary]);

    const handleWorkspaceChange = (nextWorkspaceId: string) => {
        setWorkspaceId(nextWorkspaceId);
        setActiveWorkspaceId(nextWorkspaceId);
        setSelectedIcpId(null);
        setPreferredGtmContextId(null);
        setWorkspaceVersion((version) => version + 1);
        void loadSummary();
    };

    const handleCreateWorkspace = async () => {
        const name = window.prompt('Name the new workspace');
        if (!name?.trim()) return;
        try {
            const { data } = await createWorkspace({ name: name.trim() });
            toast.success('Workspace created');
            handleWorkspaceChange(data.id);
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to create workspace'));
        }
    };

    const handleLoadDemoDomains = () => {
        setDemoDomainsSeed(DEMO_ENRICHMENT_DOMAINS.join('\n'));
        navigateToScreen('enrichment');
        setWorkspaceVersion((version) => version + 1);
        toast.success('Demo domains loaded into enrichment');
    };

    const handleCreateDemoWorkflow = async () => {
        setBootstrappingDemo(true);
        try {
            const { data: contextsResp } = await listGTMContexts();
            let context: {
                id: string;
                icp_id: string | null;
                persona_count?: number;
                trigger_count?: number;
                play_count?: number;
            } | null = [...(contextsResp.contexts || [])]
                .filter((ctx) => ctx.name === 'AtlasIQ GTM Demo')
                .sort((a, b) => ((b.persona_count + b.trigger_count + b.play_count) - (a.persona_count + a.trigger_count + a.play_count)))[0] || null;

            if (!context) {
                const created = await createGTMContext({
                    company_name: 'AtlasIQ',
                    website_url: 'https://atlasiq.ai',
                    core_problem: 'Revenue teams waste hours on account research and personalization',
                    product_category: 'Sales Engagement',
                    context_notes: 'Demo workflow for validating Connectaflow end to end.',
                    name: 'AtlasIQ GTM Demo',
                    product_description: 'AI copilot that researches target accounts, detects buying signals, and drafts outbound.',
                    value_proposition: 'Cut account research time 70% and improve reply rates with signal-aware outreach.',
                    target_industries: ['SaaS', 'Fintech', 'Developer Tools'],
                    customer_examples: ['Vanta', 'Merge', 'Ramp'],
                    competitors: ['Apollo', 'Clay', 'ZoomInfo'],
                    geographic_focus: 'US',
                    avg_deal_size: '$20k-$80k ARR',
                    sales_cycle_days: '30-60 days',
                    decision_process: 'VP Sales evaluates, RevOps validates, security signs off',
                    key_integrations: ['Salesforce', 'HubSpot', 'Outreach', 'Gmail'],
                    why_customers_buy: 'Faster prospecting, better personalization, and cleaner timing signals.',
                    why_customers_churn: 'Weak data quality, unclear workflows, and low rep adoption.',
                    common_objections: ['We already use Apollo', 'Signal quality concerns', 'Too much workflow overhead'],
                    market_maturity: 'growing',
                    pricing_model: 'per-seat',
                    icp_name: 'Outbound-stage B2B SaaS',
                    icp_statement: 'US B2B SaaS companies with 50-250 employees actively hiring SDRs, AEs, or RevOps talent.',
                    icp_priority: 'Primary',
                    firmographic_range: {
                        employee_range: '50-250',
                        revenue_range: '$5M-$50M',
                        business_model: 'B2B SaaS',
                        geography: 'US',
                    },
                    icp_rationale: 'The best-fit accounts are scaling revenue teams and need better account intelligence.',
                    list_sourcing_guidance: 'Prioritize hiring-heavy B2B SaaS companies with VP Sales, CRO, and RevOps leaders.',
                });
                context = created.data;
            }

            if ((context.persona_count || 0) === 0 && (context.trigger_count || 0) === 0 && (context.play_count || 0) === 0) {
                await generateGTMStrategy(context.id);
            }

            const { data: playbooksResp } = await listPlaybooks();
            const existingPlaybook = (playbooksResp.playbooks || []).find((playbook) => playbook.name === 'AtlasIQ Inbound Signal Demo');
            if (!existingPlaybook) {
                const createdPlaybook = await createPlaybook({
                    name: 'AtlasIQ Inbound Signal Demo',
                    description: 'Template-backed playbook for validating play execution against enriched accounts.',
                    icp_id: context.icp_id || undefined,
                });
                await applyPlaybookTemplate('inbound-high-intent', createdPlaybook.data.id);
            }

            setPreferredGtmContextId(context.id);
            setSelectedIcpId(context.icp_id || null);
            setDemoDomainsSeed(DEMO_ENRICHMENT_DOMAINS.join('\n'));
            navigateToScreen('gtm-context');
            setWorkspaceVersion((version) => version + 1);
            await loadSummary();
            toast.success('Demo workflow is ready. You should now see the seeded GTM context, then you can move to enrichment.');
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to create demo workflow'));
        } finally {
            setBootstrappingDemo(false);
        }
    };

    const stageStates = useMemo(() => {
        return NAV_ITEMS.map((item) => {
            if (item.key === 'gtm-context') {
                return {
                    ...item,
                    done: summary.contexts > 0,
                    helper: summary.contexts > 0
                        ? `${summary.contexts} thesis${summary.contexts === 1 ? '' : 'es'} ready`
                        : 'Create the core thesis and ICP',
                };
            }
            if (item.key === 'enrichment') {
                return {
                    ...item,
                    done: summary.enrichedCompanies > 0,
                    helper: summary.enrichedCompanies > 0
                        ? `${summary.enrichedCompanies} enriched account${summary.enrichedCompanies === 1 ? '' : 's'}`
                        : 'Run enrichment on a real account set',
                };
            }
            if (item.key === 'signals') {
                return {
                    ...item,
                    done: summary.signaledCompanies > 0,
                    helper: summary.signaledCompanies > 0
                        ? `${summary.signaledCompanies} accounts showing urgency`
                        : 'Detect who is worth acting on',
                };
            }
            if (item.key === 'playbooks') {
                return {
                    ...item,
                    done: summary.playbooks > 0,
                    helper: summary.playbooks > 0
                        ? `${summary.playbooks} playbook${summary.playbooks === 1 ? '' : 's'} available`
                        : 'Create at least one executable playbook',
                };
            }
            if (item.key === 'leads') {
                return {
                    ...item,
                    done: summary.enrichedCompanies > 0 || summary.signaledCompanies > 0,
                    helper: 'Maintain the contact and account database',
                };
            }
            return {
                ...item,
                done: summary.contexts > 0 || summary.enrichedCompanies > 0 || summary.signaledCompanies > 0,
                helper: 'Track coverage, health, and throughput',
            };
        });
    }, [summary]);

    const nextAction = useMemo(() => {
        if (!summary.contexts) {
            return {
                screen: 'gtm-context' as Screen,
                title: 'Publish the thesis first',
                body: 'Everything else gets easier when one GTM context is clearly defined and selected.',
                cta: 'Open Mission Setup',
            };
        }
        if (!summary.enrichedCompanies) {
            return {
                screen: 'enrichment' as Screen,
                title: 'Acquire account evidence',
                body: 'Import or paste a meaningful domain set so the rest of the system has real material to work with.',
                cta: 'Open Accounts',
            };
        }
        if (!summary.signaledCompanies) {
            return {
                screen: 'signals' as Screen,
                title: 'Review urgency next',
                body: 'Now that accounts exist, detect which ones actually deserve attention this week.',
                cta: 'Open Queue',
            };
        }
        if (!summary.playbooks) {
            return {
                screen: 'playbooks' as Screen,
                title: 'Operationalize the motion',
                body: 'Create or apply a playbook so qualified accounts become executable work.',
                cta: 'Open Plays',
            };
        }
        return {
            screen: 'leads' as Screen,
            title: 'Work the records',
            body: 'Inspect the contacts behind the warm accounts, make corrections, and push the best ones into execution.',
            cta: 'Open Records',
        };
    }, [summary]);

    const relatedActions = useMemo(() => {
        const actions: Record<Screen, { label: string; screen: Screen }[]> = {
            'gtm-context': [
                { label: 'Go to Accounts', screen: 'enrichment' },
                { label: 'Go to Plays', screen: 'playbooks' },
            ],
            'enrichment': [
                { label: 'Inspect Queue', screen: 'signals' },
                { label: 'Open Records', screen: 'leads' },
            ],
            'signals': [
                { label: 'Open Records', screen: 'leads' },
                { label: 'Launch Plays', screen: 'playbooks' },
            ],
            'playbooks': [
                { label: 'Open Queue', screen: 'signals' },
                { label: 'Review Outcomes', screen: 'analytics' },
            ],
            'leads': [
                { label: 'Inspect Queue', screen: 'signals' },
                { label: 'Review Outcomes', screen: 'analytics' },
            ],
            'analytics': [
                { label: 'Open Queue', screen: 'signals' },
                { label: 'Open Records', screen: 'leads' },
            ],
        };
        return actions[activeScreen];
    }, [activeScreen]);

    return (
        <div className="flex h-screen bg-[#0A0F1E]/90 text-white" id="control-panel">
            <aside className={`${sidebarCollapsed ? 'w-[92px]' : 'w-[280px]'} shrink-0 border-r border-slate-800/60 bg-[#0D1224] flex flex-col transition-[width] duration-200`}>
                <div className="p-5 border-b border-slate-800/60">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            <Zap className="w-5 h-5 text-white" />
                        </div>
                        {!sidebarCollapsed && (
                        <div>
                            <h1 className="text-[15px] font-bold tracking-tight">Connectaflow</h1>
                            <p className="text-[11px] text-slate-500 font-medium">Operator Mission Control</p>
                        </div>
                        )}
                        <button
                            onClick={() => setSidebarCollapsed((value) => !value)}
                            className="ml-auto rounded-xl border border-slate-800/60 bg-[#10172B] p-2 text-slate-400 hover:text-white"
                            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        </button>
                    </div>

                    {!sidebarCollapsed && (
                    <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Workspace</label>
                            <button onClick={handleCreateWorkspace} className="text-cyan-400 hover:text-cyan-300 transition-colors" title="Create workspace">
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="relative">
                            <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <select
                                value={workspaceId || ''}
                                onChange={(event) => handleWorkspaceChange(event.target.value)}
                                className="w-full rounded-xl border border-slate-800/60 bg-[#10172B] py-2.5 pl-9 pr-4 text-sm text-white outline-none focus:border-cyan-500/40"
                            >
                                {workspaces.map((workspace) => (
                                    <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    )}
                </div>

                <nav className="flex-1 p-3 space-y-1">
                    {stageStates.map((item, index) => (
                        <button
                            key={item.key}
                            onClick={() => navigateToScreen(item.key)}
                            className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
                                activeScreen === item.key
                                    ? 'border-cyan-500/30 bg-cyan-500/10 text-white'
                                    : 'border-transparent text-slate-400 hover:border-slate-800/60 hover:bg-white/[0.03] hover:text-white'
                            }`}
                            title={sidebarCollapsed ? `${item.label}: ${item.helper}` : undefined}
                        >
                            <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
                                <item.icon className={`w-[18px] h-[18px] ${activeScreen === item.key ? 'text-cyan-400' : 'text-slate-500'}`} />
                                {!sidebarCollapsed && (
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className="text-[11px] font-semibold text-slate-500">0{index + 1}</div>
                                        <div className="text-[13px] font-semibold truncate">{item.label}</div>
                                    </div>
                                    <div className="text-[10px] text-slate-500 truncate">{item.helper}</div>
                                </div>
                                )}
                                {!sidebarCollapsed && (item.done
                                    ? <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-400" />
                                    : <CircleDashed className="ml-auto h-4 w-4 shrink-0 text-slate-600" />)}
                            </div>
                        </button>
                    ))}
                </nav>

                <div className="p-3 border-t border-slate-800/60 space-y-2">
                    <button
                        onClick={handleCreateDemoWorkflow}
                        disabled={bootstrappingDemo}
                        className="w-full rounded-xl bg-cyan-500/15 px-3 py-2.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        title="Seed demo workflow"
                    >
                        {bootstrappingDemo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FlaskRound className="w-4 h-4" />}
                        {!sidebarCollapsed && 'Seed Demo Workflow'}
                    </button>
                    <button
                        onClick={handleLoadDemoDomains}
                        className="w-full rounded-xl bg-[#10172B] border border-slate-800/60 px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
                        title="Load demo domains"
                    >
                        {sidebarCollapsed ? 'Demo' : 'Load Demo Domains'}
                    </button>
                    <button
                        onClick={() => {
                            exportEnrichedCSV();
                            toast.success('Export started');
                        }}
                        className="w-full rounded-xl bg-[#10172B] border border-slate-800/60 px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:border-slate-700 transition-colors flex items-center justify-center gap-2"
                        title="Export CSV"
                    >
                        <Download className="w-4 h-4" />
                        {!sidebarCollapsed && 'Export CSV'}
                    </button>
                </div>
            </aside>

            <main className="flex-1 overflow-auto">
                <div className="border-b border-slate-800/60 bg-[#0A0F1E]/95 px-6 py-5">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
                        <div className="rounded-3xl border border-slate-800/60 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_transparent_45%),linear-gradient(180deg,rgba(19,26,46,0.95),rgba(10,15,30,0.92))] p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300/80 font-semibold">Active Mission</p>
                                    <h2 className="mt-2 text-2xl font-bold text-white">
                                        {activeContext?.name || 'No thesis published yet'}
                                    </h2>
                                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                                        {activeContext?.product_description || 'Define one GTM thesis, then move through accounts, queue, plays, records, and outcomes without losing continuity.'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => void loadSummary()}
                                    className="rounded-xl border border-slate-800/60 bg-[#131A2E] px-3 py-2 text-sm font-medium text-slate-300 hover:text-white hover:border-slate-700 transition-colors flex items-center gap-2"
                                >
                                    <RefreshCw className={`w-4 h-4 ${loadingSummary ? 'animate-spin' : ''}`} />
                                    Refresh
                                </button>
                            </div>
                            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <MetricCard label="Theses" value={summary.contexts} sub={activeContext?.geographic_focus || 'No active geography'} icon={Compass} />
                                <MetricCard label="Playbooks" value={summary.playbooks} sub="Ready to operationalize" icon={BookOpen} />
                                <MetricCard label="Accounts" value={summary.enrichedCompanies} sub="Enriched companies" icon={Sparkles} />
                                <MetricCard label="Queue" value={summary.signaledCompanies} sub="Accounts showing urgency" icon={ClipboardCheck} />
                            </div>
                            {activeContext && (
                                <div className="mt-5 flex flex-wrap gap-2">
                                    {(activeContext.target_industries || []).slice(0, 4).map((industry) => (
                                        <span key={industry} className="rounded-full border border-cyan-500/20 bg-cyan-500/8 px-3 py-1 text-xs font-medium text-cyan-100">
                                            {industry}
                                        </span>
                                    ))}
                                    {activeContext.value_proposition && (
                                        <span className="rounded-full border border-slate-700/80 bg-white/[0.03] px-3 py-1 text-xs font-medium text-slate-300">
                                            {activeContext.value_proposition}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="rounded-3xl border border-slate-800/60 bg-[#11192D] p-5">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-semibold">Next Best Move</p>
                            <h3 className="mt-2 text-lg font-bold text-white">{nextAction.title}</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-400">{nextAction.body}</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    onClick={() => navigateToScreen(nextAction.screen)}
                                    className="inline-flex items-center gap-2 rounded-xl bg-cyan-500/15 px-4 py-2.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20"
                                >
                                    {nextAction.cta}
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                                {relatedActions.map((action) => (
                                    <button
                                        key={action.screen}
                                        onClick={() => navigateToScreen(action.screen)}
                                        className="rounded-xl border border-slate-800/60 bg-[#0E1528] px-3 py-2.5 text-sm text-slate-300 hover:text-white"
                                    >
                                        {action.label}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-5 space-y-3">
                                {stageStates.slice(0, 4).map((item) => (
                                    <button
                                        key={item.key}
                                        onClick={() => navigateToScreen(item.key)}
                                        className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left ${
                                            item.done ? 'border-emerald-500/15 bg-emerald-500/6' : 'border-slate-800/60 bg-[#0E1528]'
                                        }`}
                                    >
                                        <div>
                                            <p className="text-sm font-semibold text-white">{item.label}</p>
                                            <p className="mt-1 text-xs text-slate-400">{item.helper}</p>
                                        </div>
                                        <span className={`text-xs font-semibold ${item.done ? 'text-emerald-400' : 'text-slate-500'}`}>
                                            {item.done ? 'Ready' : 'Needs work'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div key={`${workspaceVersion}:${activeScreen}`} className="min-h-[calc(100vh-81px)]">
                    {activeScreen === 'gtm-context' && (
                        <GTMIntelligence
                            onICPGenerated={(id) => setSelectedIcpId(id)}
                            preferredContextId={preferredGtmContextId}
                        />
                    )}
                    {activeScreen === 'playbooks' && <PlaybookManager icpId={selectedIcpId} />}
                    {activeScreen === 'enrichment' && <EnrichmentDashboard icpId={selectedIcpId} initialDomains={demoDomainsSeed} />}
                    {activeScreen === 'signals' && <SignalQueue icpId={selectedIcpId} />}
                    {activeScreen === 'leads' && (
                        <div className="p-6">
                            <LeadTable />
                        </div>
                    )}
                    {activeScreen === 'analytics' && <KPIDashboard />}
                </div>
            </main>
        </div>
    );
}

function MetricCard({
    label,
    value,
    sub,
    icon: Icon,
}: {
    label: string;
    value: number;
    sub: string;
    icon: typeof Sparkles;
}) {
    return (
        <div className="rounded-2xl border border-slate-800/60 bg-[#0E1528]/85 p-3">
            <div className="flex items-center gap-2">
                <div className="rounded-xl bg-white/[0.04] p-2">
                    <Icon className="h-4 w-4 text-cyan-300" />
                </div>
                <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
                    <p className="text-lg font-bold text-white">{value}</p>
                </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">{sub}</p>
        </div>
    );
}
