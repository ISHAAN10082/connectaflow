"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Target, Brain, Sparkles, Workflow, RefreshCw, Loader2, Plus, ShieldCheck,
    Compass, AlertTriangle, ListTree, FlaskRound
} from 'lucide-react';
import { toast } from 'sonner';
import {
    listGTMContexts, createGTMContext, getGTMContext, updateGTMContext, generateGTMStrategy, refineFromEnrichment,
    parseGTMContextFiles, generateICPSuggestions, generateSourcingGuide,
    listMissionICPs, createMissionICP, updateMissionICP, deleteMissionICP, duplicateMissionICP,
    listAssets, createAsset, deleteAsset,
    type GTMContextSummary, type GTMContextDetail, type ICPSuggestion, type ICP, type SocialProofAsset
} from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { Chip, Enrichment, Overview, Personas, Plays, Signals, Triggers } from './gtm/GTMContextSections';

type TabKey = 'overview' | 'personas' | 'triggers' | 'signals' | 'plays' | 'enrichment' | 'icps' | 'assets';

interface Props {
    onICPGenerated?: (id: string) => void;
    preferredContextId?: string | null;
}

export function GTMIntelligence({ onICPGenerated, preferredContextId }: Props) {
    const [contexts, setContexts] = useState<GTMContextSummary[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<GTMContextDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [missionICPs, setMissionICPs] = useState<ICP[]>([]);
    const [assets, setAssets] = useState<SocialProofAsset[]>([]);
    const [icpsLoading, setIcpsLoading] = useState(false);
    const [assetsLoading, setAssetsLoading] = useState(false);
    const [refining, setRefining] = useState(false);
    const [tab, setTab] = useState<TabKey>('overview');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [demoPrefilled, setDemoPrefilled] = useState(false);
    const initialLoadRef = useRef(false);

    // Form state
    const [companyName, setCompanyName] = useState('');
    const [websiteUrl, setWebsiteUrl] = useState('');
    const [coreProblem, setCoreProblem] = useState('');
    const [productCategory, setProductCategory] = useState('');
    const [contextNotes, setContextNotes] = useState('');
    const [name, setName] = useState('');
    const [product, setProduct] = useState('');
    const [valueProp, setValueProp] = useState('');
    const [targets, setTargets] = useState('');
    const [examples, setExamples] = useState('');
    const [competitors, setCompetitors] = useState('');
    const [geoFocus, setGeoFocus] = useState('');
    const [dealSize, setDealSize] = useState('');
    const [salesCycle, setSalesCycle] = useState('');
    const [decisionProcess, setDecisionProcess] = useState('');
    const [integrations, setIntegrations] = useState('');
    const [whyBuy, setWhyBuy] = useState('');
    const [whyChurn, setWhyChurn] = useState('');
    const [objections, setObjections] = useState('');
    const [pricingModel, setPricingModel] = useState('');
    const [marketMaturity, setMarketMaturity] = useState('');
    const [icpName, setIcpName] = useState('');
    const [icpStatement, setIcpStatement] = useState('');
    const [icpPriority, setIcpPriority] = useState('Primary');
    const [firmoEmployees, setFirmoEmployees] = useState('');
    const [firmoRevenue, setFirmoRevenue] = useState('');
    const [firmoBusinessModel, setFirmoBusinessModel] = useState('');
    const [firmoGeography, setFirmoGeography] = useState('');
    const [icpRationale, setIcpRationale] = useState('');
    const [listSourcingGuidance, setListSourcingGuidance] = useState('');
    const [icpSuggestions, setIcpSuggestions] = useState<ICPSuggestion[]>([]);

    const loadContexts = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await listGTMContexts();
            setContexts(data.contexts || []);
            return data.contexts || [];
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to load GTM contexts'));
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    const handleLoadDemo = useCallback((silent = false) => {
        setCompanyName('AtlasIQ');
        setWebsiteUrl('https://atlasiq.ai');
        setCoreProblem('Revenue teams waste hours on account research and personalization');
        setProductCategory('Sales Engagement');
        setName('AtlasIQ GTM');
        setProduct('AI copilot that auto-researches accounts and drafts outbound');
        setValueProp('Cut research time 70% and lift reply rates 2x');
        setTargets('SaaS, Fintech, DevTools');
        setExamples('NovaAI, PipelinePro, GrowthGrid');
        setCompetitors('ZoomInfo, Apollo, Clay');
        setGeoFocus('US, UK');
        setDealSize('$20k-$80k ARR');
        setSalesCycle('30-60 days');
        setDecisionProcess('VP Sales evaluates → RevOps validates → Security review');
        setIntegrations('Salesforce, HubSpot, Outreach, LinkedIn');
        setWhyBuy('Faster pipeline creation and better personalization at scale');
        setWhyChurn('Poor rep adoption or data quality');
        setObjections('We already use Apollo, AI accuracy concerns');
        setPricingModel('per-seat');
        setMarketMaturity('growing');
        setIcpName('Outbound-Stage SaaS');
        setIcpStatement('US SaaS companies with 50–200 employees actively hiring SDRs');
        setIcpPriority('Primary');
        setFirmoEmployees('50-200');
        setFirmoRevenue('$5M-$50M');
        setFirmoBusinessModel('B2B SaaS');
        setFirmoGeography('US');
        setIcpRationale('Clear outbound motion and hiring signals indicate urgency for sales tooling');
        setListSourcingGuidance('Apollo: US, Industry=Software/SaaS, Employees=50-200, Job keywords=SDR; Titles=VP Sales, CRO, RevOps');
        setContextNotes('Deck highlights 3 case studies with 2x reply lift and 40% faster SDR ramp.');
        if (!silent) toast.success('Demo context loaded');
    }, []);

    const selectContext = useCallback(async (id: string) => {
        setSelectedId(id);
        setDetail(null);
        setLoading(true);
        try {
            const { data } = await getGTMContext(id);
            setDetail(data);
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to load context'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (initialLoadRef.current) return;
        initialLoadRef.current = true;
        void (async () => {
            const ctxs = await loadContexts();
            if (!selectedId && ctxs.length) {
                await selectContext(ctxs[0].id);
            }
            if (!ctxs.length && !demoPrefilled) {
                handleLoadDemo(true);
                setDemoPrefilled(true);
            }
        })();
    }, [demoPrefilled, handleLoadDemo, loadContexts, selectContext, selectedId]);

    useEffect(() => {
        if (!preferredContextId || preferredContextId === selectedId) return;
        void selectContext(preferredContextId);
    }, [preferredContextId, selectContext, selectedId]);

    const handleCreate = async () => {
        if (!name.trim()) {
            toast.error('Name is required');
            return;
        }
        setCreating(true);
        try {
            const payload = {
                company_name: companyName,
                website_url: websiteUrl,
                core_problem: coreProblem,
                product_category: productCategory,
                context_notes: contextNotes,
                name,
                product_description: product,
                value_proposition: valueProp,
                target_industries: parseList(targets),
                customer_examples: parseList(examples),
                competitors: parseList(competitors),
                geographic_focus: geoFocus,
                avg_deal_size: dealSize,
                sales_cycle_days: salesCycle,
                decision_process: decisionProcess,
                key_integrations: parseList(integrations),
                why_customers_buy: whyBuy,
                why_customers_churn: whyChurn,
                common_objections: parseList(objections),
                pricing_model: pricingModel,
                market_maturity: marketMaturity,
                icp_name: icpName,
                icp_statement: icpStatement,
                icp_priority: icpPriority,
                firmographic_range: {
                    employee_range: firmoEmployees,
                    revenue_range: firmoRevenue,
                    business_model: firmoBusinessModel,
                    geography: firmoGeography,
                },
                icp_rationale: icpRationale,
                list_sourcing_guidance: listSourcingGuidance,
            };
            const { data } = await createGTMContext(payload);
            toast.success('Context created');
            await loadContexts();
            setSelectedId(data.id);
            setDetail(data);
            setTab('overview');
            if (onICPGenerated && data.icp_id) onICPGenerated(data.icp_id);
            resetForm();
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to create'));
        } finally {
            setCreating(false);
        }
    };

    const handleGenerate = async () => {
        if (!selectedId) return;
        setGenerating(true);
        try {
            await generateGTMStrategy(selectedId);
            toast.success('Strategy generated — personas, triggers, signals, and plays created');

            // Auto-generate ICPs after strategy — this fulfils the "ICP not auto-generated" spec issue
            try {
                const { data: icpSuggestionsData } = await generateICPSuggestions(selectedId);
                const suggestions: ICPSuggestion[] = icpSuggestionsData.suggestions || [];
                // Persist the top 2-3 suggestions as proper ICP records
                for (const s of suggestions.slice(0, 3)) {
                    await createMissionICP(selectedId, {
                        name: s.icp_name,
                        icp_statement: s.icp_statement,
                        icp_priority: s.icp_priority || 'Primary',
                        firmographic_range: s.firmographic_range || {},
                        icp_rationale: s.icp_rationale || '',
                        list_sourcing_guidance: s.list_sourcing_guidance || '',
                    });
                }
                // Refresh ICP list
                const { data: icpData } = await listMissionICPs(selectedId);
                setMissionICPs(icpData.icps || []);
                toast.success(`${suggestions.slice(0, 3).length} ICP${suggestions.length !== 1 ? 's' : ''} auto-generated`);
            } catch {
                // ICP generation failure is non-blocking — strategy succeeded
            }

            await selectContext(selectedId);
            setTab('icps');
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Generation failed'));
        } finally {
            setGenerating(false);
        }
    };

    const handleRefine = async () => {
        if (!selectedId) return;
        setRefining(true);
        try {
            const { data } = await refineFromEnrichment(selectedId);
            toast.success(`Refined using ${data.companies_analyzed} companies`);
            await selectContext(selectedId);
            setTab('enrichment');
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Refine failed'));
        } finally {
            setRefining(false);
        }
    };

    const resetForm = () => {
        setCompanyName('');
        setWebsiteUrl('');
        setCoreProblem('');
        setProductCategory('');
        setContextNotes('');
        setName('');
        setProduct('');
        setValueProp('');
        setTargets('');
        setExamples('');
        setCompetitors('');
        setGeoFocus('');
        setDealSize('');
        setSalesCycle('');
        setDecisionProcess('');
        setIntegrations('');
        setWhyBuy('');
        setWhyChurn('');
        setObjections('');
        setPricingModel('');
        setMarketMaturity('');
        setIcpName('');
        setIcpStatement('');
        setIcpPriority('Primary');
        setFirmoEmployees('');
        setFirmoRevenue('');
        setFirmoBusinessModel('');
        setFirmoGeography('');
        setIcpRationale('');
        setListSourcingGuidance('');
        setIcpSuggestions([]);
    };

    type ExtractedContext = Partial<{
        company_name: string;
        website_url: string;
        core_problem: string;
        product_category: string;
        product_description: string;
        value_proposition: string;
        target_industries: string[];
        customer_examples: string[];
        competitors: string[];
        geographic_focus: string | string[];
        avg_deal_size: string;
        sales_cycle_days: string;
        decision_process: string;
        key_integrations: string[];
        why_customers_buy: string;
        why_customers_churn: string;
        common_objections: string[];
        pricing_model: string;
        market_maturity: string;
        context_notes: string;
    }>;

    const handleParseFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        try {
            const { data } = await parseGTMContextFiles(Array.from(files));
            const e = (data.extracted || {}) as ExtractedContext;
            setCompanyName(e.company_name || companyName);
            setWebsiteUrl(e.website_url || websiteUrl);
            setCoreProblem(e.core_problem || coreProblem);
            setProductCategory(e.product_category || productCategory);
            setProduct(e.product_description || product);
            setValueProp(e.value_proposition || valueProp);
            setTargets((e.target_industries || []).join(', '));
            setExamples((e.customer_examples || []).join(', '));
            setCompetitors((e.competitors || []).join(', '));
            const geo = Array.isArray(e.geographic_focus) ? e.geographic_focus.join(', ') : e.geographic_focus;
            setGeoFocus(geo || geoFocus);
            setDealSize(e.avg_deal_size || dealSize);
            setSalesCycle(e.sales_cycle_days || salesCycle);
            setDecisionProcess(e.decision_process || decisionProcess);
            setIntegrations((e.key_integrations || []).join(', '));
            setWhyBuy(e.why_customers_buy || whyBuy);
            setWhyChurn(e.why_customers_churn || whyChurn);
            setObjections((e.common_objections || []).join(', '));
            setPricingModel(e.pricing_model || pricingModel);
            setMarketMaturity(e.market_maturity || marketMaturity);
            setContextNotes(e.context_notes || contextNotes);
            toast.success(`Context parsed (${data.context_quality_score || 0}% complete)`);
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to parse context files'));
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleGenerateICPSuggestions = async () => {
        if (!selectedId) {
            toast.error('Create a context first');
            return;
        }
        try {
            const { data } = await generateICPSuggestions(selectedId);
            setIcpSuggestions(data.suggestions || []);
            toast.success('ICP suggestions generated');
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to generate ICP suggestions'));
        }
    };

    const applyIcpSuggestion = async (s: ICPSuggestion) => {
        setIcpName(s.icp_name || '');
        setIcpStatement(s.icp_statement || '');
        setIcpPriority(s.icp_priority || 'Primary');
        setFirmoEmployees(s.firmographic_range?.employee_range || '');
        setFirmoRevenue(s.firmographic_range?.revenue_range || '');
        setFirmoBusinessModel(s.firmographic_range?.business_model || '');
        setFirmoGeography(s.firmographic_range?.geography || '');
        setIcpRationale(s.icp_rationale || '');
        setListSourcingGuidance(s.list_sourcing_guidance || '');

        if (!selectedId) return;
        try {
            await updateGTMContext(selectedId, {
                icp_name: s.icp_name,
                icp_statement: s.icp_statement,
                icp_priority: s.icp_priority,
                firmographic_range: s.firmographic_range || {},
                icp_rationale: s.icp_rationale,
                list_sourcing_guidance: s.list_sourcing_guidance,
            });
            await selectContext(selectedId);
        } catch {
            // non-blocking
        }
    };

    const handleGenerateSourcingGuide = async () => {
        if (!selectedId) {
            toast.error('Create a context first');
            return;
        }
        try {
            const { data } = await generateSourcingGuide(selectedId);
            setListSourcingGuidance(data.sourcing_guide || '');
            toast.success('Sourcing guide updated');
            await selectContext(selectedId);
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Failed to generate sourcing guide'));
        }
    };

    const stats = useMemo(() => {
        if (!detail) return null;
        return [
            { label: 'Personas', value: detail.personas?.length || 0, icon: Brain, color: 'from-cyan-500 to-teal-500' },
            { label: 'Triggers', value: detail.triggers?.length || 0, icon: AlertTriangle, color: 'from-amber-500 to-orange-500' },
            { label: 'Signals', value: detail.signal_definitions?.length || 0, icon: Compass, color: 'from-cyan-500 to-blue-500' },
            { label: 'Plays', value: detail.plays?.length || 0, icon: Workflow, color: 'from-emerald-500 to-teal-500' },
        ];
    }, [detail]);

    return (
        <div className="h-full overflow-y-auto" id="gtm-intelligence">
            <div className="max-w-6xl mx-auto p-8 pb-24 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                            <Target className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="text-xs uppercase text-slate-500 font-semibold tracking-wider">GTM Intelligence</p>
                            <h1 className="text-xl font-bold text-white tracking-tight">Strategy, personas, triggers, plays</h1>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleRefine}
                            disabled={!selectedId || refining}
                            className="px-4 py-2 rounded-xl bg-[#0A0F1E] border border-slate-800 text-slate-200 hover:border-cyan-500/40 flex items-center gap-2 text-sm disabled:opacity-40"
                        >
                            {refining ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-cyan-400" />}
                            Refine from Enrichment
                        </button>
                        <button
                            onClick={handleGenerate}
                            disabled={!selectedId || generating}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-semibold flex items-center gap-2 text-sm shadow-lg shadow-cyan-500/15 disabled:opacity-40"
                        >
                            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Generate Strategy
                        </button>
                    </div>
                </div>

                {/* Layout: left contexts, right detail */}
                <div className="grid grid-cols-12 gap-6">
                    {/* Context list + creation */}
                    <div className="col-span-4 space-y-4">
                        <div className="bg-[#0F162B] border border-slate-800/70 rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <ListTree className="w-4 h-4 text-slate-400" />
                                <p className="text-sm font-semibold text-white">Contexts</p>
                                <span className="text-xs text-slate-500">{contexts.length}</span>
                            </div>
                            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                                {contexts.map(ctx => (
                                    <button
                                        key={ctx.id}
                                        onClick={() => selectContext(ctx.id)}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                                            selectedId === ctx.id
                                                ? 'border-cyan-500/40 bg-cyan-500/10 text-white'
                                                : 'border-slate-800 bg-[#0A0F1E] text-slate-300 hover:border-slate-700'
                                        }`}
                                    >
                                        <p className="text-sm font-semibold truncate">{ctx.name}</p>
                                        <p className="text-xs text-slate-500 truncate">{ctx.product_description || 'No description'}</p>
                                        <div className="mt-1 flex gap-1 text-[11px] text-slate-500">
                                            <Chip text={`${ctx.persona_count} personas`} color="bg-slate-800 text-slate-300" />
                                            <Chip text={`${ctx.trigger_count} triggers`} color="bg-slate-800 text-slate-300" />
                                            <Chip text={`${ctx.play_count} plays`} color="bg-slate-800 text-slate-300" />
                                        </div>
                                    </button>
                                ))}
                                {contexts.length === 0 && !loading && (
                                    <p className="text-xs text-slate-500">No GTM contexts yet</p>
                                )}
                            </div>
                        </div>

                        <div className="bg-[#0F162B] border border-slate-800/70 rounded-2xl p-4 space-y-3">
                            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <FlaskRound className="w-4 h-4 text-cyan-300" />
                                    <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Test This Module</p>
                                </div>
                                <p className="text-xs text-slate-300 leading-5">
                                    Use `Load Demo Input`, create the context, then hit `Generate Strategy`. That gives you a real persisted thesis with personas, triggers, signals, and plays to inspect.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Plus className="w-4 h-4 text-emerald-400" />
                                <p className="text-sm font-semibold text-white">New Context</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => handleLoadDemo()}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 text-xs font-semibold border border-emerald-500/20 hover:bg-emerald-500/20"
                                >
                                    Load Demo Input
                                </button>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 text-xs font-semibold border border-cyan-500/20 hover:bg-cyan-500/20"
                                >
                                    Parse Context Files
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.docx,.pptx,.txt"
                                    className="hidden"
                                    multiple
                                    onChange={(e) => handleParseFiles(e.target.files)}
                                />
                            </div>
                            <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Company name" value={companyName} onChange={e => setCompanyName(e.target.value)} />
                            <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Website URL" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} />
                            <textarea className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all min-h-[56px]" placeholder="Core problem solved" value={coreProblem} onChange={e => setCoreProblem(e.target.value)} />
                            <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Product category" value={productCategory} onChange={e => setProductCategory(e.target.value)} />
                            <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
                            <textarea className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all min-h-[72px]" placeholder="Product description" value={product} onChange={e => setProduct(e.target.value)} />
                            <textarea className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all min-h-[56px]" placeholder="Value prop" value={valueProp} onChange={e => setValueProp(e.target.value)} />
                            <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Target industries (comma separated)" value={targets} onChange={e => setTargets(e.target.value)} />
                            <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Customer examples (comma separated)" value={examples} onChange={e => setExamples(e.target.value)} />
                            <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Competitors / alternatives (comma separated)" value={competitors} onChange={e => setCompetitors(e.target.value)} />
                            <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Geographic focus (e.g. US, UK, DACH)" value={geoFocus} onChange={e => setGeoFocus(e.target.value)} />
                            <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Avg deal size (e.g. $25k-$80k ARR)" value={dealSize} onChange={e => setDealSize(e.target.value)} />
                            <div className="grid grid-cols-2 gap-2">
                                <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Sales cycle days" value={salesCycle} onChange={e => setSalesCycle(e.target.value)} />
                                <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Pricing model" value={pricingModel} onChange={e => setPricingModel(e.target.value)} />
                            </div>
                            <textarea className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all min-h-[56px]" placeholder="Decision process" value={decisionProcess} onChange={e => setDecisionProcess(e.target.value)} />
                            <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Key integrations (comma separated)" value={integrations} onChange={e => setIntegrations(e.target.value)} />
                            <textarea className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all min-h-[56px]" placeholder="Why customers buy" value={whyBuy} onChange={e => setWhyBuy(e.target.value)} />
                            <textarea className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all min-h-[56px]" placeholder="Why customers churn" value={whyChurn} onChange={e => setWhyChurn(e.target.value)} />
                            <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Common objections (comma separated)" value={objections} onChange={e => setObjections(e.target.value)} />
                            <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Market maturity" value={marketMaturity} onChange={e => setMarketMaturity(e.target.value)} />
                            <textarea className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all min-h-[56px]" placeholder="Context notes (from files)" value={contextNotes} onChange={e => setContextNotes(e.target.value)} />

                            <div className="pt-2 border-t border-slate-800/60 space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs uppercase text-slate-500 font-semibold tracking-wider">ICP Builder</p>
                                    <button
                                        onClick={handleGenerateICPSuggestions}
                                        className="text-xs text-cyan-300 hover:text-cyan-200"
                                    >
                                        Generate ICP Suggestions
                                    </button>
                                </div>
                                <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="ICP name" value={icpName} onChange={e => setIcpName(e.target.value)} />
                                <textarea className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all min-h-[56px]" placeholder="ICP statement" value={icpStatement} onChange={e => setIcpStatement(e.target.value)} />
                                <div className="grid grid-cols-2 gap-2">
                                    <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Employee range" value={firmoEmployees} onChange={e => setFirmoEmployees(e.target.value)} />
                                    <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Revenue range" value={firmoRevenue} onChange={e => setFirmoRevenue(e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Business model" value={firmoBusinessModel} onChange={e => setFirmoBusinessModel(e.target.value)} />
                                    <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Geography" value={firmoGeography} onChange={e => setFirmoGeography(e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all" placeholder="Priority (Primary/Secondary/Experimental)" value={icpPriority} onChange={e => setIcpPriority(e.target.value)} />
                                    <button
                                        onClick={handleGenerateSourcingGuide}
                                        className="px-3 py-2 rounded-xl bg-[#0A0F1E] border border-slate-700/60 text-slate-300 text-xs font-semibold hover:border-slate-600"
                                    >
                                        Generate Sourcing Guide
                                    </button>
                                </div>
                                <textarea className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all min-h-[56px]" placeholder="ICP rationale" value={icpRationale} onChange={e => setIcpRationale(e.target.value)} />
                                <textarea className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all min-h-[56px]" placeholder="List sourcing guidance" value={listSourcingGuidance} onChange={e => setListSourcingGuidance(e.target.value)} />

                                {icpSuggestions.length > 0 && (
                                    <div className="space-y-2 pt-2">
                                        {icpSuggestions.map((s, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => applyIcpSuggestion(s)}
                                                className="w-full text-left px-3 py-2 rounded-xl border border-slate-800 bg-[#0A0F1E] hover:border-cyan-500/40"
                                            >
                                                <p className="text-sm font-semibold text-white">{s.icp_name || `Suggestion ${idx + 1}`}</p>
                                                <p className="text-xs text-slate-400">{s.icp_statement}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={handleCreate}
                                disabled={creating}
                                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/15 disabled:opacity-50"
                            >
                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                Create Context
                            </button>
                        </div>
                    </div>

                    {/* Detail */}
                    <div className="col-span-8">
                        {loading && !detail && (
                            <div className="h-48 flex items-center justify-center">
                                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                            </div>
                        )}

                        {detail && (
                            <div className="space-y-5">
                                {/* Top summary & tabs */}
                                <div className="bg-[#0F162B] border border-slate-800/70 rounded-2xl p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Current Thesis</p>
                                            <h2 className="text-lg font-bold text-white">{detail.name}</h2>
                                            <p className="text-sm text-slate-400 leading-relaxed">{detail.product_description || 'No product description'}</p>
                                            <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
                                                {detail.target_industries?.map(ind => <Chip key={ind} text={ind} color="bg-slate-800 text-slate-200" />)}
                                                {detail.pricing_model && <Chip text={detail.pricing_model} color="bg-slate-800 text-slate-200" />}
                                                {detail.avg_deal_size && <Chip text={detail.avg_deal_size} color="bg-slate-800 text-slate-200" />}
                                                {typeof detail.context_quality_score === 'number' && <Chip text={`Context Quality ${detail.context_quality_score}%`} color="bg-emerald-500/15 text-emerald-200" />}
                                            </div>
                                        </div>
                                        {stats && (
                                            <div className="grid grid-cols-2 gap-3">
                                                {stats.map(s => (
                                                    <div key={s.label} className="p-3 rounded-xl bg-gradient-to-br from-white/5 to-white/0 border border-slate-800/60">
                                                        <div className="flex items-center gap-2 text-slate-200">
                                                            <s.icon className="w-4 h-4 text-slate-400" />
                                                            <span className="text-xs">{s.label}</span>
                                                        </div>
                                                        <p className="text-xl font-bold text-white">{s.value}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {tabButton('overview', 'Overview')}
                                        {tabButton('icps', 'ICPs')}
                                        {tabButton('personas', 'Personas')}
                                        {tabButton('assets', 'Assets')}
                                        {tabButton('triggers', 'Triggers')}
                                        {tabButton('signals', 'Signals')}
                                        {tabButton('plays', 'Plays')}
                                        {tabButton('enrichment', 'Enrichment')}
                                    </div>
                                </div>

                                <div className="bg-[#0F162B] border border-slate-800/70 rounded-2xl p-5">
                                    {tab === 'overview' && <Overview detail={detail} />}
                                    {tab === 'icps' && (
                                        <ICPsPanel
                                            missionId={selectedId!}
                                            icps={missionICPs}
                                            loading={icpsLoading}
                                            onReload={async () => {
                                                if (!selectedId) return;
                                                setIcpsLoading(true);
                                                try { const { data } = await listMissionICPs(selectedId); setMissionICPs(data.icps || []); } catch { /* ignore */ } finally { setIcpsLoading(false); }
                                            }}
                                            onDelete={async (id) => {
                                                if (!selectedId) return;
                                                await deleteMissionICP(selectedId, id);
                                                setMissionICPs((prev) => prev.filter((icp) => icp.id !== id));
                                                toast.success('ICP deleted');
                                            }}
                                        />
                                    )}
                                    {tab === 'personas' && <Personas personas={detail.personas || []} missionId={selectedId || ''} onReload={() => { if (selectedId) void selectContext(selectedId); }} />}
                                    {tab === 'assets' && (
                                        <AssetsPanel
                                            assets={assets}
                                            loading={assetsLoading}
                                            onReload={async () => {
                                                setAssetsLoading(true);
                                                try { const { data } = await listAssets(); setAssets(data.assets || []); } catch { /* ignore */ } finally { setAssetsLoading(false); }
                                            }}
                                            onDelete={async (id) => {
                                                await deleteAsset(id);
                                                setAssets((prev) => prev.filter((a) => a.id !== id));
                                                toast.success('Asset deleted');
                                            }}
                                        />
                                    )}
                                    {tab === 'triggers' && <Triggers triggers={detail.triggers || []} missionId={selectedId || ''} onReload={() => { if (selectedId) void selectContext(selectedId); }} />}
                                    {tab === 'signals' && <Signals signals={detail.signal_definitions || []} missionId={selectedId || ''} onReload={() => { if (selectedId) void selectContext(selectedId); }} />}
                                    {tab === 'plays' && <Plays plays={detail.plays || []} missionId={selectedId || ''} onReload={() => { if (selectedId) void selectContext(selectedId); }} />}
                                    {tab === 'enrichment' && <Enrichment patterns={detail.enrichment_patterns} />}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    function tabButton(key: TabKey, label: string) {
        const active = tab === key;
        return (
            <button
                onClick={() => {
                    setTab(key);
                    if (key === 'icps' && selectedId && missionICPs.length === 0) {
                        setIcpsLoading(true);
                        listMissionICPs(selectedId).then(({ data }) => setMissionICPs(data.icps || [])).catch(() => {}).finally(() => setIcpsLoading(false));
                    }
                    if (key === 'assets' && assets.length === 0) {
                        setAssetsLoading(true);
                        listAssets().then(({ data }) => setAssets(data.assets || [])).catch(() => {}).finally(() => setAssetsLoading(false));
                    }
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    active ? 'bg-cyan-500/15 text-white border border-cyan-500/30' : 'text-slate-400 hover:text-white'
                }`}
            >
                {label}
            </button>
        );
    }
}

// ── ICP Panel ────────────────────────────────────────────────────────────────

interface ICPFormState {
    name: string;
    icp_statement: string;
    icp_priority: string;
    icp_rationale: string;
    list_sourcing_guidance: string;
    employee_range: string;
    revenue_range: string;
    business_model: string;
    geography: string;
    use_cases: string;
}

const BLANK_ICP_FORM: ICPFormState = {
    name: '', icp_statement: '', icp_priority: 'Primary', icp_rationale: '',
    list_sourcing_guidance: '', employee_range: '', revenue_range: '',
    business_model: '', geography: '', use_cases: '',
};

function ICPsPanel({
    missionId, icps, loading, onReload, onDelete,
}: {
    missionId: string;
    icps: ICP[];
    loading: boolean;
    onReload: () => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}) {
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<ICPFormState>(BLANK_ICP_FORM);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<ICPFormState>(BLANK_ICP_FORM);
    const [duplicating, setDuplicating] = useState<string | null>(null);

    const formToPayload = (f: ICPFormState) => ({
        name: f.name,
        icp_statement: f.icp_statement,
        icp_priority: f.icp_priority,
        icp_rationale: f.icp_rationale,
        list_sourcing_guidance: f.list_sourcing_guidance,
        firmographic_range: {
            employee_range: f.employee_range,
            revenue_range: f.revenue_range,
            business_model: f.business_model,
            geography: f.geography,
        },
        use_cases: f.use_cases ? f.use_cases.split(',').map((s) => s.trim()).filter(Boolean) : [],
    });

    const icpToForm = (icp: ICP): ICPFormState => ({
        name: icp.name,
        icp_statement: icp.icp_statement || '',
        icp_priority: icp.icp_priority || 'Primary',
        icp_rationale: icp.icp_rationale || '',
        list_sourcing_guidance: icp.list_sourcing_guidance || '',
        employee_range: (icp.firmographic_range?.employee_range as string) || '',
        revenue_range: (icp.firmographic_range?.revenue_range as string) || '',
        business_model: (icp.firmographic_range?.business_model as string) || '',
        geography: (icp.firmographic_range?.geography as string) || (icp.geography || ''),
        use_cases: (icp.use_cases || []).join(', '),
    });

    const handleCreate = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            await createMissionICP(missionId, formToPayload(form));
            setForm(BLANK_ICP_FORM);
            setShowForm(false);
            await onReload();
            toast.success('ICP created');
        } catch { toast.error('Failed to create ICP'); } finally { setSaving(false); }
    };

    const handleUpdate = async () => {
        if (!editingId || !editForm.name.trim()) return;
        setSaving(true);
        try {
            await updateMissionICP(missionId, editingId, formToPayload(editForm));
            setEditingId(null);
            await onReload();
            toast.success('ICP updated');
        } catch { toast.error('Failed to update ICP'); } finally { setSaving(false); }
    };

    const handleDuplicate = async (icp: ICP) => {
        setDuplicating(icp.id);
        try {
            await duplicateMissionICP(missionId, icp.id);
            await onReload();
            toast.success('ICP duplicated');
        } catch { toast.error('Failed to duplicate ICP'); } finally { setDuplicating(null); }
    };

    const PriorityBadge = ({ p }: { p: string }) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            p === 'Primary' ? 'bg-emerald-500/15 text-emerald-400' :
            p === 'Secondary' ? 'bg-amber-500/15 text-amber-400' :
            'bg-slate-500/15 text-slate-400'
        }`}>{p}</span>
    );

    const ICPFormFields = ({ f, setF }: { f: ICPFormState; setF: (v: ICPFormState) => void }) => (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-[10px] uppercase text-slate-500 font-semibold mb-1">Name *</label>
                    <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Series B SaaS VP Sales" className="w-full rounded-xl bg-[#0A0F1E] border border-slate-700/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40" />
                </div>
                <div>
                    <label className="block text-[10px] uppercase text-slate-500 font-semibold mb-1">Priority</label>
                    <select value={f.icp_priority} onChange={(e) => setF({ ...f, icp_priority: e.target.value })} className="w-full rounded-xl bg-[#0A0F1E] border border-slate-700/60 px-3 py-2 text-sm text-white outline-none">
                        <option>Primary</option><option>Secondary</option><option>Experimental</option>
                    </select>
                </div>
            </div>
            <div>
                <label className="block text-[10px] uppercase text-slate-500 font-semibold mb-1">ICP Statement</label>
                <textarea value={f.icp_statement} onChange={(e) => setF({ ...f, icp_statement: e.target.value })} placeholder="Precise one-line definition of who you target…" rows={2} className="w-full rounded-xl bg-[#0A0F1E] border border-slate-700/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40 resize-none" />
            </div>
            <p className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">Firmographics</p>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Employee Range</label>
                    <input value={f.employee_range} onChange={(e) => setF({ ...f, employee_range: e.target.value })} placeholder="e.g. 50–500" className="w-full rounded-xl bg-[#0A0F1E] border border-slate-700/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40" />
                </div>
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Revenue Range</label>
                    <input value={f.revenue_range} onChange={(e) => setF({ ...f, revenue_range: e.target.value })} placeholder="e.g. $5M–$50M ARR" className="w-full rounded-xl bg-[#0A0F1E] border border-slate-700/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40" />
                </div>
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Business Model</label>
                    <input value={f.business_model} onChange={(e) => setF({ ...f, business_model: e.target.value })} placeholder="e.g. B2B SaaS" className="w-full rounded-xl bg-[#0A0F1E] border border-slate-700/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40" />
                </div>
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Geography</label>
                    <input value={f.geography} onChange={(e) => setF({ ...f, geography: e.target.value })} placeholder="e.g. US, Canada" className="w-full rounded-xl bg-[#0A0F1E] border border-slate-700/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40" />
                </div>
            </div>
            <div>
                <label className="block text-[10px] uppercase text-slate-500 font-semibold mb-1">Use Cases <span className="normal-case font-normal">(comma-separated)</span></label>
                <input value={f.use_cases} onChange={(e) => setF({ ...f, use_cases: e.target.value })} placeholder="e.g. Outbound automation, Account research" className="w-full rounded-xl bg-[#0A0F1E] border border-slate-700/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40" />
            </div>
            <div>
                <label className="block text-[10px] uppercase text-slate-500 font-semibold mb-1">Rationale</label>
                <textarea value={f.icp_rationale} onChange={(e) => setF({ ...f, icp_rationale: e.target.value })} placeholder="Why this segment? What makes them ideal buyers…" rows={2} className="w-full rounded-xl bg-[#0A0F1E] border border-slate-700/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40 resize-none" />
            </div>
            <div>
                <label className="block text-[10px] uppercase text-slate-500 font-semibold mb-1">List Sourcing Guidance</label>
                <textarea value={f.list_sourcing_guidance} onChange={(e) => setF({ ...f, list_sourcing_guidance: e.target.value })} placeholder="Apollo filters, LinkedIn boolean, Clay enrichment logic…" rows={2} className="w-full rounded-xl bg-[#0A0F1E] border border-slate-700/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40 resize-none" />
            </div>
        </div>
    );

    if (loading) return <div className="py-8 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">ICPs ({icps.length})</p>
                <button onClick={() => { setShowForm((v) => !v); setEditingId(null); }} className="rounded-xl bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20">
                    {showForm ? 'Cancel' : '+ New ICP'}
                </button>
            </div>

            {showForm && (
                <div className="rounded-2xl border border-cyan-500/20 bg-[#10172B] p-4 space-y-3">
                    <p className="text-xs font-semibold text-cyan-300">New ICP</p>
                    <ICPFormFields f={form} setF={setForm} />
                    <div className="flex gap-2 pt-1">
                        <button onClick={() => void handleCreate()} disabled={saving || !form.name.trim()} className="rounded-xl bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50">{saving ? '…' : 'Create'}</button>
                        <button onClick={() => { setShowForm(false); setForm(BLANK_ICP_FORM); }} className="rounded-xl border border-slate-800/60 px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                    </div>
                </div>
            )}

            {icps.length === 0 ? (
                <div className="rounded-2xl border border-slate-800/60 bg-[#10172B] p-8 text-center text-slate-500">No ICPs yet. Create one or generate strategy to auto-populate.</div>
            ) : (
                <div className="space-y-3">
                    {icps.map((icp) => (
                        <div key={icp.id} className="rounded-2xl border border-slate-800/60 bg-[#10172B] p-4">
                            {editingId === icp.id ? (
                                <div className="space-y-3">
                                    <p className="text-xs font-semibold text-cyan-300">Editing: {icp.name}</p>
                                    <ICPFormFields f={editForm} setF={setEditForm} />
                                    <div className="flex gap-2 pt-1">
                                        <button onClick={() => void handleUpdate()} disabled={saving || !editForm.name.trim()} className="rounded-xl bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50">{saving ? '…' : 'Save'}</button>
                                        <button onClick={() => setEditingId(null)} className="rounded-xl border border-slate-800/60 px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className="font-semibold text-white text-sm">{icp.name}</span>
                                            <PriorityBadge p={icp.icp_priority} />
                                        </div>
                                        {icp.icp_statement && <p className="text-xs text-slate-400 mb-2">{icp.icp_statement}</p>}
                                        {(icp.firmographic_range && Object.keys(icp.firmographic_range).length > 0) && (
                                            <div className="flex flex-wrap gap-2 mb-2">
                                                {Object.entries(icp.firmographic_range).map(([k, v]) => v ? (
                                                    <span key={k} className="rounded-full bg-slate-800/80 border border-slate-700/40 px-2 py-0.5 text-[10px] text-slate-300">
                                                        {k.replace(/_/g, ' ')}: {String(v)}
                                                    </span>
                                                ) : null)}
                                            </div>
                                        )}
                                        {(icp.use_cases || []).length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {(icp.use_cases || []).map((uc) => (
                                                    <span key={uc} className="rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] text-cyan-300">{uc}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => { setEditingId(icp.id); setEditForm(icpToForm(icp)); setShowForm(false); }}
                                            className="rounded-lg p-1.5 text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors text-xs"
                                            title="Edit"
                                        >✎</button>
                                        <button
                                            onClick={() => void handleDuplicate(icp)}
                                            disabled={duplicating === icp.id}
                                            className="rounded-lg p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors text-xs disabled:opacity-50"
                                            title="Duplicate"
                                        >{duplicating === icp.id ? '…' : '⧉'}</button>
                                        <button
                                            onClick={() => void onDelete(icp.id)}
                                            className="rounded-lg p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs"
                                            title="Delete"
                                        >✕</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Assets Panel ─────────────────────────────────────────────────────────────

function AssetsPanel({
    assets, loading, onReload, onDelete,
}: {
    assets: SocialProofAsset[];
    loading: boolean;
    onReload: () => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}) {
    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState('');
    const [type, setType] = useState('case_study');
    const [content, setContent] = useState('');
    const [saving, setSaving] = useState(false);

    const handleCreate = async () => {
        if (!title.trim() || !content.trim()) return;
        setSaving(true);
        try {
            await createAsset({ title, type, content });
            setTitle(''); setContent(''); setShowForm(false);
            await onReload();
            toast.success('Asset created');
        } catch { toast.error('Failed to create asset'); } finally { setSaving(false); }
    };

    const typeBadge = (t: string) => {
        if (t === 'case_study') return 'bg-cyan-500/15 text-cyan-400';
        if (t === 'testimonial') return 'bg-emerald-500/15 text-emerald-400';
        return 'bg-amber-500/15 text-amber-400';
    };

    if (loading) return <div className="py-8 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Social Proof Assets ({assets.length})</p>
                <button onClick={() => setShowForm((v) => !v)} className="rounded-xl bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20">+ New Asset</button>
            </div>
            {showForm && (
                <div className="rounded-2xl border border-slate-800/60 bg-[#10172B] p-4 space-y-3">
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Asset title" className="w-full rounded-xl bg-[#0A0F1E] border border-slate-700/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40" />
                    <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl bg-[#0A0F1E] border border-slate-700/60 px-3 py-2 text-sm text-white outline-none">
                        <option value="case_study">Case Study</option><option value="testimonial">Testimonial</option><option value="metric">Metric</option>
                    </select>
                    <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content…" rows={3} className="w-full rounded-xl bg-[#0A0F1E] border border-slate-700/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40 resize-none" />
                    <div className="flex gap-2">
                        <button onClick={() => void handleCreate()} disabled={saving || !title.trim() || !content.trim()} className="rounded-xl bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50">{saving ? '…' : 'Create'}</button>
                        <button onClick={() => setShowForm(false)} className="rounded-xl border border-slate-800/60 px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                    </div>
                </div>
            )}
            {assets.length === 0 ? (
                <div className="rounded-2xl border border-slate-800/60 bg-[#10172B] p-8 text-center text-slate-500">No assets yet. Add case studies, testimonials, and metrics.</div>
            ) : (
                <div className="space-y-3">
                    {assets.map((asset) => (
                        <div key={asset.id} className="rounded-2xl border border-slate-800/60 bg-[#10172B] p-4 flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-white text-sm">{asset.title}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${typeBadge(asset.type)}`}>{asset.type.replace('_', ' ')}</span>
                                </div>
                                <p className="text-xs text-slate-400 line-clamp-2">{asset.content}</p>
                            </div>
                            <button onClick={() => void onDelete(asset.id)} className="text-slate-600 hover:text-red-400 text-xs transition-colors shrink-0">✕</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Helpers
const parseList = (val: string) =>
    val.split(',').map(v => v.trim()).filter(Boolean);
