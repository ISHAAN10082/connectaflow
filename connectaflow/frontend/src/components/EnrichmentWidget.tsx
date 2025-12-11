"use client";

import { useState } from 'react';
import { Sparkles, Loader2, Link as LinkIcon, Building2, Tag, DollarSign, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import axios from 'axios';

export function EnrichmentWidget() {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState('');

    const handleEnrich = async () => {
        if (!url) return;
        setLoading(true);
        setError('');
        setResult(null);

        try {
            // Note: For now, we are calling a direct endpoint to test single url enrichment
            // In a real flow, this would trigger a job or update a lead
            // We need to add a temporary endpoint for "Test Enrichment" or use the existing structure
            // For MVP, let's assume we add a test endpoint or just log it
            // Actually, let's call the `extract_company_info` via a new test endpoint we'll create quickly or mock it
            // Pivot: Let's create a new lightweight endpoint in backend just for this widget test
            const response = await axios.post('http://localhost:8000/api/enrichment/test-enrich', { url });
            setResult(response.data);
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || 'Enrichment failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                <div className="flex items-center space-x-3 mb-6">
                    <div className="bg-indigo-100 p-2 rounded-lg">
                        <Sparkles className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Live Enrichment Test</h2>
                        <p className="text-sm text-slate-500">Test the Crawl4AI + Gemini pipeline on any URL</p>
                    </div>
                </div>

                <div className="flex gap-4 mb-8">
                    <div className="flex-1 relative">
                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="https://example.com"
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleEnrich()}
                        />
                    </div>
                    <button
                        onClick={handleEnrich}
                        disabled={loading || !url}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center disabled:opacity-50"
                    >
                        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Enrich Now
                    </button>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm mb-6">
                        {error}
                    </div>
                )}

                {result && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="col-span-full">
                            <h3 className="font-semibold text-slate-900 mb-2">Company Summary</h3>
                            <p className="text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100">
                                {result.summary}
                            </p>
                        </div>

                        <div>
                            <h3 className="flex items-center font-semibold text-slate-900 mb-3">
                                <DollarSign className="w-4 h-4 mr-2 text-green-500" />
                                Pricing Model
                            </h3>
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-slate-700 font-medium">
                                {result.pricing_model}
                            </div>
                        </div>

                        <div>
                            <h3 className="flex items-center font-semibold text-slate-900 mb-3">
                                <Users className="w-4 h-4 mr-2 text-blue-500" />
                                Competitors
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {result.competitors?.map((c: string) => (
                                    <span key={c} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
                                        {c}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="col-span-full">
                            <h3 className="flex items-center font-semibold text-slate-900 mb-3">
                                <Building2 className="w-4 h-4 mr-2 text-slate-500" />
                                Tech Stack
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {result.tech_stack?.map((c: string) => (
                                    <span key={c} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-sm border border-slate-200">
                                        {c}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
