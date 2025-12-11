"use client";

import { useState, useEffect } from 'react';
import { LeadTable } from './LeadTable';
import { CSVImport } from './CSVImport';
import { EnrichmentWidget } from './EnrichmentWidget';
import { AddLeadModal } from './AddLeadModal';
import { getLeads, type Lead } from '../services/api';
import { LayoutDashboard, Users, Settings, Database } from 'lucide-react';
import { cn } from '../lib/utils';

import { ManageFieldsModal } from './ManageFieldsModal';

export function ControlPanel() {
    const [activeTab, setActiveTab] = useState<'leads' | 'import' | 'enrichment'>('leads');
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isManageFieldsOpen, setIsManageFieldsOpen] = useState(false);

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
    const allColumns = Array.from(new Set(
        leads.flatMap(lead => lead.custom_data ? Object.keys(lead.custom_data) : [])
    )).sort();

    return (
        <div className="flex h-screen bg-slate-50 font-sans">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 border-r border-slate-800 hidden md:flex flex-col">
                <div className="p-6 flex items-center justify-center">
                    <img src="/logo.jpg" alt="Connectaflow" className="h-10 w-auto object-contain" />
                </div>

                <nav className="flex-1 px-4 space-y-1 mt-6">
                    <NavItem
                        icon={<Users className="w-5 h-5" />}
                        label="All Leads"
                        active={activeTab === 'leads'}
                        onClick={() => setActiveTab('leads')}
                    />
                    <NavItem
                        icon={<Database className="w-5 h-5" />}
                        label="Import Data"
                        active={activeTab === 'import'}
                        onClick={() => setActiveTab('import')}
                    />
                    <NavItem
                        icon={<LayoutDashboard className="w-5 h-5" />}
                        label="Enrichment"
                        active={activeTab === 'enrichment'}
                        onClick={() => setActiveTab('enrichment')}
                    />
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <NavItem
                        icon={<Settings className="w-5 h-5" />}
                        label="Manage Fields"
                        active={false}
                        onClick={() => setIsManageFieldsOpen(true)}
                    />
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-slate-50">
                <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 shadow-sm">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold text-slate-800 capitalize tracking-tight">{activeTab}</h2>
                        <div className="flex space-x-3">
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="bg-lime-500 hover:bg-lime-600 text-black px-4 py-2 rounded-lg font-bold transition-transform active:scale-95 text-sm shadow-md"
                            >
                                + Add Lead
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
                    availableColumns={allColumns}
                    onSuccess={() => {
                        fetchLeads();
                    }}
                />

                <div className="p-8 max-w-7xl mx-auto">
                    {activeTab === 'leads' && (
                        <LeadTable data={leads} isLoading={loading} onRefresh={fetchLeads} />
                    )}

                    {activeTab === 'import' && (
                        <div className="max-w-2xl mx-auto">
                            <CSVImport onUploadSuccess={handleImportSuccess} />
                        </div>
                    )}
                    {activeTab === 'enrichment' && (
                        <div className="w-full">
                            <EnrichmentWidget />
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                active ? "bg-lime-500 text-black shadow-lg shadow-lime-500/20" : "text-slate-400 hover:bg-slate-800 hover:text-white"
            )}
        >
            {icon}
            <span>{label}</span>
        </button>
    )
}
