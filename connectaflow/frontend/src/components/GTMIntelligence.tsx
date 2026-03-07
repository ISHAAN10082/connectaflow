"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Target, Brain, Sparkles, Workflow, RefreshCw, Loader2, Plus, ShieldCheck,
    Compass, AlertTriangle, ListTree, FlaskRound, MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import {
    listGTMContexts, createGTMContext, getGTMContext, updateGTMContext, generateGTMStrategy, refineFromEnrichment,
    parseGTMContextFiles, generateICPSuggestions, generateSourcingGuide,
    type GTMContextSummary, type GTMContextDetail, type PersonaData, type BuyingTriggerData,
    type SignalDefinitionData, type GTMPlayData, type ICPSuggestion
} from '../services/api';
import { getErrorMessage } from '../lib/errors';

type TabKey = 'overview' | 'personas' | 'triggers' | 'signals' | 'plays' | 'enrichment';

interface Props {
    onICPGenerated?: (id: string) => void;
}

const chip = (text: string, color: string) => (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>{text}</span>
);

export function GTMIntelligence({ onICPGenerated }: Props) {
    const [contexts, setContexts] = useState<GTMContextSummary[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<GTMContextDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [generating, setGenerating] = useState(false);
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
            toast.success('Strategy generated');
            await selectContext(selectedId);
            setTab('personas');
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
                                            {chip(`${ctx.persona_count} personas`, 'bg-slate-800 text-slate-300')}
                                            {chip(`${ctx.trigger_count} triggers`, 'bg-slate-800 text-slate-300')}
                                            {chip(`${ctx.play_count} plays`, 'bg-slate-800 text-slate-300')}
                                        </div>
                                    </button>
                                ))}
                                {contexts.length === 0 && !loading && (
                                    <p className="text-xs text-slate-500">No GTM contexts yet</p>
                                )}
                            </div>
                        </div>

                        <div className="bg-[#0F162B] border border-slate-800/70 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <Plus className="w-4 h-4 text-emerald-400" />
                                <p className="text-sm font-semibold text-white">New Context</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={handleLoadDemo}
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
                                                {detail.target_industries?.map(ind => chip(ind, 'bg-slate-800 text-slate-200'))}
                                                {detail.pricing_model && chip(detail.pricing_model, 'bg-slate-800 text-slate-200')}
                                                {detail.avg_deal_size && chip(detail.avg_deal_size, 'bg-slate-800 text-slate-200')}
                                                {typeof detail.context_quality_score === 'number' && chip(`Context Quality ${detail.context_quality_score}%`, 'bg-emerald-500/15 text-emerald-200')}
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
                                        {tabButton('personas', 'Personas')}
                                        {tabButton('triggers', 'Triggers')}
                                        {tabButton('signals', 'Signals')}
                                        {tabButton('plays', 'Plays')}
                                        {tabButton('enrichment', 'Enrichment')}
                                    </div>
                                </div>

                                <div className="bg-[#0F162B] border border-slate-800/70 rounded-2xl p-5">
                                    {tab === 'overview' && <Overview detail={detail} />}
                                    {tab === 'personas' && <Personas personas={detail.personas || []} />}
                                    {tab === 'triggers' && <Triggers triggers={detail.triggers || []} />}
                                    {tab === 'signals' && <Signals signals={detail.signal_definitions || []} />}
                                    {tab === 'plays' && <Plays plays={detail.plays || []} />}
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
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    active ? 'bg-cyan-500/15 text-white border border-cyan-500/30' : 'text-slate-400 hover:text-white'
                }`}
            >
                {label}
            </button>
        );
    }
}

// Helpers
const parseList = (val: string) =>
    val.split(',').map(v => v.trim()).filter(Boolean);

// Overview section
function Overview({ detail }: { detail: GTMContextDetail }) {
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
                {info.map(item => (
                    <div key={item.label} className="p-3 rounded-xl bg-[#0A0F1E] border border-slate-800/60">
                        <p className="text-[11px] uppercase text-slate-500 font-semibold tracking-wider">{item.label}</p>
                        <p className="text-sm text-white mt-1 leading-relaxed">{item.value || '—'}</p>
                    </div>
                ))}
            </div>
            <div className="bg-[#0A0F1E] border border-slate-800/60 rounded-xl p-4">
                <p className="text-xs uppercase text-slate-500 font-semibold mb-2">Customer Examples</p>
                <div className="flex flex-wrap gap-2 text-[12px] text-slate-200">
                    {detail.customer_examples?.length ? detail.customer_examples.map(c => chip(c, 'bg-slate-800 text-slate-200')) : '—'}
                </div>
            </div>
        </div>
    );
}

function Personas({ personas }: { personas: PersonaData[] }) {
    if (!personas.length) return <EmptyState text="No personas yet. Generate strategy to create them." />;
    return (
        <div className="grid md:grid-cols-2 gap-4">
            {personas.map(p => (
                <div key={p.id} className="p-4 rounded-xl bg-[#0A0F1E] border border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-white">{p.name}</p>
                            <p className="text-xs text-slate-500">{p.department} • {p.seniority}</p>
                        </div>
                        {chip(p.decision_role || 'Role', 'bg-cyan-500/15 text-cyan-200')}
                    </div>
                    <Field label="Titles" value={p.job_titles?.join(', ')} />
                    <Field label="KPIs" value={p.kpis?.join(', ')} />
                    <Field label="Pain Points" value={p.pain_points?.join('; ')} />
                    <Field label="Buying Style" value={p.buying_style} />
                    <Field label="Information Diet" value={p.information_diet?.join(', ')} />
                    <Field label="Objections" value={p.objections?.join('; ')} />
                    <Field label="Internal Politics" value={p.internal_politics} />
                    <Field label="Trigger Phrases" value={p.trigger_phrases?.join('; ')} />
                    <Field label="Day in Life" value={p.day_in_life} />
                    <Field label="Success Looks Like" value={p.success_looks_like} />
                    <Field label="Nightmare Scenario" value={p.nightmare_scenario} />
                    <Field label="Evaluation Criteria" value={p.evaluation_criteria?.join(', ')} />
                    <Field label="Messaging Do" value={p.messaging_do?.join('; ')} />
                    <Field label="Messaging Don’t" value={p.messaging_dont?.join('; ')} />
                </div>
            ))}
        </div>
    );
}

function Triggers({ triggers }: { triggers: BuyingTriggerData[] }) {
    if (!triggers.length) return <EmptyState text="No triggers yet." />;
    return (
        <div className="grid md:grid-cols-2 gap-4">
            {triggers.map(t => (
                <div key={t.id} className="p-4 rounded-xl bg-[#0A0F1E] border border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-white">{t.name}</p>
                            <p className="text-xs text-slate-500">{t.category || 'uncategorized'}</p>
                        </div>
                        {chip(t.urgency_level || 'timing', 'bg-amber-500/15 text-amber-200')}
                    </div>
                    <Field label="Description" value={t.description} />
                    <Field label="Why it matters" value={t.why_it_matters} />
                    <Field label="Ideal timing" value={t.ideal_timing} />
                    <Field label="Qualifying questions" value={t.qualifying_questions?.join('; ')} />
                </div>
            ))}
        </div>
    );
}

function Signals({ signals }: { signals: SignalDefinitionData[] }) {
    if (!signals.length) return <EmptyState text="No signal definitions yet." />;
    return (
        <div className="grid md:grid-cols-2 gap-4">
            {signals.map(s => (
                <div key={s.id} className="p-4 rounded-xl bg-[#0A0F1E] border border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-white">{s.name}</p>
                            <p className="text-xs text-slate-500">{s.source} • {s.detection_method}</p>
                        </div>
                        {chip(`Strength ${Math.round((s.strength_score || 0) * 100)}%`, 'bg-cyan-500/15 text-cyan-200')}
                    </div>
                    <Field label="Description" value={s.description} />
                    <Field label="Keywords" value={s.keywords?.join(', ')} />
                    <Field label="False positives" value={s.false_positive_notes} />
                    <Field label="Fields used" value={s.enrichment_fields_used?.join(', ')} />
                </div>
            ))}
        </div>
    );
}

function Plays({ plays }: { plays: GTMPlayData[] }) {
    if (!plays.length) return <EmptyState text="No plays yet." />;
    return (
        <div className="space-y-4">
            {plays.map(pl => (
                <div key={pl.id} className="p-4 rounded-xl bg-[#0A0F1E] border border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-white">{pl.name}</p>
                            <p className="text-xs text-slate-500">{pl.icp_statement}</p>
                        </div>
                        {chip(pl.status || 'draft', 'bg-emerald-500/15 text-emerald-200')}
                    </div>
                    <Field label="Trigger / Signal / Persona" value={[pl.trigger_id, pl.signal_id, pl.persona_id].filter(Boolean).join(' • ') || '—'} />
                    <Field label="Messaging angle" value={pl.messaging_angle} />
                    <Field label="Channel sequence" value={pl.channel_sequence?.join(' → ')} />
                    <Field label="Timing rationale" value={pl.timing_rationale} />
                    <Field label="Opening hook" value={pl.opening_hook} />
                    <Field label="Objection handling" value={formatObjections(pl.objection_handling)} />
                    <Field label="Competitive positioning" value={pl.competitive_positioning} />
                    <Field label="Success criteria" value={pl.success_criteria} />
                    <Field label="Email subject lines" value={pl.email_subject_lines?.join(' | ')} />
                    <Field label="Call talk track" value={pl.call_talk_track} />
                </div>
            ))}
        </div>
    );
}

function Enrichment({ patterns }: { patterns: Record<string, unknown> | null }) {
    if (!patterns) return <EmptyState text="No enrichment feedback yet. Run Refine from Enrichment." />;
    return (
        <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(patterns).map(([k, v]) => (
                <div key={k} className="p-4 rounded-xl bg-[#0A0F1E] border border-slate-800/60 space-y-2">
                    <div className="flex items-center gap-2 text-slate-300">
                        <FlaskRound className="w-4 h-4 text-cyan-300" />
                        <p className="text-sm font-semibold capitalize">{k.replace('_', ' ')}</p>
                    </div>
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{JSON.stringify(v, null, 2)}</pre>
                </div>
            ))}
        </div>
    );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
    return (
        <div>
            <p className="text-[11px] uppercase text-slate-500 font-semibold tracking-wider">{label}</p>
            <p className="text-sm text-white leading-relaxed">{value || '—'}</p>
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

function formatObjections(obj?: Record<string, string>) {
    if (!obj) return '—';
    return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(' | ');
}
