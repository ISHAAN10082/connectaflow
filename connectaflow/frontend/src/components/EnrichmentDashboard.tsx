"use client";

/**
 * EnrichmentDashboard — Accounts module.
 *
 * Design: sheet-first, user-controlled, signal-aware.
 *
 * Flow:
 *   1. User pastes domains OR uploads a CSV/XLSX file.
 *   2. If file: MappingSheet shows column mapping + row selection.
 *   3. EnrichmentConfig modal lets user toggle recipes and add custom signals.
 *   4. Enrichment runs; progress bar tracks completion.
 *   5. Results render as a full-width data grid with ICP tier badges.
 *   6. On completion, scoring auto-triggers and assigns T1/T2/T3 tiers.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Sparkles, Upload, Loader2, ChevronDown, ChevronRight,
  Database, Search, ChevronLeft, ExternalLink, SlidersHorizontal,
  Check, X, Plus, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  importCSV, startBatchEnrichment, getJobStatus, getProfiles, scoreBatch,
  type CompanyProfile, type EnrichmentJobStatus, type DataPoint,
  type ICPScoreResult, type ImportLeadsResult,
} from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { isHttpUrl } from '../lib/links';
import { describeEvidence, formatDataValue, formatSourceLabel } from '../lib/provenance';
import { MappingSheet, type MappingSheetField, type FieldMapping } from './MappingSheet';

// ─── Constants ────────────────────────────────────────────────────────────────

interface Props {
  icpId: string | null;
  initialDomains?: string | null;
}

const QUALITY_COLORS: Record<string, string> = {
  high: 'from-emerald-500 to-green-500',
  medium: 'from-amber-500 to-yellow-500',
  low: 'from-orange-500 to-red-500',
  insufficient: 'from-slate-600 to-slate-500',
  pending: 'from-slate-700 to-slate-600',
};

const TIER_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  T1: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  T2: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  T3: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-600/20' },
};

const FIT_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  low: { bg: 'bg-red-500/10', text: 'text-red-400' },
  insufficient: { bg: 'bg-slate-500/10', text: 'text-slate-400' },
  unscored: { bg: 'bg-slate-500/10', text: 'text-slate-500' },
};

const PHASE_LABELS: Record<string, string> = {
  queued: 'Queued',
  loading_cache: 'Checking cached company profiles',
  commoncrawl_lookup: 'Searching Common Crawl archives',
  cc_complete: 'Archives searched, preparing live fetch',
  completed: 'Completed',
};

const FIELD_PRIORITIES: Record<string, number> = {
  company_name: 1, company_description: 2, industry: 3, business_model: 4,
  hq_location: 5, employee_count: 6, company_phone: 7, linkedin_url: 8,
  pricing_model: 9, funding_stage: 10, tech_stack: 11,
};

const ENRICHMENT_FIELDS: MappingSheetField[] = [
  { key: 'domain', label: 'Domain', required: true, description: 'Company website domain' },
  { key: 'company_name', label: 'Company Name', description: 'Display name' },
  { key: 'email', label: 'Work Email', description: 'We infer the domain from this' },
];

// ─── Enrichment Config Modal ──────────────────────────────────────────────────

interface EnrichmentConfig {
  techStack: boolean;
  growthSignals: boolean;
  firmographics: boolean;
  customSignal: string;
}

function EnrichmentConfigModal({
  domainCount,
  config,
  onChange,
  onConfirm,
  onCancel,
  loading,
}: {
  domainCount: number;
  config: EnrichmentConfig;
  onChange: (c: EnrichmentConfig) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl bg-[#0D1224] border border-slate-800/80 shadow-2xl shadow-black/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/60">
          <div>
            <p className="text-sm font-semibold text-white">Configure Enrichment</p>
            <p className="text-xs text-slate-400 mt-0.5">{domainCount} domain{domainCount !== 1 ? 's' : ''} queued</p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Recipes */}
        <div className="px-6 py-5 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-4">
            Data Recipes
          </p>

          {[
            {
              key: 'techStack' as keyof EnrichmentConfig,
              label: 'Tech Stack',
              description: 'Identify tools, platforms, and integrations the company uses',
            },
            {
              key: 'growthSignals' as keyof EnrichmentConfig,
              label: 'Growth Signals',
              description: 'Hiring velocity, funding stage, recent news, and expansion indicators',
            },
            {
              key: 'firmographics' as keyof EnrichmentConfig,
              label: 'Firmographics',
              description: 'Industry, employee count, HQ location, revenue range, business model',
            },
          ].map(({ key, label, description }) => (
            <label
              key={key}
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors
                ${config[key as keyof EnrichmentConfig]
                  ? 'bg-cyan-500/5 border-cyan-500/25'
                  : 'bg-[#0A0F1E] border-slate-800/60 hover:border-slate-700/60'
                }`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0
                ${config[key as keyof EnrichmentConfig]
                  ? 'bg-cyan-500 border-cyan-500'
                  : 'border-slate-600'
                }`}
              >
                {config[key as keyof EnrichmentConfig] && (
                  <Check className="w-2.5 h-2.5 text-white" />
                )}
              </div>
              <input
                type="checkbox"
                className="sr-only"
                checked={!!config[key as keyof EnrichmentConfig]}
                onChange={(e) => onChange({ ...config, [key]: e.target.checked })}
              />
              <div>
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{description}</p>
              </div>
            </label>
          ))}

          {/* Custom signal */}
          <div className="pt-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
              <Plus className="w-3 h-3" />
              Custom Signal
            </label>
            <textarea
              value={config.customSignal}
              onChange={(e) => onChange({ ...config, customSignal: e.target.value })}
              placeholder="e.g. Look for mentions of Salesforce migration, recent AWS partnership announcements, or job postings for RevOps roles…"
              rows={3}
              className="w-full bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800/60 bg-[#0A0F1E]">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-700/60 text-slate-400 hover:text-white text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-40 shadow-lg shadow-cyan-500/15 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Start Enrichment
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Parse CSV text helper ────────────────────────────────────────────────────

function parseCSVText(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split('\n');
  if (!lines.length) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let inQuote = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (ch === ',' && !inQuote) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter((l) => l.trim()).map(parseRow);
  return { headers, rows };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EnrichmentDashboard({ icpId, initialDomains }: Props) {
  // Core state
  const [domains, setDomains] = useState('');
  const [jobStatus, setJobStatus] = useState<EnrichmentJobStatus | null>(null);
  const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
  const [totalProfiles, setTotalProfiles] = useState(0);
  const [profileQuery, setProfileQuery] = useState('');
  const [profilePage, setProfilePage] = useState(0);
  const [scores, setScores] = useState<Record<string, ICPScoreResult>>({});
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastImport, setLastImport] = useState<ImportLeadsResult | null>(null);

  // Mapping flow
  const [mappingData, setMappingData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Store full parsed rows + selected indices so we can reconstruct a filtered CSV
  const [parsedCSVRows, setParsedCSVRows] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [pendingSelectedRows, setPendingSelectedRows] = useState<number[] | null>(null);

  // Enrichment config
  const [showConfig, setShowConfig] = useState(false);
  const [pendingDomains, setPendingDomains] = useState<string[]>([]);
  const [enrichConfig, setEnrichConfig] = useState<EnrichmentConfig>({
    techStack: true,
    growthSignals: true,
    firmographics: true,
    customSignal: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const pageSize = 50;

  const loadProfiles = useCallback(async () => {
    try {
      const { data } = await getProfiles(profilePage * pageSize, pageSize, undefined, profileQuery || undefined);
      setProfiles(data.profiles || []);
      setTotalProfiles(data.total || 0);
    } catch { /* non-critical */ }
  }, [profilePage, profileQuery]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);
  useEffect(() => { if (initialDomains) setDomains(initialDomains); }, [initialDomains]);
  useEffect(() => { setProfilePage(0); }, [profileQuery]);

  const formatFieldLabel = (field: string) =>
    field.replace(/^hq_/, 'HQ ').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const phaseLabel = jobStatus?.phase
    ? (PHASE_LABELS[jobStatus.phase] || jobStatus.phase.replace(/_/g, ' '))
    : null;

  const totalProfilePages = Math.max(1, Math.ceil(totalProfiles / pageSize));

  // ── Polling ──
  const startPolling = useCallback((jId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await getJobStatus(jId);
        setJobStatus(data);
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          if (data.status === 'completed') {
            toast.success(`Enrichment complete — ${data.completed}/${data.total} companies`);
            loadProfiles();
            if (icpId) {
              try {
                const { data: scoreData } = await scoreBatch(icpId);
                const scoreMap: Record<string, ICPScoreResult> = {};
                for (const s of (scoreData.scores || [])) scoreMap[s.domain] = s;
                setScores(scoreMap);
                toast.success('Accounts scored and tiered');
              } catch { /* non-critical */ }
            }
          } else {
            toast.error(data.error || 'Enrichment failed');
          }
        }
      } catch { /* poll silently */ }
    }, 2000);
  }, [icpId, loadProfiles]);

  // ── Domain paste flow ──
  const handleDomainSubmit = () => {
    const domainList = domains
      .split(/[\n,]/)
      .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, ''))
      .filter((d) => d && d.includes('.'));

    if (!domainList.length) { toast.error('Enter valid domains'); return; }
    if (domainList.length > 500) { toast.error('Maximum 500 domains'); return; }

    setPendingDomains(domainList);
    setShowConfig(true);
  };

  // ── CSV upload flow ──
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Read and parse as text for the mapping sheet
    try {
      const text = await file.text();
      const parsed = parseCSVText(text);
      if (!parsed.headers.length) {
        toast.error('Could not parse file — ensure it is a valid CSV');
        return;
      }
      setPendingFile(file);
      setParsedCSVRows(parsed); // keep full parsed data for row-filtered export
      setMappingData(parsed);
    } catch {
      // Fallback: just send directly (XLSX etc.)
      setPendingFile(file);
      setParsedCSVRows(null);
      setMappingData({ headers: ['(Could not preview XLSX)'], rows: [] });
    }
  };

  // Called when user confirms mapping in MappingSheet
  const handleMappingConfirm = (mapping: FieldMapping, selectedRows: number[]) => {
    setMappingData(null);

    if (pendingFile) {
      // Store which rows the user selected (indices into parsedCSVRows.rows)
      setPendingSelectedRows(selectedRows.length > 0 ? selectedRows : null);

      // If rows are selected and we know the domain column, extract domain list directly
      // so the domain-list path (no file upload) is used — more controlled
      if (parsedCSVRows && selectedRows.length > 0) {
        const domainHeader = Object.entries(mapping).find(([, v]) => v === 'domain')?.[0];
        const emailHeader = Object.entries(mapping).find(([, v]) => v === 'email')?.[0];

        if (domainHeader || emailHeader) {
          const colIndex = domainHeader
            ? parsedCSVRows.headers.indexOf(domainHeader)
            : parsedCSVRows.headers.indexOf(emailHeader!);
          const isDomain = !!domainHeader;

          const extracted = selectedRows
            .map((ri) => parsedCSVRows.rows[ri]?.[colIndex] ?? '')
            .map((val) => {
              if (!isDomain) {
                // email → extract domain
                const parts = val.split('@');
                return parts.length === 2 ? parts[1].toLowerCase().trim() : '';
              }
              return val.toLowerCase().trim()
                .replace(/^https?:\/\//, '')
                .replace(/^www\./, '')
                .replace(/\/$/, '');
            })
            .filter((d) => d && d.includes('.'));

          const deduped = [...new Set(extracted)];
          if (deduped.length > 0) {
            setPendingDomains(deduped);
            setPendingFile(null); // use domain list path, no file upload needed
            setParsedCSVRows(null);
            setShowConfig(true);
            return;
          }
        }
      }

      // Fallback: send the full file to importCSV
      setPendingDomains([]);
      setShowConfig(true);
    }
  };

  // Execute enrichment after config confirmed
  const handleStartEnrichment = async () => {
    setLoading(true);
    try {
      if (pendingFile && !pendingDomains.length) {
        // CSV upload path
        const { data } = await importCSV(pendingFile);
        setLastImport(data);
        setPendingFile(null);
        if (data.job_id) {
          setJobStatus({ job_id: data.job_id, status: 'queued', phase: 'queued', total: data.domains_imported, completed: 0, failed: 0, progress_pct: 0, results: [], error: null });
          startPolling(data.job_id);
          toast.success(`Imported ${data.leads_imported + data.leads_updated} leads · ${data.domains_imported} domains queued`);
        } else {
          setJobStatus(null);
          toast.success(`Imported ${data.leads_imported + data.leads_updated} leads`);
          if (data.rows_skipped > 0) toast.info(`${data.rows_skipped} rows skipped (no usable domain)`);
        }
        if (data.domains_truncated) toast.info('First 500 unique domains queued');
      } else {
        // Domain list path
        const { data } = await startBatchEnrichment(pendingDomains, icpId || undefined);
        setJobStatus({ job_id: data.job_id, status: 'queued', phase: 'queued', total: data.total, completed: 0, failed: 0, progress_pct: 0, results: [], error: null });
        startPolling(data.job_id);
        toast.success(`Enriching ${data.total} companies…`);
      }
      setShowConfig(false);
      setPendingDomains([]);
      setPendingSelectedRows(null);
      setParsedCSVRows(null);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Enrichment failed to start'));
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──

  // If we're in the mapping flow, show fullscreen MappingSheet
  if (mappingData) {
    return (
      <div className="h-full">
        <MappingSheet
          headers={mappingData.headers}
          rows={mappingData.rows}
          availableFields={ENRICHMENT_FIELDS}
          confirmLabel="Map & Configure Enrichment"
          onConfirm={handleMappingConfirm}
          onCancel={() => { setMappingData(null); setPendingFile(null); setParsedCSVRows(null); setPendingSelectedRows(null); }}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" id="enrichment-dashboard">
      <div className="max-w-6xl mx-auto p-6 pb-24 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Accounts</h1>
              <p className="text-xs text-slate-500">Enriched company intelligence · {totalProfiles} profiles</p>
            </div>
          </div>
          {totalProfiles > 0 && icpId && (
            <button
              onClick={async () => {
                try {
                  const { data: scoreData } = await scoreBatch(icpId);
                  const scoreMap: Record<string, ICPScoreResult> = {};
                  for (const s of (scoreData.scores || [])) scoreMap[s.domain] = s;
                  setScores(scoreMap);
                  toast.success('Scoring complete');
                } catch (err) {
                  toast.error(getErrorMessage(err, 'Scoring failed'));
                }
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-800/60 bg-[#0D1224] hover:border-slate-700 text-slate-400 hover:text-white text-xs font-medium transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-score
            </button>
          )}
        </div>

        {/* ── Import Panel ── */}
        <div className="bg-[#0D1224] border border-slate-800/60 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/60">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Import Companies</p>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex gap-3">
              <textarea
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
                placeholder="Paste domains, one per line or comma-separated&#10;e.g. stripe.com, notion.so, github.com"
                rows={3}
                className="flex-1 bg-[#0A0F1E] border border-slate-800/60 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all resize-none font-mono"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleDomainSubmit}
                disabled={loading || !domains.trim()}
                className="px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-40 shadow-lg shadow-cyan-500/15 flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Enrich Domains
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="px-4 py-2.5 bg-[#0A0F1E] border border-slate-700/60 hover:border-slate-600 text-slate-300 rounded-xl font-medium text-sm transition-all flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload CSV / XLSX
              </button>

              <button
                onClick={() => setDomains('notion.so\ngong.io\nramp.com\nintercom.com\nvanta.com\nmerge.dev')}
                disabled={loading}
                className="px-4 py-2.5 bg-[#0A0F1E] border border-slate-700/60 hover:border-slate-600 text-slate-400 rounded-xl font-medium text-sm transition-all"
              >
                Load Demo
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            <p className="text-xs text-slate-600">
              Upload a lead spreadsheet with work emails or company domains — we create lead records and enrich any business domains we can identify.
            </p>
          </div>
        </div>

        {/* ── Import Stats ── */}
        {lastImport && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Rows Processed', value: lastImport.rows_processed },
              { label: 'Leads Imported', value: lastImport.leads_imported },
              { label: 'Leads Updated', value: lastImport.leads_updated },
              { label: 'Domains Queued', value: lastImport.domains_imported },
              { label: 'Rows Skipped', value: lastImport.rows_skipped },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-slate-800/60 bg-[#0D1224] px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
                <p className="text-lg font-bold text-white mt-1">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Progress Bar ── */}
        {jobStatus && jobStatus.status !== 'completed' && (
          <div className="bg-[#0D1224] border border-slate-800/60 rounded-2xl p-5 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                <span className="text-sm font-semibold text-white">
                  Enriching {jobStatus.completed}/{jobStatus.total}
                </span>
              </div>
              <span className="text-sm text-slate-400 font-mono">{jobStatus.progress_pct}%</span>
            </div>
            {phaseLabel && <p className="mb-3 text-xs text-slate-400">{phaseLabel}</p>}
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${jobStatus.progress_pct}%` }}
              />
            </div>
            {jobStatus.failed > 0 && (
              <p className="mt-2 text-xs text-amber-400">{jobStatus.failed} failed — will retry on next run</p>
            )}
            {jobStatus.status === 'failed' && jobStatus.error && (
              <p className="mt-2 text-xs text-red-400 break-words">{jobStatus.error}</p>
            )}
          </div>
        )}

        {/* ── Results Grid ── */}
        {profiles.length > 0 && (
          <div className="bg-[#0D1224] border border-slate-800/60 rounded-2xl overflow-hidden">
            {/* Grid header */}
            <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-bold text-white">
                  Enriched Accounts
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300">
                  {totalProfiles}
                </span>
              </div>
              <div className="relative max-w-sm w-full">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  value={profileQuery}
                  onChange={(e) => setProfileQuery(e.target.value)}
                  placeholder="Search company, domain, or field…"
                  className="w-full rounded-xl border border-slate-800/60 bg-[#0A0F1E] py-2 pl-9 pr-4 text-sm text-white outline-none focus:border-cyan-500/40"
                />
              </div>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_140px_100px_120px_auto] gap-0 px-5 py-2.5 bg-[#0A0F1E] border-b border-slate-800/40">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Company</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Quality</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">ICP Score</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tier</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sources</span>
            </div>

            <div className="divide-y divide-slate-800/40">
              {profiles.map((profile) => {
                const score = scores[profile.domain];
                const isExpanded = expandedDomain === profile.domain;

                return (
                  <div key={profile.domain}>
                    <button
                      onClick={() => setExpandedDomain(isExpanded ? null : profile.domain)}
                      className="w-full grid grid-cols-[1fr_140px_100px_120px_auto] gap-0 items-center px-5 py-3.5 hover:bg-white/[0.02] transition-colors text-left"
                    >
                      {/* Company */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          : <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        }
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {profile.name || profile.domain}
                          </p>
                          <p className="text-xs text-slate-500 font-mono truncate">{profile.domain}</p>
                        </div>
                      </div>

                      {/* Quality bar */}
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${QUALITY_COLORS[profile.quality_tier] || QUALITY_COLORS.pending} rounded-full`}
                            style={{ width: `${profile.quality_score * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 font-mono w-8">
                          {(profile.quality_score * 100).toFixed(0)}%
                        </span>
                      </div>

                      {/* ICP Score */}
                      <div>
                        {score ? (
                          <span className={`text-sm font-bold ${FIT_COLORS[score.fit_category]?.text || 'text-slate-400'}`}>
                            {score.final_score?.toFixed(0) ?? '—'}
                            {score.score_low != null && score.score_high != null && (
                              <span className="font-normal ml-1 opacity-50 text-xs">
                                ±{((score.score_high - score.score_low) / 2).toFixed(0)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </div>

                      {/* Tier badge */}
                      <div>
                        {score?.tier ? (
                          <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold border
                            ${TIER_STYLES[score.tier]?.bg} ${TIER_STYLES[score.tier]?.text} ${TIER_STYLES[score.tier]?.border}`}>
                            {score.tier}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </div>

                      {/* Sources + link */}
                      <div className="flex items-center gap-1.5">
                        {(profile.sources_used || []).slice(0, 2).map((s) => (
                          <span key={s} className="px-1.5 py-0.5 bg-slate-800/60 text-slate-500 rounded text-[10px] font-mono">
                            {s.replace('commoncrawl_', 'CC:')}
                          </span>
                        ))}
                        {(profile.sources_used || []).length > 2 && (
                          <span className="text-[11px] text-slate-600">+{profile.sources_used.length - 2}</span>
                        )}
                        <a
                          href={`https://${profile.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 rounded-lg border border-slate-800/60 p-1.5 text-slate-500 hover:text-white transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-5 pb-5 md:pl-14 animate-in fade-in slide-in-from-top-1 duration-200">
                        {/* ICP Breakdown */}
                        {score && Object.keys(score.criterion_scores || {}).length > 0 && (
                          <div className="mb-3 bg-[#0A0F1E] rounded-xl border border-slate-800/40 p-4">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">ICP Score Breakdown</p>
                              <div className="flex items-center gap-2">
                                {score.tier && (
                                  <span className={`px-2 py-0.5 rounded text-xs font-bold border
                                    ${TIER_STYLES[score.tier]?.bg} ${TIER_STYLES[score.tier]?.text} ${TIER_STYLES[score.tier]?.border}`}>
                                    {score.tier}
                                  </span>
                                )}
                                <span className={`text-sm font-bold ${FIT_COLORS[score.fit_category]?.text || 'text-slate-400'}`}>
                                  {score.final_score?.toFixed(1) ?? '—'} / 100
                                </span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {Object.entries(score.criterion_scores).map(([criterion, val]) => (
                                <div key={criterion} className="flex items-center gap-3">
                                  <span className="text-[11px] text-slate-400 w-32 shrink-0 capitalize">
                                    {criterion.replace(/_/g, ' ')}
                                  </span>
                                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${(val ?? 0) >= 70 ? 'bg-emerald-500' : (val ?? 0) >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                      style={{ width: `${val ?? 0}%` }}
                                    />
                                  </div>
                                  <span className="text-[11px] font-mono text-slate-400 w-8 text-right">
                                    {val != null ? `${(val as number).toFixed(0)}` : '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {score.missing_fields.length > 0 && (
                              <p className="mt-2 text-[10px] text-amber-400">
                                Missing: {score.missing_fields.join(', ')}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Enriched fields */}
                        <div className="bg-[#0A0F1E] rounded-xl border border-slate-800/40 divide-y divide-slate-800/30 max-h-[420px] overflow-y-auto">
                          {Object.entries(profile.enriched_data || {})
                            .sort(([a], [b]) => {
                              const pa = FIELD_PRIORITIES[a] ?? 999;
                              const pb = FIELD_PRIORITIES[b] ?? 999;
                              return pa !== pb ? pa - pb : a.localeCompare(b);
                            })
                            .map(([field, dp]) => {
                              const point = dp as DataPoint;
                              const evidenceState = describeEvidence(point.evidence);
                              return (
                                <div key={field} className="px-4 py-3">
                                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
                                    <span className="text-xs text-slate-500 font-mono lg:w-32 shrink-0">
                                      {formatFieldLabel(field)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="max-h-24 overflow-y-auto rounded-lg bg-white/[0.02] px-3 py-2">
                                        <p className="text-sm text-white break-words whitespace-pre-wrap">
                                          {formatDataValue(point.value) || '—'}
                                        </p>
                                      </div>
                                      <div className="mt-2 rounded-lg border border-slate-800/50 bg-[#10172B] px-3 py-2">
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${evidenceState.tone}`}>
                                          {evidenceState.label}
                                        </span>
                                        <p className="mt-1.5 text-xs text-slate-400 break-words whitespace-pre-wrap">
                                          {evidenceState.detail}
                                        </p>
                                      </div>
                                      {point.source_url && (
                                        <div className="mt-2 rounded-lg border border-slate-800/50 bg-[#10172B] px-3 py-2">
                                          <p className="text-[11px] uppercase tracking-wider text-slate-500">Source</p>
                                          {isHttpUrl(point.source_url) ? (
                                            <a
                                              href={point.source_url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="mt-1 inline-block text-xs text-cyan-300 break-all underline underline-offset-2 hover:text-cyan-200"
                                            >
                                              {point.source_url}
                                            </a>
                                          ) : (
                                            <p className="mt-1 text-xs text-slate-400 break-all">{point.source_url}</p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 lg:self-center">
                                      <div className="w-10 h-1 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${point.confidence >= 0.7 ? 'bg-emerald-500' : point.confidence >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`}
                                          style={{ width: `${point.confidence * 100}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] text-slate-500 font-mono">
                                        {(point.confidence * 100).toFixed(0)}%
                                      </span>
                                      <span className="text-[10px] text-slate-600 font-mono max-w-[100px] truncate">
                                        {formatSourceLabel(point.source)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalProfilePages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-800/60 px-5 py-3">
                <span className="text-xs text-slate-500">
                  Page {profilePage + 1} of {totalProfilePages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setProfilePage((p) => Math.max(0, p - 1))}
                    disabled={profilePage === 0}
                    className="rounded-xl border border-slate-800/60 bg-[#0A0F1E] p-2 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setProfilePage((p) => Math.min(totalProfilePages - 1, p + 1))}
                    disabled={profilePage >= totalProfilePages - 1}
                    className="rounded-xl border border-slate-800/60 bg-[#0A0F1E] p-2 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {profiles.length === 0 && !jobStatus && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-slate-600" />
            </div>
            <p className="text-sm font-medium text-slate-400">No accounts enriched yet</p>
            <p className="text-xs text-slate-600 mt-1">Paste domains above or upload a lead spreadsheet to get started</p>
          </div>
        )}
      </div>

      {/* Enrichment Config Modal */}
      {showConfig && (
        <EnrichmentConfigModal
          domainCount={pendingDomains.length || (pendingFile ? 1 : 0)}
          config={enrichConfig}
          onChange={setEnrichConfig}
          onConfirm={handleStartEnrichment}
          onCancel={() => { setShowConfig(false); setPendingDomains([]); setPendingFile(null); }}
          loading={loading}
        />
      )}

      {/* Config icon shortcut in header */}
      <button
        onClick={() => setShowConfig(true)}
        className="fixed bottom-6 right-6 w-10 h-10 rounded-full bg-[#0D1224] border border-slate-700/60 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-600 transition-colors shadow-xl"
        title="Configure enrichment recipes"
      >
        <SlidersHorizontal className="w-4 h-4" />
      </button>
    </div>
  );
}
