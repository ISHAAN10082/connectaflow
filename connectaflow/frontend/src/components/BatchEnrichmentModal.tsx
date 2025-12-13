"use client";

import { useState } from 'react';
import { X, Loader2, Sparkles, Wand2, Info } from 'lucide-react';
import axios from 'axios';
import { cn } from '../lib/utils';

interface BatchEnrichmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedLeadIds: string[];
    onSuccess: (newColumns?: string[]) => void;
    availableColumns: string[];
}

export function BatchEnrichmentModal({ isOpen, onClose, selectedLeadIds, onSuccess, availableColumns }: BatchEnrichmentModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [targets, setTargets] = useState<string>("");
    const [context, setContext] = useState<string[]>(["company"]);
    const [instruction, setInstruction] = useState("");

    if (!isOpen) return null;

    const toggleContext = (col: string) => {
        if (context.includes(col)) {
            setContext(context.filter(c => c !== col));
        } else {
            setContext([...context, col]);
        }
    };

    const handleSubmit = async () => {
        if (!targets) return;

        setIsLoading(true);
        try {
            const targetCols = targets.split(',').map(s => s.trim()).filter(Boolean);

            await axios.post('http://localhost:8000/api/enrichment/batch-enrich/', {
                lead_ids: selectedLeadIds,
                target_columns: targetCols,
                context_columns: context,
                instruction: instruction
            });

            alert(`Enrichment started for ${selectedLeadIds.length} leads! Data will appear as it arrives.`);
            alert(`Enrichment started for ${selectedLeadIds.length} leads! Data will appear as it arrives.`);
            onSuccess(targetCols);
            onClose();
        } catch (error) {
            console.error("Failed to start batch enrichment", error);
            alert("Failed to start enrichment job.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 relative animate-in fade-in zoom-in-95 duration-200 border-2 border-slate-100 max-h-[90vh] overflow-y-auto">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <X className="w-5 h-5" />
                </button>

                <div className="flex items-center space-x-3 mb-6">
                    <div className="bg-purple-100 p-2 rounded-lg">
                        <Wand2 className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Enrich {selectedLeadIds.length} Leads</h2>
                        <p className="text-sm text-slate-500">Configure your AI research agent</p>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* 1. Target Columns */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">
                            1. What data do you want to find?
                        </label>
                        <input
                            placeholder="e.g. Funding Total, Employee Count, CEO Name, Pricing Model"
                            value={targets}
                            onChange={e => setTargets(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all text-base"
                        />
                        <p className="text-xs text-slate-500 mt-2 flex items-center">
                            <Info className="w-3 h-3 mr-1" />
                            Separate multiple fields with commas. The AI will extract exactly these fields.
                        </p>
                    </div>

                    {/* 2. Context Selection */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">
                            2. Search Context (Columns to search with)
                        </label>
                        <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                            {availableColumns.map((col, idx) => (
                                <button
                                    key={`${col}-${idx}`}
                                    onClick={() => toggleContext(col)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-md text-sm font-medium border transition-all",
                                        context.includes(col)
                                            ? "bg-purple-100 border-purple-200 text-purple-700"
                                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                                    )}
                                >
                                    {col}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            Selected columns will be combined to form the search query (e.g. "Acme Corp San Francisco Revenue").
                        </p>
                    </div>

                    {/* 3. Instructions */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">
                            3. Custom Instructions (Optional)
                        </label>
                        <textarea
                            placeholder="e.g. 'Focus on exact numbers from 2023 reports', 'Ignore LinkedIn profiles', 'Summarize in under 10 words'"
                            value={instruction}
                            onChange={e => setInstruction(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all min-h-[80px]"
                        />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isLoading || !targets}
                            className="w-full bg-lime-500 hover:bg-lime-600 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center space-x-2 shadow-lg shadow-lime-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                            Start Research Agent
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
