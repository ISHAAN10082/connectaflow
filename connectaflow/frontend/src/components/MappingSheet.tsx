"use client";

/**
 * MappingSheet — shared spreadsheet-style CSV mapping component.
 *
 * Used by:
 *   • EnrichmentDashboard  (map columns → domain / company_name)
 *   • RecordImport          (map columns → lead fields)
 *
 * Design principles:
 *   • Sheet-first: data is presented as a scrollable grid, not a wizard.
 *   • User-controlled: every mapping decision is explicit, with smart defaults.
 *   • Incremental: row deselection is possible before committing the import.
 */

import { useState, useMemo, useCallback } from 'react';
import { Check, ChevronDown, X, Table2, AlertCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldMapping = {
  [columnHeader: string]: string; // e.g. { "Company Domain": "domain", "Name": "company_name" }
};

export type MappingSheetField = {
  key: string;         // internal key, e.g. "domain"
  label: string;       // displayed label, e.g. "Domain"
  required?: boolean;
  description?: string;
};

export interface MappingSheetProps {
  /** Raw rows from the parsed CSV/XLSX — first row is the header */
  headers: string[];
  rows: string[][];
  /** Available field targets the user can map columns to */
  availableFields: MappingSheetField[];
  /** Called when the user confirms the mapping */
  onConfirm: (mapping: FieldMapping, selectedRows: number[]) => void;
  onCancel: () => void;
  confirmLabel?: string;
}

// ─── Column Mapping Dropdown ──────────────────────────────────────────────────

function ColumnDropdown({
  value,
  fields,
  onChange,
}: {
  value: string;
  fields: MappingSheetField[];
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = fields.find((f) => f.key === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors w-full max-w-[160px]
          ${value
            ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 hover:bg-cyan-500/15'
            : 'bg-slate-800/60 text-slate-400 border border-slate-700/60 hover:border-slate-600'
          }`}
      >
        <span className="flex-1 truncate text-left">
          {selected ? selected.label : 'Skip column'}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] rounded-xl border border-slate-700/80 bg-[#0f162a] py-1 shadow-2xl shadow-black/50">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:bg-white/[0.05] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Skip column
            </button>
            <div className="my-1 h-px bg-slate-800/80" />
            {fields.map((field) => (
              <button
                key={field.key}
                type="button"
                onClick={() => { onChange(field.key); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-white/[0.05] transition-colors"
              >
                <span className={`flex-1 text-left ${value === field.key ? 'text-cyan-300 font-semibold' : 'text-slate-200'}`}>
                  {field.label}
                </span>
                {field.required && (
                  <span className="text-[10px] text-amber-400/70">required</span>
                )}
                {value === field.key && (
                  <Check className="h-3 w-3 text-cyan-400" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function MappingSheet({
  headers,
  rows,
  availableFields,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm & Import',
}: MappingSheetProps) {
  // Build smart initial mapping: if a column header matches a field label/key, auto-select
  const initialMapping = useMemo<FieldMapping>(() => {
    const mapping: FieldMapping = {};
    headers.forEach((header) => {
      const normalized = header.toLowerCase().replace(/[\s_-]+/g, '');
      const match = availableFields.find(
        (f) =>
          f.key === normalized ||
          f.label.toLowerCase().replace(/[\s_-]+/g, '') === normalized ||
          // common aliases
          (f.key === 'domain' && ['website', 'url', 'companyurl', 'companywebsite', 'domain', 'companydomain'].includes(normalized)) ||
          (f.key === 'company_name' && ['company', 'companyname', 'account', 'organization'].includes(normalized)) ||
          (f.key === 'email' && ['email', 'emailaddress', 'workemail'].includes(normalized)) ||
          (f.key === 'first_name' && ['firstname', 'first', 'givenname'].includes(normalized)) ||
          (f.key === 'last_name' && ['lastname', 'last', 'surname', 'familyname'].includes(normalized))
      );
      mapping[header] = match?.key ?? '';
    });
    return mapping;
  }, [headers, availableFields]);

  const [mapping, setMapping] = useState<FieldMapping>(initialMapping);
  // All rows selected by default
  const [selectedRows, setSelectedRows] = useState<Set<number>>(
    () => new Set(rows.map((_, i) => i))
  );

  const previewRows = rows.slice(0, 200); // cap at 200 for perf

  const handleMappingChange = useCallback((header: string, fieldKey: string) => {
    setMapping((prev) => {
      // Un-map any other column that already uses this key (avoid duplicates)
      const next = { ...prev };
      if (fieldKey) {
        Object.keys(next).forEach((h) => {
          if (h !== header && next[h] === fieldKey) {
            next[h] = '';
          }
        });
      }
      next[header] = fieldKey;
      return next;
    });
  }, []);

  const toggleRow = useCallback((idx: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedRows((prev) =>
      prev.size === previewRows.length
        ? new Set()
        : new Set(previewRows.map((_, i) => i))
    );
  }, [previewRows.length]);

  // Validation
  const mappedRequiredFields = useMemo(() => {
    const mapped = new Set(Object.values(mapping).filter(Boolean));
    const required = availableFields.filter((f) => f.required).map((f) => f.key);
    return required.filter((k) => !mapped.has(k));
  }, [mapping, availableFields]);

  const canConfirm = mappedRequiredFields.length === 0 && selectedRows.size > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(mapping, Array.from(selectedRows).sort((a, b) => a - b));
  };

  // Column index → header index lookup
  const colIndexOf = (header: string) => headers.indexOf(header);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0A0F1E]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 bg-[#0D1224] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Table2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Map Your Columns</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {rows.length} rows · {headers.length} columns · {selectedRows.size} selected
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 rounded-xl border border-slate-700/60 text-slate-400 hover:text-white text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors flex items-center gap-2"
          >
            <Check className="w-3.5 h-3.5" />
            {confirmLabel}
          </button>
        </div>
      </div>

      {/* Validation warnings */}
      {mappedRequiredFields.length > 0 && (
        <div className="mx-5 mt-3 shrink-0 flex items-start gap-2 rounded-xl bg-amber-500/8 border border-amber-500/20 px-4 py-2.5">
          <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-300">
            Map at least one column to:{' '}
            <strong>
              {mappedRequiredFields
                .map((k) => availableFields.find((f) => f.key === k)?.label ?? k)
                .join(', ')}
            </strong>
          </p>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto min-h-0 mt-3 mx-5 mb-5 rounded-xl border border-slate-800/60 bg-[#0D1224]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-[#0D1224]">
            {/* Row 1: Column mapper */}
            <tr className="border-b border-slate-800/60">
              <th className="w-10 px-3 py-2 border-r border-slate-800/40" />
              <th className="w-8 px-2 py-2 border-r border-slate-800/40 text-center text-slate-500 font-normal">#</th>
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-3 py-2 border-r border-slate-800/40 text-left align-middle bg-[#0D1224]"
                >
                  <ColumnDropdown
                    value={mapping[header] ?? ''}
                    fields={availableFields}
                    onChange={(key) => handleMappingChange(header, key)}
                  />
                </th>
              ))}
            </tr>

            {/* Row 2: Column headers */}
            <tr className="border-b border-slate-800/80">
              <th className="w-10 px-3 py-2 border-r border-slate-800/40 text-center">
                <input
                  type="checkbox"
                  checked={selectedRows.size === previewRows.length && previewRows.length > 0}
                  onChange={toggleAll}
                  className="accent-cyan-500 rounded"
                />
              </th>
              <th className="w-8 px-2 py-2 border-r border-slate-800/40 text-slate-600 font-mono font-normal" />
              {headers.map((header) => {
                const mappedField = availableFields.find((f) => f.key === mapping[header]);
                return (
                  <th
                    key={header}
                    className="px-3 py-2 border-r border-slate-800/40 text-left font-semibold text-slate-300 whitespace-nowrap"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span>{header}</span>
                      {mappedField && (
                        <span className="text-[10px] text-cyan-400/70 font-normal">→ {mappedField.label}</span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={`border-b border-slate-800/30 transition-colors
                  ${selectedRows.has(rowIdx)
                    ? 'bg-cyan-500/[0.03] hover:bg-cyan-500/[0.05]'
                    : 'opacity-40 hover:opacity-60'
                  }`}
              >
                <td className="px-3 py-2 border-r border-slate-800/30 text-center">
                  <input
                    type="checkbox"
                    checked={selectedRows.has(rowIdx)}
                    onChange={() => toggleRow(rowIdx)}
                    className="accent-cyan-500"
                  />
                </td>
                <td className="px-2 py-2 border-r border-slate-800/30 text-slate-600 font-mono text-center">
                  {rowIdx + 1}
                </td>
                {headers.map((header) => {
                  const cellIdx = colIndexOf(header);
                  const value = row[cellIdx] ?? '';
                  const isMapped = !!mapping[header];
                  return (
                    <td
                      key={header}
                      className={`px-3 py-2 border-r border-slate-800/30 max-w-[200px] truncate
                        ${isMapped ? 'text-white' : 'text-slate-500'}`}
                      title={value}
                    >
                      {value || <span className="text-slate-700">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length > 200 && (
          <div className="px-4 py-3 text-xs text-slate-500 border-t border-slate-800/40">
            Showing 200 of {rows.length} rows. All rows will be imported.
          </div>
        )}
      </div>
    </div>
  );
}
