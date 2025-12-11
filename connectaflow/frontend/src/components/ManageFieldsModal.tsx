"use client";

import { useState } from 'react';
import { X, Trash2, Settings } from 'lucide-react';
import axios from 'axios';
import { cn } from '../lib/utils';

interface ManageFieldsModalProps {
    isOpen: boolean;
    onClose: () => void;
    availableColumns: string[];
    onSuccess: () => void;
}

export function ManageFieldsModal({ isOpen, onClose, availableColumns, onSuccess }: ManageFieldsModalProps) {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative animate-in fade-in zoom-in-95 duration-200">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <X className="w-5 h-5" />
                </button>

                <div className="flex items-center space-x-3 mb-6">
                    <div className="bg-slate-100 p-2 rounded-lg">
                        <Settings className="w-6 h-6 text-slate-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Manage Fields</h2>
                        <p className="text-sm text-slate-500">Remove unwanted enrichment data</p>
                    </div>
                </div>

                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {customColumns.length === 0 ? (
                        <p className="text-center text-slate-500 py-4">No custom fields found.</p>
                    ) : (
                        customColumns.map(col => (
                            <div key={col} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg group hover:bg-slate-100 transition-colors">
                                <span className="font-medium text-slate-700 capitalize">{col.replace(/_/g, ' ')}</span>
                                <button
                                    onClick={() => handleDelete(col)}
                                    disabled={!!isLoading}
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                                    title="Delete Field"
                                >
                                    {isLoading === col ? (
                                        <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Trash2 className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg font-medium transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
