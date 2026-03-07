"use client";

import { useState, useRef, useEffect } from 'react';
import { Target, Sparkles, Loader2, ShieldCheck, AlertTriangle, CheckCircle2, ChevronDown, Plus, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { generateICPSync, listICPs, deleteICP, type ICPDefinition } from '../services/api';

interface Props {
    onICPGenerated?: (icpId: string) => void;
}

const PASS_LABELS = [
    { title: 'Drafting ICP', subtitle: 'Analyzing your product and customers...', icon: Sparkles, color: 'text-violet-400' },
    { title: 'Red-Teaming', subtitle: 'Finding false positives and blind spots...', icon: AlertTriangle, color: 'text-amber-400' },
    { title: 'Building Rubric', subtitle: 'Generating scoring criteria...', icon: ShieldCheck, color: 'text-emerald-400' },
];

export function ICPBuilder({ onICPGenerated }: Props) {
    const [productDesc, setProductDesc] = useState('');
    const [customerExamples, setCustomerExamples] = useState(['']);
    const [icpName, setIcpName] = useState('');
    const [generating, setGenerating] = useState(false);
    const [currentPass, setCurrentPass] = useState(-1);
    const [result, setResult] = useState<any>(null);
    const [savedICPs, setSavedICPs] = useState<any[]>([]);
    const [showSaved, setShowSaved] = useState(false);

    useEffect(() => {
        loadICPs();
    }, []);

    const loadICPs = async () => {
        try {
            const { data } = await listICPs();
            setSavedICPs(data.icps || []);
        } catch { }
    };

    const addExample = () => setCustomerExamples(prev => [...prev, '']);
    const removeExample = (idx: number) => setCustomerExamples(prev => prev.filter((_, i) => i !== idx));
    const updateExample = (idx: number, val: string) => {
        const updated = [...customerExamples];
        updated[idx] = val;
        setCustomerExamples(updated);
    };

    const handleGenerate = async () => {
        if (!productDesc.trim()) {
            toast.error('Enter a product description');
            return;
        }
        const validExamples = customerExamples.filter(e => e.trim());
        if (validExamples.length === 0) {
            toast.error('Add at least one customer example');
            return;
        }

        setGenerating(true);
        setCurrentPass(0);
        setResult(null);

        // Simulate pass progression
        const passTimer = setInterval(() => {
            setCurrentPass(prev => (prev < 2 ? prev + 1 : prev));
        }, 6000);

        try {
            const { data } = await generateICPSync({
                name: icpName || 'Default ICP',
                product_description: productDesc,
                customer_examples: validExamples,
            });

            clearInterval(passTimer);
            setCurrentPass(3); // complete
            setResult(data);
            toast.success('ICP generated successfully');
            if (data.icp_id && onICPGenerated) {
                onICPGenerated(data.icp_id);
            }
            loadICPs();
        } catch (err: any) {
            clearInterval(passTimer);
            toast.error(`Generation failed: ${err.response?.data?.detail || err.message}`);
        } finally {
            setGenerating(false);
        }
    };

    const handleDeleteICP = async (id: string) => {
        try {
            await deleteICP(id);
            toast.success('ICP deleted');
            loadICPs();
        } catch {
            toast.error('Failed to delete');
        }
    };

    return (
        <div className="h-full overflow-y-auto" id="icp-builder">
            <div className="max-w-3xl mx-auto p-8 pb-24">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                            <Target className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight">GTM Context Builder</h1>
                            <p className="text-sm text-slate-400">Define your Ideal Customer Profile with Constitutional AI</p>
                        </div>
                    </div>
                </div>

                {/* Saved ICPs */}
                {savedICPs.length > 0 && (
                    <div className="mb-8">
                        <button
                            onClick={() => setShowSaved(!showSaved)}
                            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-3"
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform ${showSaved ? 'rotate-0' : '-rotate-90'}`} />
                            Saved ICPs ({savedICPs.length})
                        </button>
                        {showSaved && (
                            <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                                {savedICPs.map(icp => (
                                    <div key={icp.id} className="flex items-center justify-between bg-[#131A2E] border border-slate-800/60 rounded-xl px-4 py-3 group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                                                <Target className="w-4 h-4 text-violet-400" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-white">{icp.name}</p>
                                                <p className="text-xs text-slate-500">{icp.rubric?.criteria?.length || 0} criteria • Created {new Date(icp.created_at).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => { onICPGenerated?.(icp.id); toast.success(`Selected: ${icp.name}`); }}
                                                className="px-3 py-1.5 bg-violet-500/10 text-violet-400 rounded-lg text-xs font-semibold hover:bg-violet-500/20 transition-colors"
                                            >
                                                Use
                                            </button>
                                            <button
                                                onClick={() => handleDeleteICP(icp.id)}
                                                className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Form */}
                <div className="space-y-6">
                    {/* ICP Name */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ICP Name</label>
                        <input
                            type="text"
                            value={icpName}
                            onChange={e => setIcpName(e.target.value)}
                            placeholder="e.g. Series A B2B SaaS"
                            className="w-full bg-[#131A2E] border border-slate-800/60 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 outline-none transition-all"
                        />
                    </div>

                    {/* Product Description */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Your Product</label>
                        <textarea
                            value={productDesc}
                            onChange={e => setProductDesc(e.target.value)}
                            placeholder="Describe your product, who it's for, and what problem it solves..."
                            rows={4}
                            className="w-full bg-[#131A2E] border border-slate-800/60 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 outline-none transition-all resize-none"
                        />
                    </div>

                    {/* Customer Examples */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Best Customer Examples</label>
                        <div className="space-y-2">
                            {customerExamples.map((ex, idx) => (
                                <div key={idx} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={ex}
                                        onChange={e => updateExample(idx, e.target.value)}
                                        placeholder={`e.g. stripe.com, notion.so`}
                                        className="flex-1 bg-[#131A2E] border border-slate-800/60 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 outline-none transition-all"
                                    />
                                    {customerExamples.length > 1 && (
                                        <button onClick={() => removeExample(idx)} className="px-3 text-slate-500 hover:text-red-400 transition-colors">
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={addExample}
                            className="mt-2 flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-semibold transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" /> Add another
                        </button>
                    </div>

                    {/* Generate button */}
                    <button
                        onClick={handleGenerate}
                        disabled={generating || !productDesc.trim()}
                        className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/15 hover:shadow-violet-500/30 flex items-center justify-center gap-2"
                    >
                        {generating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                Generate ICP (3-Pass Constitutional AI)
                            </>
                        )}
                    </button>
                </div>

                {/* ── Pass Progress ──────────────────────────────── */}
                {generating && currentPass >= 0 && (
                    <div className="mt-8 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {PASS_LABELS.map((pass, idx) => (
                            <div
                                key={idx}
                                className={`flex items-center gap-4 bg-[#131A2E] border rounded-xl px-5 py-4 transition-all duration-500 ${idx === currentPass
                                        ? 'border-violet-500/30 shadow-lg shadow-violet-500/5'
                                        : idx < currentPass
                                            ? 'border-emerald-500/20 opacity-70'
                                            : 'border-slate-800/40 opacity-30'
                                    }`}
                            >
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${idx < currentPass ? 'bg-emerald-500/10' : idx === currentPass ? 'bg-violet-500/10' : 'bg-slate-800/30'
                                    }`}>
                                    {idx < currentPass ? (
                                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                    ) : idx === currentPass ? (
                                        <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                                    ) : (
                                        <pass.icon className="w-5 h-5 text-slate-600" />
                                    )}
                                </div>
                                <div>
                                    <p className={`text-sm font-semibold ${idx <= currentPass ? 'text-white' : 'text-slate-600'}`}>
                                        Pass {idx + 1}: {pass.title}
                                    </p>
                                    <p className={`text-xs ${idx === currentPass ? pass.color : 'text-slate-500'}`}>
                                        {pass.subtitle}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Result ─────────────────────────────────────── */}
                {result && (
                    <div className="mt-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
                        <div className="bg-[#131A2E] border border-emerald-500/20 rounded-2xl p-6 shadow-lg shadow-emerald-500/5">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white">ICP Generated</h3>
                                    <p className="text-xs text-slate-400">{result.rubric?.criteria?.length || 0} scoring criteria</p>
                                </div>
                            </div>

                            {/* Criteria table */}
                            {result.rubric?.criteria && (
                                <div className="space-y-2">
                                    {result.rubric.criteria.map((c: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between bg-[#0A0F1E] rounded-xl px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-slate-500 w-6">{idx + 1}.</span>
                                                <div>
                                                    <p className="text-sm font-medium text-white">{c.label || c.field_name}</p>
                                                    <p className="text-xs text-slate-500">{c.match_type}: {typeof c.match_value === 'object' ? JSON.stringify(c.match_value) : c.match_value}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-700"
                                                        style={{ width: `${(c.weight || 0) * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-slate-400 font-mono w-12 text-right">{((c.weight || 0) * 100).toFixed(0)}%</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
