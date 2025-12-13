"use client";

import { useState, useEffect } from 'react';
import { LeadTable } from './LeadTable';
import { CSVImport } from './CSVImport';
import { EnrichmentWidget } from './EnrichmentWidget';
import { CompanyAnalysis } from './CompanyAnalysis';
import { AddLeadModal } from './AddLeadModal';
import { getLeads, type Lead } from '../services/api';
import { LayoutDashboard, Users, Settings, Database, Building2 } from 'lucide-react';
import { cn } from '../lib/utils';

import { ManageFieldsModal } from './ManageFieldsModal';

export function ControlPanel() {
    const [activeTab, setActiveTab] = useState<'leads' | 'import' | 'enrichment' | 'companies'>('leads');
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isManageFieldsOpen, setIsManageFieldsOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);

    const downloadCSV = () => {
        if (!leads.length) return;

        // simple csv generation
        const headers = ["ID", "Email", "First Name", "Last Name", "Company", "Status", "Enrichment Status", ...visibleCustomColumns];
        const csvContent = [
            headers.join(","),
            ...leads.map(lead => {
                const row = [
                    lead.id,
                    lead.email,
                    lead.first_name,
                    lead.last_name,
                    lead.company_id,
                    lead.status,
                    lead.enrichment_status,
                    ...visibleCustomColumns.map(col => lead.custom_data?.[col] ? `"${String(lead.custom_data[col]).replace(/"/g, '""')}"` : "")
                ];
                return row.join(",");
            })
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const fetchLeads = async () => {
        setLoading(true);
        try {
            const data = await getLeads();
            setLeads(data);
        } catch (error) {
            console.error("Failed to fetch leads", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeads();
    }, []);

    const handleImportSuccess = (data: any) => {
        console.log("Import success:", data);
        alert(data.message); // Simple feedback for now
        fetchLeads();
        setActiveTab('leads');
    };

    // Compute all available columns across all leads
    const allDetectedColumns = Array.from(new Set(
        leads.flatMap(lead => lead.custom_data ? Object.keys(lead.custom_data) : [])
    )).sort();

    const visibleCustomColumns = allDetectedColumns.filter(col => !hiddenColumns.includes(col));

    return (
        <div className="flex h-screen bg-[#F8FAFC] font-sans selection:bg-purple-100 selection:text-purple-900">
            {/* Premium Sidebar */}
            <aside className={cn(
                "bg-[#0F172A] border-r border-[#1E293B] hidden md:flex flex-col transition-all duration-300 ease-in-out relative z-20 shadow-xl",
                isSidebarCollapsed ? "w-20" : "w-72"
            )}>
                <div className="h-24 flex items-center justify-center relative group border-b border-[#1E293B]/50 bg-[#020617]/30">
                    <div className={cn("transition-all duration-300 flex items-center justify-center", isSidebarCollapsed ? "p-4" : "px-8")}>
                        <img
                            src="/logo.jpg"
                            alt="Connectaflow"
                            className={cn("object-contain transition-all duration-300 drop-shadow-lg", isSidebarCollapsed ? "h-30 w-40" : "h-14 w-auto")}
                        />
                    </div>
                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="absolute -right-3 top-1/2 -translate-y-1/2 p-1.5 bg-[#1E293B] text-slate-400 hover:text-white rounded-full border border-slate-700 shadow-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                    >
                        {isSidebarCollapsed ? ">>" : "<<"}
                    </button>
                </div>

                <div className="flex-1 py-6 px-3 space-y-2 overflow-y-auto custom-scrollbar">
                    <div className={cn("text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3", isSidebarCollapsed && "text-center")}>
                        {isSidebarCollapsed ? "Menu" : "Main Module"}
                    </div>
                    <NavItem
                        icon={<Users className="w-5 h-5" />}
                        label="Lead Management"
                        active={activeTab === 'leads'}
                        onClick={() => setActiveTab('leads')}
                        collapsed={isSidebarCollapsed}
                    />
                    <NavItem
                        icon={<LayoutDashboard className="w-5 h-5" />}
                        label="Enrichment Engine"
                        active={activeTab === 'enrichment'}
                        onClick={() => setActiveTab('enrichment')}
                        collapsed={isSidebarCollapsed}
                    />
                    <NavItem
                        icon={<Building2 className="w-5 h-5" />}
                        label="Company Intelligence"
                        active={activeTab === 'companies'}
                        onClick={() => setActiveTab('companies')}
                        collapsed={isSidebarCollapsed}
                    />
                    <div className="my-4 border-t border-[#1E293B]/50" />
                    <div className={cn("text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3", isSidebarCollapsed && "text-center")}>
                        {isSidebarCollapsed ? "Data" : "Data Ops"}
                    </div>
                    <NavItem
                        icon={<Database className="w-5 h-5" />}
                        label="Import & Sync"
                        active={activeTab === 'import'}
                        onClick={() => setActiveTab('import')}
                        collapsed={isSidebarCollapsed}
                    />
                </div>

                <div className="p-4 border-t border-[#1E293B] bg-[#020617]/20">
                    <NavItem
                        icon={<Settings className="w-5 h-5" />}
                        label="Field Configuration"
                        active={false}
                        onClick={() => setIsManageFieldsOpen(true)}
                        collapsed={isSidebarCollapsed}
                    />
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-[#F8FAFC]">
                <header className="bg-white border-b border-slate-200/80 px-8 py-5 sticky top-0 z-10 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] backdrop-blur-sm bg-white/90">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 tracking-tight capitalize">{activeTab.replace('-', ' ')}</h2>
                            <p className="text-slate-500 text-sm mt-0.5">Workspace: Default / Ishaan Majumdar</p>
                        </div>
                        <div className="flex space-x-3">
                            <button
                                onClick={downloadCSV}
                                className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg font-semibold transition-all text-sm shadow-sm hover:shadow-md flex items-center"
                            >
                                <Database className="w-4 h-4 mr-2 text-slate-400" />
                                Export CSV
                            </button>
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="bg-gradient-to-r from-lime-400 to-lime-500 hover:from-lime-500 hover:to-lime-600 text-slate-900 px-5 py-2.5 rounded-lg font-bold transition-all active:scale-95 text-sm shadow-lg shadow-lime-500/20 flex items-center"
                            >
                                <Users className="w-4 h-4 mr-2" />
                                Add New Lead
                            </button>
                        </div>
                    </div>
                </header>

                <AddLeadModal
                    isOpen={isAddModalOpen}
                    onClose={() => setIsAddModalOpen(false)}
                    onSuccess={() => {
                        fetchLeads();
                        // Optionally switch tab if not already on leads
                        if (activeTab !== 'leads') setActiveTab('leads');
                    }}
                />

                <ManageFieldsModal
                    isOpen={isManageFieldsOpen}
                    onClose={() => setIsManageFieldsOpen(false)}
                    availableColumns={allDetectedColumns}
                    hiddenColumns={hiddenColumns}
                    onToggleVisibility={(col) => {
                        if (hiddenColumns.includes(col)) {
                            setHiddenColumns(hiddenColumns.filter(c => c !== col));
                        } else {
                            setHiddenColumns([...hiddenColumns, col]);
                        }
                    }}
                    onSuccess={() => {
                        fetchLeads();
                    }}
                />

                <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
                    {activeTab === 'leads' && (
                        <LeadTable
                            data={leads}
                            isLoading={loading}
                            onRefresh={fetchLeads}
                            visibleCustomColumns={visibleCustomColumns}
                        />
                    )}

                    {activeTab === 'import' && (
                        <div className="max-w-4xl mx-auto">
                            <CSVImport onUploadSuccess={handleImportSuccess} />
                        </div>
                    )}
                    {activeTab === 'enrichment' && (
                        <div className="w-full">
                            <EnrichmentWidget />
                        </div>
                    )}
                    {activeTab === 'companies' && (
                        <div className="w-full">
                            <CompanyAnalysis leads={leads} />
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

function NavItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, collapsed?: boolean }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full flex items-center px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                collapsed ? "justify-center" : "space-x-3",
                active
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/20 ring-1 ring-white/10"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-white hover:shadow-inner"
            )}
            title={collapsed ? label : undefined}
        >
            <div className={cn("relative z-10 flex items-center", collapsed && "justify-center")}>
                {icon}
                {!collapsed && <span className="ml-3 tracking-wide">{label}</span>}
            </div>
            {active && <div className="absolute inset-0 bg-white/10 mix-blend-overlay"></div>}
        </button>
    )
}
