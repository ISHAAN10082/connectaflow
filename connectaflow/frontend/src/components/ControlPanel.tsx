"use client";

import { useState } from 'react';
import {
    Sparkles, BarChart3, Radio, Target, Download,
    Zap, ChevronRight, BookOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { GTMIntelligence } from './GTMIntelligence';
import { EnrichmentDashboard } from './EnrichmentDashboard';
import { SignalQueue } from './SignalQueue';
import { KPIDashboard } from './KPIDashboard';
import { LeadTable } from './LeadTable';
import { PlaybookManager } from './PlaybookManager';
import { exportEnrichedCSV } from '../services/api';

type Screen = 'gtm-context' | 'playbooks' | 'enrichment' | 'signals' | 'leads' | 'analytics';

const NAV_ITEMS: { key: Screen; label: string; icon: typeof Sparkles; desc: string }[] = [
    { key: 'gtm-context', label: 'GTM Intelligence', icon: Target, desc: 'Strategy & personas' },
    { key: 'playbooks', label: 'Playbooks', icon: BookOpen, desc: 'Plays & sequences' },
    { key: 'enrichment', label: 'Enrichment', icon: Sparkles, desc: 'Enrich companies' },
    { key: 'signals', label: 'Signal Queue', icon: Radio, desc: 'Who to call today' },
    { key: 'leads', label: 'Leads', icon: Zap, desc: 'Manage leads' },
    { key: 'analytics', label: 'Command Center', icon: BarChart3, desc: 'Performance' },
];

export function ControlPanel() {
    const [activeScreen, setActiveScreen] = useState<Screen>('gtm-context');
    const [selectedIcpId, setSelectedIcpId] = useState<string | null>(null);

    return (
        <div className="flex h-screen bg-[#0A0F1E]/90" id="control-panel">
            {/* ── Sidebar ─────────────────────────────────────── */}
            <aside className="w-[260px] bg-[#0D1224] border-r border-slate-800/60 flex flex-col">
                {/* Logo */}
                <div className="p-5 border-b border-slate-800/60">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            <Zap className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-[15px] font-bold text-white tracking-tight">Connectaflow</h1>
                            <p className="text-[11px] text-slate-500 font-medium">GTM Intelligence</p>
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-3 space-y-1">
                    {NAV_ITEMS.map(item => (
                        <button
                            key={item.key}
                            onClick={() => setActiveScreen(item.key)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group ${activeScreen === item.key
                                ? 'bg-gradient-to-r from-cyan-600/15 to-teal-600/10 text-white border border-cyan-500/20'
                                : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
                                }`}
                        >
                            <item.icon className={`w-[18px] h-[18px] transition-colors ${activeScreen === item.key ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'
                                }`} />
                            <div className="min-w-0">
                                <div className="text-[13px] font-semibold truncate">{item.label}</div>
                                <div className="text-[10px] text-slate-500 truncate">{item.desc}</div>
                            </div>
                            {activeScreen === item.key && (
                                <ChevronRight className="w-3.5 h-3.5 ml-auto text-cyan-400/60" />
                            )}
                        </button>
                    ))}
                </nav>

                {/* Bottom actions */}
                <div className="p-3 border-t border-slate-800/60 space-y-1">
                    <button
                        onClick={() => {
                            exportEnrichedCSV();
                            toast.success('Export started');
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.03] transition-all text-[13px] font-medium"
                    >
                        <Download className="w-[18px] h-[18px] text-slate-500" />
                        Export CSV
                    </button>
                </div>
            </aside>

            {/* ── Main content ────────────────────────────────── */}
            <main className="flex-1 overflow-auto">
                {activeScreen === 'gtm-context' && (
                    <GTMIntelligence onICPGenerated={(id) => setSelectedIcpId(id)} />
                )}
                {activeScreen === 'playbooks' && (
                    <PlaybookManager icpId={selectedIcpId} />
                )}
                {activeScreen === 'enrichment' && (
                    <EnrichmentDashboard icpId={selectedIcpId} />
                )}
                {activeScreen === 'signals' && (
                    <SignalQueue icpId={selectedIcpId} />
                )}
                {activeScreen === 'leads' && (
                    <div className="p-6">
                        <LeadTable />
                    </div>
                )}
                {activeScreen === 'analytics' && (
                    <KPIDashboard />
                )}
            </main>
        </div>
    );
}
