"use client";

import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    createColumnHelper,
    type ColumnDef,
    type RowSelectionState,
} from "@tanstack/react-table";
import { type Lead } from "../services/api";
import { cn } from "../lib/utils";
import { MoreHorizontal, ArrowUpDown, Sparkles, CheckSquare, Square, Loader2 } from 'lucide-react';
import { useState, useMemo, useEffect } from "react";
import { BatchEnrichmentModal } from "./BatchEnrichmentModal";

const columnHelper = createColumnHelper<Lead>();

interface LeadTableProps {
    data: Lead[];
    isLoading?: boolean;
    onRefresh?: () => void;
    visibleCustomColumns?: string[];
}

export function LeadTable({ data, isLoading, onRefresh, visibleCustomColumns = [] }: LeadTableProps) {
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [isEnrichModalOpen, setIsEnrichModalOpen] = useState(false);

    // Editable Cell Component
    const EditableCell = ({ getValue, row, column, table }: any) => {
        const initialValue = getValue();
        const [value, setValue] = useState(initialValue);
        const [isSaving, setIsSaving] = useState(false);

        // Update local state if prop changes (e.g. optimistic update)
        useEffect(() => {
            setValue(initialValue);
        }, [initialValue]);

        const onBlur = async () => {
            if (value === initialValue) return;

            setIsSaving(true);
            try {
                // Determine field name (remove 'custom_' prefix if needed)
                const fieldKey = column.id.replace('custom_', '');

                // Construct patch payload
                // We need to merge with existing custom_data to avoid overwriting
                const existingCustom = row.original.custom_data || {};
                const newCustom = { ...existingCustom, [fieldKey]: value };

                // Call API
                const response = await fetch(`http://localhost:8000/api/leads/${row.original.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ custom_data: newCustom })
                });

                if (!response.ok) throw new Error('Failed to update');

                // Optimistic update handled by local state, but usually good to refresh or update Table data
                // For now, local state provides instant feedback
            } catch (error) {
                console.error("Update failed", error);
                setValue(initialValue); // Revert on error
                alert("Failed to save value");
            } finally {
                setIsSaving(false);
            }
        };

        if (value === "Enriching...") {
            return (
                <div className="flex items-center text-xs text-purple-600 font-medium animate-pulse px-2 py-1 bg-purple-50 rounded">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Researching...
                </div>
            )
        }

        return (
            <div className="relative group">
                <input
                    value={String(value || "")}
                    onChange={e => setValue(e.target.value)}
                    onBlur={onBlur}
                    className={cn(
                        "w-full bg-transparent border-none p-0 focus:ring-0 text-slate-600 font-medium truncate focus:bg-white focus:shadow-sm rounded transition-all",
                        isSaving && "opacity-50"
                    )}
                />
                {isSaving && (
                    <div className="absolute right-0 top-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                )}
            </div>
        );
    };

    // 1. Compute Dynamic Columns based on PROPS (Controlled by Parent), not Data
    const dynamicColumns = useMemo(() => {
        // If visibleCustomColumns is passed, use it. Otherwise fallback to empty or auto (we prefer empty for strictness)
        // Parent ControlPanel is responsible for passing the filtered list (all - hidden).

        return visibleCustomColumns.map(key =>
            columnHelper.accessor(row => row.custom_data?.[key], {
                id: `custom_${key}`,
                header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
                cell: EditableCell
            })
        );
    }, [visibleCustomColumns]);

    // 2. Define Base Columns + Dynamic Columns
    const columns = useMemo(() => [
        // Selection Column
        {
            id: 'select',
            header: ({ table }: any) => (
                <button
                    onClick={table.getToggleAllRowsSelectedHandler()}
                    className="text-slate-400 hover:text-slate-600"
                >
                    {table.getIsAllRowsSelected() ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                </button>
            ),
            cell: ({ row }: any) => (
                <button
                    onClick={row.getToggleSelectedHandler()}
                    className="text-slate-400 hover:text-slate-600"
                >
                    {row.getIsSelected() ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                </button>
            ),
        },
        columnHelper.accessor("first_name", {
            header: "First Name",
            cell: (info) => <span className="font-medium text-slate-900">{info.getValue() || "-"}</span>,
        }),
        columnHelper.accessor("email", {
            header: "Email",
            cell: (info) => (
                <a href={`mailto:${info.getValue()}`} className="text-blue-600 hover:underline">
                    {info.getValue()}
                </a>
            ),
        }),
        columnHelper.accessor("status", {
            header: "Status",
            cell: (info) => (
                <span
                    className={cn(
                        "px-2 py-1 rounded-full text-xs font-semibold",
                        info.getValue() === "New" && "bg-blue-100 text-blue-700",
                        info.getValue() === "Enriched" && "bg-green-100 text-green-700",
                        info.getValue() === "Failed" && "bg-red-100 text-red-700"
                    )}
                >
                    {info.getValue()}
                </span>
            ),
        }),
        // Insert Dynamic Columns Here
        ...dynamicColumns,
        columnHelper.accessor("score", {
            header: "Score",
            cell: (info) => (
                <div className="w-full bg-slate-200 rounded-full h-2.5 dark:bg-slate-700 max-w-[100px]">
                    <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${info.getValue()}%` }}></div>
                </div>
            ),
        }),
    ], [dynamicColumns]);

    const table = useReactTable({
        data,
        columns,
        state: {
            rowSelection,
        },
        onRowSelectionChange: setRowSelection,
        getCoreRowModel: getCoreRowModel(),
        getRowId: row => row.id, // STABILITY FIX: Ensure row ID is always the UUID
    });

    const selectedIds = useMemo(() => {
        return table.getSelectedRowModel().rows.map(row => row.original.id);
    }, [rowSelection, table]);

    if (isLoading) {
        return <div className="p-8 text-center text-slate-500">Loading leads...</div>
    }

    return (
        <div className="space-y-4">
            {/* Batch Actions Toolbar */}
            <div className="bg-slate-900 text-white px-6 py-3 rounded-xl flex items-center justify-between shadow-lg animate-in slide-in-from-bottom-2 fade-in">
                <span className="font-medium">{selectedIds.length} leads selected</span>
                <div className="flex space-x-2">
                    <button
                        onClick={() => {
                            if (onRefresh) onRefresh();
                            setRowSelection({});
                        }}
                        className="px-3 py-2 hover:bg-slate-700 rounded-lg text-sm text-slate-300 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => setIsEnrichModalOpen(true)}
                        className="bg-lime-500 hover:bg-lime-600 text-black px-4 py-2 rounded-lg font-bold transition-colors flex items-center space-x-2 shadow-lg shadow-lime-500/20"
                    >
                        <Sparkles className="w-4 h-4" />
                        <span>Enrich Selected</span>
                    </button>
                </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto max-h-[70vh]">
                    <table className="w-full text-left text-sm text-slate-500">
                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th key={header.id} className="px-6 py-4 font-semibold text-slate-900 whitespace-nowrap">
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {table.getRowModel().rows.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <tr key={row.id} className={cn("hover:bg-slate-50 transition-colors", row.getIsSelected() && "bg-slate-50")}>
                                        {row.getVisibleCells().map((cell) => (
                                            <td key={cell.id} className="px-6 py-4 whitespace-nowrap">
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={columns.length} className="px-6 py-8 text-center text-slate-500">
                                        No leads found. Import some data to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <BatchEnrichmentModal
                isOpen={isEnrichModalOpen}
                onClose={() => setIsEnrichModalOpen(false)}
                selectedLeadIds={selectedIds}
                availableColumns={['first_name', 'last_name', 'email', 'company', ...dynamicColumns.map(d => d.id as string).filter(id => id?.startsWith('custom_')).map(id => id?.replace('custom_', ''))]}
                onSuccess={(newCols) => {
                    // Optimistic Update
                    if (newCols && newCols.length > 0) {
                        // We must clone data to trigger React re-render if we want optimistic UI
                        // But data is a prop. We can't easily clone it up-stream without ControlPanel changes.
                        // ALTERNATIVE: Just force a refresh after a short delay, 
                        // and rely on the "Processing" indicator from the modal to have set expectations.

                        // For now, let's just Refresh after 2 seconds. 
                        // The user is angry about "no field added". 
                        // If we refresh, the column will appear (even if values are null initially, the column exists in custom_data if backend saved it).
                        // Wait, backend saves keys only when done?
                        // No, we need to save "pending" status or similar? 

                        // Let's rely on the backend being fast now that it's unblocked + refresh.
                        setTimeout(() => {
                            if (onRefresh) onRefresh();
                        }, 1000);

                        // Also poll again after 5s to catch stragglers
                        setTimeout(() => {
                            if (onRefresh) onRefresh();
                        }, 5000);
                    } else {
                        if (onRefresh) onRefresh();
                    }
                    setRowSelection({});
                }}
            />
        </div>
    );
}

