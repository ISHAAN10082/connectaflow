"use client";

import { useState, useEffect, useMemo } from 'react';
import {
    useReactTable, getCoreRowModel, getSortedRowModel,
    getFilteredRowModel, flexRender, createColumnHelper,
    type SortingState, type ColumnDef,
} from '@tanstack/react-table';
import { ArrowUpDown, Search, RefreshCw, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { getLeads, updateLead, type Lead } from '../services/api';

const QUALITY_DOT: Record<string, string> = {
    high: 'bg-emerald-400',
    medium: 'bg-amber-400',
    low: 'bg-orange-400',
    insufficient: 'bg-slate-500',
};

export function LeadTable() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [sorting, setSorting] = useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const PAGE_SIZE = 50;

    const loadLeads = async (skip = 0) => {
        setLoading(true);
        try {
            const { data } = await getLeads(skip, PAGE_SIZE);
            setLeads(data.leads || []);
            setTotal(data.total || 0);
        } catch {
            toast.error('Failed to load leads');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadLeads(page * PAGE_SIZE); }, [page]);

    const columns = useMemo<ColumnDef<Lead, any>[]>(() => [
        {
            accessorKey: 'email',
            header: 'Email',
            cell: (info: any) => (
                <span className="text-sm font-medium text-white">{info.getValue()}</span>
            ),
        },
        {
            accessorKey: 'domain',
            header: 'Domain',
            cell: (info: any) => (
                <span className="text-sm text-slate-400 font-mono">{info.getValue() || '—'}</span>
            ),
        },
        {
            id: 'company',
            header: 'Company',
            cell: ({ row }: any) => {
                const profile = row.original.company_profile;
                return (
                    <span className="text-sm text-white">{profile?.name || '—'}</span>
                );
            },
        },
        {
            id: 'quality',
            header: 'Quality',
            cell: ({ row }: any) => {
                const profile = row.original.company_profile;
                if (!profile) return <span className="text-xs text-slate-600">—</span>;
                const tier = profile.quality_tier || 'pending';
                return (
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${QUALITY_DOT[tier] || 'bg-slate-600'}`} />
                        <span className="text-xs text-slate-400 capitalize">{tier}</span>
                        <span className="text-xs text-slate-500 font-mono">{((profile.quality_score || 0) * 100).toFixed(0)}%</span>
                    </div>
                );
            },
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: (info: any) => {
                const status = info.getValue();
                const colors: Record<string, string> = {
                    New: 'bg-blue-500/10 text-blue-400',
                    Contacted: 'bg-amber-500/10 text-amber-400',
                    Qualified: 'bg-emerald-500/10 text-emerald-400',
                    Closed: 'bg-slate-500/10 text-slate-400',
                };
                return (
                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${colors[status] || 'bg-slate-500/10 text-slate-400'}`}>
                        {status}
                    </span>
                );
            },
        },
        {
            accessorKey: 'enrichment_status',
            header: 'Enrichment',
            cell: (info: any) => {
                const s = info.getValue();
                const colors: Record<string, string> = {
                    pending: 'text-slate-500',
                    enriched: 'text-emerald-400',
                    failed: 'text-red-400',
                };
                return <span className={`text-xs font-medium ${colors[s] || 'text-slate-500'}`}>{s}</span>;
            },
        },
    ], []);

    const table = useReactTable({
        data: leads,
        columns,
        state: { sorting, globalFilter },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <div id="lead-table">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        value={globalFilter}
                        onChange={e => setGlobalFilter(e.target.value)}
                        placeholder="Search leads..."
                        className="pl-9 pr-4 py-2 bg-[#131A2E] border border-slate-800/60 rounded-xl text-sm text-white placeholder-slate-600 focus:border-violet-500/40 outline-none w-64"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{total} leads</span>
                    <button
                        onClick={() => loadLeads(page * PAGE_SIZE)}
                        className="p-2 bg-[#131A2E] border border-slate-800/60 rounded-xl text-slate-400 hover:text-white transition-colors"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-[#131A2E] border border-slate-800/60 rounded-2xl overflow-hidden">
                <table className="w-full">
                    <thead>
                        {table.getHeaderGroups().map(hg => (
                            <tr key={hg.id} className="border-b border-slate-800/60">
                                {hg.headers.map(header => (
                                    <th
                                        key={header.id}
                                        onClick={header.column.getToggleSortingHandler()}
                                        className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                                    >
                                        <div className="flex items-center gap-1">
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                            <ArrowUpDown className="w-3 h-3 opacity-40" />
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody className="divide-y divide-slate-800/30">
                        {table.getRowModel().rows.map(row => (
                            <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                                {row.getVisibleCells().map(cell => (
                                    <td key={cell.id} className="px-4 py-3">
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {leads.length === 0 && !loading && (
                            <tr>
                                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-500">
                                    No leads yet. Import from CSV or add manually.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                    <span className="text-xs text-slate-500">
                        Page {page + 1} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="p-2 bg-[#131A2E] border border-slate-800/60 rounded-xl text-slate-400 hover:text-white disabled:opacity-30 transition-all"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="p-2 bg-[#131A2E] border border-slate-800/60 rounded-xl text-slate-400 hover:text-white disabled:opacity-30 transition-all"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
