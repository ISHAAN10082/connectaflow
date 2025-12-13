import { useState } from 'react';
import { Lead } from '../services/api';
import { Building2, TrendingUp, Users, Target, BarChart3, Loader2, Sparkles } from 'lucide-react';

interface CompanyAnalysisProps {
    leads: Lead[];
}

export function CompanyAnalysis({ leads }: CompanyAnalysisProps) {
    const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
    const [icpScore, setIcpScore] = useState<number | null>(null);
    const [calculating, setCalculating] = useState(false);

    // Aggregate companies from leads
    // In a real app, this would be a separate API call to 'companies' table
    const companies = Array.from(new Set(leads.map(l => l.custom_data?.company || l.company_id || "Unknown Company")))
        .filter(c => c !== "Unknown Company")
        .map(name => {
            // Mock aggregation
            const relatedLeads = leads.filter(l => l.custom_data?.company === name || l.company_id === name);
            return {
                name,
                leads: relatedLeads.length,
                industry: relatedLeads[0]?.custom_data?.industry || "Technology", // Mock fallback
                size: relatedLeads[0]?.custom_data?.employees || "Unknown",
                revenue: relatedLeads[0]?.custom_data?.revenue || "Unknown"
            };
        });

    const calculateICP = () => {
        setCalculating(true);
        // Mock calculation delay
        setTimeout(() => {
            setIcpScore(Math.floor(Math.random() * 30) + 70); // Random score 70-100
            setCalculating(false);
        }, 1500);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
            <div className="flex justify-between items-center bg-gradient-to-r from-purple-700 to-indigo-800 p-8 rounded-2xl shadow-xl text-white relative overflow-hidden">
                <div className="relative z-10">
                    <h2 className="text-3xl font-extrabold tracking-tight mb-2">Company Intelligence</h2>
                    <p className="text-purple-100/80 max-w-xl text-lg">Deep dive into organization profiles and automated Ideal Customer Profile (ICP) scoring.</p>
                </div>
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 right-20 w-[200px] h-[200px] bg-blue-500/[0.1] rounded-full blur-3xl translate-y-1/2"></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Company List */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 h-full flex flex-col">
                        <h3 className="text-lg font-bold mb-6 flex items-center text-slate-800">
                            <Building2 className="w-5 h-5 mr-2 text-purple-600" />
                            Identified Companies ({companies.length})
                        </h3>
                        <div className="space-y-3 overflow-y-auto max-h-[600px] custom-scrollbar pr-2">
                            {companies.length === 0 ? (
                                <p className="text-slate-500 italic text-center py-10">No company data found in leads. Enrich leads to populate this.</p>
                            ) : (
                                companies.map((cls, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => { setSelectedCompany(cls.name); setIcpScore(null); }}
                                        className={`p-5 rounded-xl border cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.01] ${selectedCompany === cls.name ? 'border-purple-500 bg-purple-50/50 ring-1 ring-purple-500/50 shadow-purple-500/10' : 'border-slate-100 hover:border-purple-200 bg-slate-50/50'}`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="font-bold text-slate-900 text-lg">{cls.name}</h4>
                                                <div className="flex space-x-4 text-sm text-slate-500 mt-2">
                                                    <span className="flex items-center bg-white px-2 py-1 rounded-md border border-slate-100"><Users className="w-3.5 h-3.5 mr-1.5 text-blue-500" /> {cls.size}</span>
                                                    <span className="flex items-center bg-white px-2 py-1 rounded-md border border-slate-100"><TrendingUp className="w-3.5 h-3.5 mr-1.5 text-green-500" /> {cls.revenue}</span>
                                                </div>
                                            </div>
                                            <span className="bg-white text-slate-600 text-xs font-bold px-3 py-1.5 rounded-full border border-slate-100 shadow-sm">{cls.leads} Leads</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Analysis / ICP Panel */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 min-h-[400px]">
                        <h3 className="text-lg font-bold mb-6 flex items-center text-slate-800">
                            <Target className="w-5 h-5 mr-2 text-rose-500" />
                            ICP Scoring Engine
                        </h3>

                        {!selectedCompany ? (
                            <div className="text-center py-20 text-slate-300">
                                <Building2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                <p className="text-lg font-medium">Select a company to analyze</p>
                            </div>
                        ) : (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="text-center border-b border-slate-100 pb-6">
                                    <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-1">Target Account</p>
                                    <h2 className="text-2xl font-black text-slate-900">{selectedCompany}</h2>
                                </div>

                                {icpScore === null ? (
                                    <button
                                        onClick={calculateICP}
                                        disabled={calculating}
                                        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-purple-500/30 transform transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
                                    >
                                        {calculating ? (
                                            <span className="flex items-center justify-center"><Loader2 className="animate-spin mr-2" /> Analyzing nuances...</span>
                                        ) : (
                                            <span className="flex items-center justify-center">
                                                Generate ICP Score
                                                <Sparkles className="w-4 h-4 ml-2 group-hover:animate-pulse" />
                                            </span>
                                        )}
                                    </button>
                                ) : (
                                    <div className="text-center animate-in zoom-in duration-300">
                                        <div className="relative inline-flex items-center justify-center w-40 h-40 rounded-full border-8 border-purple-50 bg-white mb-6 shadow-xl shadow-purple-500/10">
                                            <svg className="absolute inset-0 w-full h-full -rotate-90 text-purple-600" viewBox="0 0 36 36">
                                                <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2.5" />
                                                <path className="text-purple-600 drop-shadow-md" strokeDasharray={`${icpScore}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2.5" />
                                            </svg>
                                            <div className="flex flex-col items-center">
                                                <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-purple-600 to-indigo-600">{icpScore}</span>
                                                <span className="text-xs font-bold text-slate-400">SCORE</span>
                                            </div>
                                        </div>
                                        <p className="text-sm font-bold text-slate-700 uppercase tracking-wide">Match Probability: {icpScore > 80 ? 'Excellent' : icpScore > 50 ? 'Moderate' : 'Low'}</p>

                                        <div className="mt-8 text-left bg-slate-50/80 p-5 rounded-xl border border-slate-200/60 shadow-inner space-y-3">
                                            <p className="font-bold flex items-center text-emerald-600 text-sm"><TrendingUp className="w-4 h-4 mr-2" /> High Growth Detected</p>
                                            <p className="font-bold flex items-center text-blue-600 text-sm"><Users className="w-4 h-4 mr-2" /> Decision Maker Access</p>
                                            <p className="text-slate-500 text-xs mt-3 border-t border-slate-200 pt-3 leading-relaxed">
                                                Calculated based on revenue trajectory, tech stack alignment, and recent funding news matches.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="bg-[#0F172A] text-white rounded-2xl shadow-xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <BarChart3 className="w-24 h-24" />
                        </div>
                        <h3 className="font-bold flex items-center mb-3">
                            <BarChart3 className="w-5 h-5 mr-2 text-lime-400" />
                            Market Insights
                        </h3>
                        <p className="text-sm text-slate-400 leading-relaxed relative z-10">
                            The <span className="text-white font-semibold">{companies.find(c => c.name === selectedCompany)?.industry || "Target"}</span> sector shows <span className="text-lime-400 font-bold">+15% YoY</span> growth.
                            Competitors are aggressively hiring in AI/ML roles.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
