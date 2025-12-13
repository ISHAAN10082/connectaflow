"use client";

import { useState } from 'react';
import { X, Trash2, Settings, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';
import { cn } from '../lib/utils';

interface ManageFieldsModalProps {
    isOpen: boolean;
    onClose: () => void;
    availableColumns: string[];
    hiddenColumns: string[];
    onToggleVisibility: (col: string) => void;
    onSuccess: () => void;
}

export function ManageFieldsModal({ isOpen, onClose, availableColumns, hiddenColumns, onToggleVisibility, onSuccess }: ManageFieldsModalProps) {
    const [isLoading, setIsLoading] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleDelete = async (col: string) => {
        if (!confirm(`Are you sure you want to delete the field "${col}" from ALL leads? This cannot be undone.`)) return;

        setIsLoading(col);
        try {
            await axios.delete(`http://localhost:8000/api/leads/fields/${col}`);
            onSuccess(); // Refresh table
        } catch (error) {
            console.error("Failed to delete field", error);
            alert("Failed to delete field");
        } finally {
            setIsLoading(null);
        }
    };

    // Filter out standard columns
    const customColumns = availableColumns.filter(c => !['first_name', 'last_name', 'email', 'company_id', 'status', 'score', 'enrichment_status', 'created_at', 'updated_at'].includes(c));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-0 relative animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center space-x-3">
                        <div className="bg-purple-100 p-2 rounded-lg">
                            <Settings className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Configure Fields</h2>
                            <p className="text-xs text-slate-500">Manage visibility and data schema</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {customColumns.length === 0 ? (
                        <div className="text-center py-12 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                            <p className="text-slate-500 text-sm">No custom fields found.</p>
                            <p className="text-xs text-slate-400 mt-1">Enrich leads to generate new fields.</p>
                        </div>
                    ) : (
                        customColumns.map(col => {
                            const isHidden = hiddenColumns.includes(col);
                            return (
                                <div key={col} className={cn(
                                    "flex items-center justify-between p-3 rounded-xl border transition-all",
                                    isHidden ? "bg-slate-50 border-slate-200 opacity-60" : "bg-white border-slate-200 hover:border-purple-200 hover:shadow-sm"
                                )}>
                                    <div className="flex items-center space-x-3">
                                        <button
                                            onClick={() => onToggleVisibility(col)}
                                            className={cn(
                                                "p-1.5 rounded-md transition-colors",
                                                isHidden ? "text-slate-400 hover:text-slate-600" : "text-purple-600 bg-purple-50"
                                            )}
                                        >
                                            {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                        <span className={cn("font-medium text-sm capitalize", isHidden ? "text-slate-500 line-through decoration-slate-300" : "text-slate-700")}>
                                            {col.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(col)}
                                        disabled={!!isLoading}
                                        className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                        title="Delete Field Permanently"
                                    >
                                        {isLoading === col ? (
                                            <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-lg font-bold text-sm transition-all shadow-md active:scale-95"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
