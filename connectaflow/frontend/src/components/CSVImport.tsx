"use client";

import { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { cn } from '../lib/utils'; // Assumes utils exist

interface CSVImportProps {
    onUploadSuccess?: (data: any) => void;
}

export function CSVImport({ onUploadSuccess }: CSVImportProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        validateAndSetFile(droppedFile);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) validateAndSetFile(selectedFile);
    };

    const validateAndSetFile = (f: File) => {
        const validTypes = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
        if (!validTypes.includes(f.type) && !f.name.endsWith('.csv') && !f.name.endsWith('.xlsx')) {
            setErrorMsg('Please upload a CSV or Excel file.');
            setStatus('error');
            return;
        }
        setFile(f);
        setStatus('idle');
        setErrorMsg('');
    };

    const handleUpload = async () => {
        if (!file) return;

        setStatus('uploading');
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post('http://localhost:8000/api/enrichment/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            setStatus('success');
            if (onUploadSuccess) {
                // Pass the import stats
                onUploadSuccess(response.data);
            }
        } catch (err) {
            console.error(err);
            setStatus('error');
            setErrorMsg('Upload failed. Check console for details.');
        }
    };

    return (
        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Import Leads via CSV</h3>

            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                    "border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center transition-colors cursor-pointer",
                    isDragging ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400 bg-slate-50",
                    status === 'error' && "border-red-300 bg-red-50"
                )}
            >
                <input
                    type="file"
                    accept=".csv, .xlsx"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                />

                <label htmlFor="file-upload" className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
                    {status === 'success' ? (
                        <CheckCircle className="w-10 h-10 text-green-500 mb-3" />
                    ) : (
                        <Upload className="w-10 h-10 text-slate-400 mb-3" />
                    )}

                    <p className="text-sm text-slate-600 font-medium">
                        {file ? file.name : "Drag & drop CSV or click to browse"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Max 50MB</p>
                </label>
            </div>

            {status === 'error' && (
                <div className="mt-3 flex items-center text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    {errorMsg}
                </div>
            )}

            {file && status !== 'success' && (
                <button
                    onClick={handleUpload}
                    disabled={status === 'uploading'}
                    className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                    {status === 'uploading' ? 'Uploading...' : 'Process File'}
                </button>
            )}
        </div>
    );
}
