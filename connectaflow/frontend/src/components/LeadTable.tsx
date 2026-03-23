"use client";

/**
 * LeadTable — Records module.
 *
 * Design: sheet-first, data-rich, editable, incremental.
 *
 * Layout:
 *   • Full-width spreadsheet grid with sticky header
 *   • Contact columns + inherited company columns side-by-side
 *   • Click any row → slide-over drawer for full editing + provenance
 *   • "+ AI Column" adds custom research columns (delta, only fetches new fields)
 *   • "Re-score" re-runs ICP scoring when new signals are present
 */

import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  Building2, Database, Save, ExternalLink, Snowflake, CalendarClock,
  Plus, X, Brain, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getLead, getLeads, updateLead, updateProfile, generateMeetingBrief,
  getMeetingBrief, applyCooldown, removeCooldown, scoreBatch,
  type DataPoint, type DataValue, type Lead, type MeetingBrief,
} from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { isHttpUrl, isTelValue } from '../lib/links';
import { describeEvidence, formatDataValue, formatSourceLabel } from '../lib/provenance';

// ─── Constants ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const STATUS_OPTIONS = ['Not Contacted', 'Contacted', 'Replied', 'Meeting Booked', 'Cool Down'];

const TIER_STYLES: Record<string, { bg: string; text: string }> = {
  T1: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  T2: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  T3: { bg: 'bg-slate-500/15', text: 'text-slate-400' },
};

const STATUS_STYLES: Record<string, string> = {
  'Meeting Booked': 'bg-emerald-500/12 text-emerald-300',
  'Cool Down': 'bg-blue-500/12 text-blue-300',
  'Replied': 'bg-purple-500/12 text-purple-300',
  'Contacted': 'bg-cyan-500/12 text-cyan-300',
  'Not Contacted': 'bg-slate-500/8 text-slate-400',
};

const INPUT_CLASS = 'w-full rounded-xl border border-slate-800/60 bg-[#0A0F1E] px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all';
const TEXTAREA_CLASS = `${INPUT_CLASS} resize-none`;

const PROFILE_FIELDS: { key: string; label: string; multiline?: boolean; numeric?: boolean }[] = [
  { key: 'company_name', label: 'Company Name' },
  { key: 'industry', label: 'Industry' },
  { key: 'business_model', label: 'Business Model' },
  { key: 'hq_location', label: 'HQ Location' },
  { key: 'company_phone', label: 'Company Phone' },
  { key: 'linkedin_url', label: 'LinkedIn', multiline: true },
  { key: 'employee_count', label: 'Employee Count', numeric: true },
  { key: 'pricing_model', label: 'Pricing Model' },
  { key: 'funding_stage', label: 'Funding Stage' },
  { key: 'tech_stack', label: 'Tech Stack', multiline: true },
  { key: 'company_description', label: 'Description', multiline: true },
];

// Company columns to show in the grid alongside lead columns
const COMPANY_GRID_COLS = ['industry', 'employee_count', 'funding_stage'];

// ─── Types ─────────────────────────────────────────────────────────────────

type LeadDraft = {
  first_name: string;
  last_name: string;
  email: string;
  domain: string;
  status: string;
  notes: string;
  follow_up_date: string;
};

type ProfileDraft = Record<string, string>;

type AIColumn = { id: string; label: string; query: string };
type AIColumnValues = Record<string, Record<string, string>>; // leadId → colId → value

// ─── Helpers ────────────────────────────────────────────────────────────────

function displayLeadName(lead: Lead): string {
  const parts = [lead.first_name, lead.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : lead.email.split('@')[0];
}

function normalizeFieldValue(val: string, numeric?: boolean): DataValue {
  if (numeric) { const n = Number(val); return isNaN(n) ? null : n; }
  return val || null;
}

function comparableValue(v: DataValue): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(',');
  return String(v);
}

function makeLeadDraft(lead: Lead): LeadDraft {
  return {
    first_name: lead.first_name ?? '',
    last_name: lead.last_name ?? '',
    email: lead.email,
    domain: lead.domain ?? '',
    status: lead.status,
    notes: String((lead.custom_data as Record<string, unknown>)?.notes ?? ''),
    follow_up_date: lead.follow_up_date
      ? new Date(lead.follow_up_date).toISOString().split('T')[0]
      : '',
  };
}

function makeProfileDraft(lead: Lead): ProfileDraft {
  const enriched = lead.company_profile?.enriched_data || {};
  const draft: ProfileDraft = {};
  for (const field of PROFILE_FIELDS) {
    draft[field.key] = formatDataValue((enriched[field.key] as DataPoint)?.value);
  }
  if (!draft.company_name && lead.company_profile?.name) {
    draft.company_name = lead.company_profile.name;
  }
  return draft;
}

function getCompanyValue(lead: Lead, fieldKey: string): string {
  const enriched = lead.company_profile?.enriched_data || {};
  const val = formatDataValue((enriched[fieldKey] as DataPoint)?.value);
  if (fieldKey === 'company_name' && !val) return lead.company_profile?.name ?? '';
  return val;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── AI Column Modal ─────────────────────────────────────────────────────────

function AIColumnModal({
  onAdd,
  onClose,
}: {
  onAdd: (label: string, query: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const [query, setQuery] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-[#0D1224] border border-slate-800/80 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/60">
          <div className="flex items-center gap-2.5">
            <Brain className="w-4 h-4 text-cyan-400" />
            <p className="text-sm font-semibold text-white">Add AI Column</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Column Name">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Primary Pain Point"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Research Query">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. What is the primary pain point this company's sales team faces? Answer in one concise sentence."
              rows={4}
              className={TEXTAREA_CLASS}
            />
          </Field>
          <p className="text-xs text-slate-500">
            AI will research each selected lead and populate this column. Only new fields are fetched (delta processing).
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800/60 bg-[#0A0F1E]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-700/60 text-slate-400 hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { if (label && query) { onAdd(label, query); onClose(); } }}
            disabled={!label || !query}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Column
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lead Drawer ─────────────────────────────────────────────────────────────

function LeadDrawer({
  lead,
  leadDraft,
  profileDraft,
  onLeadDraftChange,
  onProfileDraftChange,
  onSaveLead,
  onSaveProfile,
  onApplyCooldown,
  onRemoveCooldown,
  onClose,
  saving,
  savingProfile,
  cooldownLoading,
  meetingBrief,
  generatingBrief,
  showBriefPanel,
  onToggleBrief,
  changedProfileFieldCount,
  provenanceRows,
}: {
  lead: Lead;
  leadDraft: LeadDraft;
  profileDraft: ProfileDraft;
  onLeadDraftChange: (d: LeadDraft) => void;
  onProfileDraftChange: (d: ProfileDraft) => void;
  onSaveLead: () => void;
  onSaveProfile: () => void;
  onApplyCooldown: () => void;
  onRemoveCooldown: () => void;
  onClose: () => void;
  saving: boolean;
  savingProfile: boolean;
  cooldownLoading: boolean;
  meetingBrief: MeetingBrief | null;
  generatingBrief: boolean;
  showBriefPanel: boolean;
  onToggleBrief: () => void;
  changedProfileFieldCount: number;
  provenanceRows: { field: string; value: string; source: string; source_url?: string; confidence: number; evidence?: string }[];
}) {
  const [activeTab, setActiveTab] = useState<'contact' | 'company' | 'provenance'>('contact');

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col bg-[#0D1224] border-l border-slate-800/60 shadow-2xl shadow-black/40 animate-in slide-in-from-right-8 duration-200">
      {/* Drawer header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 shrink-0">
        <div>
          <p className="text-sm font-semibold text-white">{displayLeadName(lead)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{lead.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {lead.domain && (
            <a
              href={`https://${lead.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-1.5 border border-slate-800/60 text-slate-400 hover:text-white transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 border border-slate-800/60 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/60 px-5 shrink-0">
        {(['contact', 'company', 'provenance'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-3 text-xs font-semibold capitalize transition-colors border-b-2 -mb-px
              ${activeTab === tab
                ? 'text-white border-cyan-500'
                : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
          >
            {tab === 'provenance' ? 'Data Sources' : tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

        {/* Contact tab */}
        {activeTab === 'contact' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <input
                  value={leadDraft.first_name}
                  onChange={(e) => onLeadDraftChange({ ...leadDraft, first_name: e.target.value })}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Last name">
                <input
                  value={leadDraft.last_name}
                  onChange={(e) => onLeadDraftChange({ ...leadDraft, last_name: e.target.value })}
                  className={INPUT_CLASS}
                />
              </Field>
            </div>
            <Field label="Email">
              <input
                value={leadDraft.email}
                onChange={(e) => onLeadDraftChange({ ...leadDraft, email: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Domain">
              <input
                value={leadDraft.domain}
                onChange={(e) => onLeadDraftChange({ ...leadDraft, domain: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Status">
              <select
                value={leadDraft.status}
                onChange={(e) => onLeadDraftChange({ ...leadDraft, status: e.target.value })}
                className={INPUT_CLASS}
              >
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Follow-up Date">
              <input
                type="date"
                value={leadDraft.follow_up_date}
                onChange={(e) => onLeadDraftChange({ ...leadDraft, follow_up_date: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={leadDraft.notes}
                onChange={(e) => onLeadDraftChange({ ...leadDraft, notes: e.target.value })}
                rows={3}
                className={TEXTAREA_CLASS}
              />
            </Field>

            {/* ICP + Tier display */}
            {lead.icp_tier && (
              <div className="flex items-center gap-2 rounded-xl bg-[#0A0F1E] border border-slate-800/60 px-3 py-2.5">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${TIER_STYLES[lead.icp_tier]?.bg} ${TIER_STYLES[lead.icp_tier]?.text}`}>
                  {lead.icp_tier}
                </span>
                <span className="text-xs text-slate-400">ICP Tier</span>
                {lead.icp_final_score != null && (
                  <span className="text-xs text-slate-500 ml-auto">Score: {(lead.icp_final_score).toFixed(1)}</span>
                )}
              </div>
            )}

            {/* Cooldown */}
            {lead.status === 'Cool Down' && lead.cooldown_until && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/8 p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-blue-300 flex items-center gap-1">
                    <Snowflake className="w-3 h-3" /> In Cool-Down
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Until {new Date(lead.cooldown_until).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={onRemoveCooldown}
                  disabled={cooldownLoading}
                  className="text-xs px-2 py-1 rounded-lg bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
                >
                  {cooldownLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Lift'}
                </button>
              </div>
            )}

            {/* Meeting brief */}
            {leadDraft.status === 'Meeting Booked' && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-3 text-xs text-emerald-300">
                {generatingBrief
                  ? <span className="flex items-center gap-2"><RefreshCw className="w-3 h-3 animate-spin" /> Generating meeting brief…</span>
                  : meetingBrief
                    ? <button onClick={onToggleBrief} className="underline">{showBriefPanel ? 'Hide' : 'View'} meeting brief</button>
                    : <span>Save to auto-generate a meeting brief.</span>
                }
              </div>
            )}

            {showBriefPanel && meetingBrief && (
              <div className="rounded-xl border border-slate-800/60 bg-[#0A0F1E] p-4 space-y-3 text-xs">
                <div>
                  <p className="text-[11px] uppercase text-slate-500 mb-1">Company Overview</p>
                  <p className="text-slate-300">{meetingBrief.content_json.company_overview}</p>
                </div>
                {meetingBrief.content_json.key_talking_points?.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase text-slate-500 mb-1">Talking Points</p>
                    <ul className="space-y-1">
                      {meetingBrief.content_json.key_talking_points.map((pt, i) => (
                        <li key={i} className="text-slate-300">• {pt}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {meetingBrief.content_json.likely_objections?.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase text-slate-500 mb-1">Likely Objections</p>
                    <ul className="space-y-1">
                      {meetingBrief.content_json.likely_objections.map((obj, i) => (
                        <li key={i} className="text-amber-300">⚠ {obj}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={onSaveLead}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-cyan-500/12 px-4 py-2.5 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/18 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
              {lead.status !== 'Cool Down' && (
                <button
                  onClick={onApplyCooldown}
                  disabled={cooldownLoading}
                  className="flex items-center gap-2 rounded-xl bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-300 hover:bg-blue-500/18 disabled:opacity-50 transition-colors"
                >
                  {cooldownLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Snowflake className="w-4 h-4" />}
                  Cool Down
                </button>
              )}
            </div>
          </>
        )}

        {/* Company tab */}
        {activeTab === 'company' && (
          <>
            {!lead.company_profile ? (
              <div className="py-10 text-center">
                <Building2 className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No enriched company profile yet.</p>
                <p className="text-xs text-slate-600 mt-1">Enrich this domain in the Accounts module.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  <div className="rounded-lg bg-[#0A0F1E] border border-slate-800/60 px-3 py-2">
                    <p className="text-[11px] uppercase text-slate-500">Quality</p>
                    <p className="text-sm font-semibold text-white">
                      {lead.company_profile.quality_tier}
                      <span className="text-slate-500 ml-1 text-xs">
                        {((lead.company_profile.quality_score || 0) * 100).toFixed(0)}%
                      </span>
                    </p>
                  </div>
                  {lead.icp_tier && (
                    <div className="rounded-lg bg-[#0A0F1E] border border-slate-800/60 px-3 py-2">
                      <p className="text-[11px] uppercase text-slate-500">ICP Tier</p>
                      <p className={`text-sm font-bold ${TIER_STYLES[lead.icp_tier]?.text}`}>
                        {lead.icp_tier}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {PROFILE_FIELDS.map((field) => (
                    <Field key={field.key} label={field.label}>
                      {field.multiline ? (
                        <textarea
                          rows={3}
                          value={profileDraft[field.key] || ''}
                          onChange={(e) => onProfileDraftChange({ ...profileDraft, [field.key]: e.target.value })}
                          className={TEXTAREA_CLASS}
                        />
                      ) : (
                        <input
                          value={profileDraft[field.key] || ''}
                          onChange={(e) => onProfileDraftChange({ ...profileDraft, [field.key]: e.target.value })}
                          className={INPUT_CLASS}
                        />
                      )}
                    </Field>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={onSaveProfile}
                    disabled={savingProfile || changedProfileFieldCount === 0}
                    className="flex items-center gap-2 rounded-xl bg-emerald-500/12 px-4 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/18 disabled:opacity-50 transition-colors"
                  >
                    {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                    Save Overrides
                  </button>
                  {changedProfileFieldCount > 0 && (
                    <span className="text-xs text-slate-500">{changedProfileFieldCount} changed</span>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Provenance tab */}
        {activeTab === 'provenance' && (
          <>
            {provenanceRows.length === 0 ? (
              <div className="py-10 text-center">
                <Database className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No enriched fields for this company yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/40 rounded-xl border border-slate-800/60 overflow-hidden">
                {provenanceRows.map((row) => {
                  const evidence = describeEvidence(row.evidence);
                  return (
                    <div key={row.field} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            {row.field.replace(/_/g, ' ')}
                          </p>
                          <p className="mt-1 text-sm text-white break-words whitespace-pre-wrap">
                            {row.value || '—'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-mono text-slate-400">{Math.round((row.confidence || 0) * 100)}%</p>
                          <p className="text-[11px] text-slate-500">{formatSourceLabel(row.source)}</p>
                        </div>
                      </div>
                      {row.evidence && (
                        <div className="mt-2 rounded-lg border border-slate-800/50 bg-[#0A0F1E] px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${evidence.tone}`}>
                            {evidence.label}
                          </span>
                          <p className="mt-1.5 text-xs text-slate-400 break-words whitespace-pre-wrap">
                            {evidence.detail}
                          </p>
                        </div>
                      )}
                      {row.source_url && isHttpUrl(row.source_url) && (
                        <a
                          href={row.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs text-cyan-400 break-all underline underline-offset-2 hover:text-cyan-300"
                        >
                          {row.source_url}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function LeadTable({ icpId }: { icpId?: string | null }) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  // List state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState('all');
  const [enrichedOnly, setEnrichedOnly] = useState(false);

  // Selection / detail
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [leadDraft, setLeadDraft] = useState<LeadDraft | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({});

  // Actions
  const [savingLead, setSavingLead] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [cooldownLoading, setCooldownLoading] = useState(false);
  const [meetingBrief, setMeetingBrief] = useState<MeetingBrief | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [showBriefPanel, setShowBriefPanel] = useState(false);

  // AI Columns
  const [aiColumns, setAIColumns] = useState<AIColumn[]>([]);
  const [aiColValues] = useState<AIColumnValues>({});
  const [showAIModal, setShowAIModal] = useState(false);

  // Re-score
  const [rescoring, setRescoring] = useState(false);

  // ── Data loading ──

  const loadLeads = useCallback(async (skip = 0) => {
    setLoading(true);
    try {
      const { data } = await getLeads({
        skip, limit: PAGE_SIZE,
        status: statusFilter === 'all' ? undefined : statusFilter,
        q: query || undefined,
        enriched_only: enrichedOnly,
      });
      setLeads(data.leads || []);
      setTotal(data.total || 0);
      if (selectedLeadId && !data.leads.some((l) => l.id === selectedLeadId)) {
        setSelectedLeadId(null);
        setSelectedLead(null);
        setLeadDraft(null);
        setProfileDraft({});
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load leads'));
    } finally {
      setLoading(false);
    }
  }, [enrichedOnly, query, selectedLeadId, statusFilter]);

  const loadLeadDetail = useCallback(async (leadId: string) => {
    setDetailLoading(true);
    try {
      const { data } = await getLead(leadId);
      setSelectedLead(data);
      setLeadDraft(makeLeadDraft(data));
      setProfileDraft(makeProfileDraft(data));
      setSelectedLeadId(leadId);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load lead'));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => { setPage(0); setQuery(queryInput.trim()); }, 250);
    return () => window.clearTimeout(t);
  }, [queryInput]);

  useEffect(() => { void loadLeads(page * PAGE_SIZE); }, [loadLeads, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Derived values for detail panel ──

  const provenanceRows = useMemo(() => {
    const enriched = selectedLead?.company_profile?.enriched_data || {};
    return Object.entries(enriched)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([field, point]) => ({
        field,
        value: formatDataValue((point as DataPoint).value),
        source: (point as DataPoint).source,
        source_url: (point as DataPoint).source_url,
        confidence: (point as DataPoint).confidence,
        evidence: (point as DataPoint).evidence,
      }));
  }, [selectedLead]);

  const changedProfileFieldCount = useMemo(() => {
    if (!selectedLead) return 0;
    const enriched = selectedLead.company_profile?.enriched_data || {};
    return PROFILE_FIELDS.reduce((count, field) => {
      const draftValue = profileDraft[field.key] ?? '';
      let normalizedDraft = '';
      try { normalizedDraft = comparableValue(normalizeFieldValue(draftValue, field.numeric)); } catch { return count + 1; }
      const original = field.key === 'company_name'
        ? (selectedLead.company_profile?.name || formatDataValue((enriched[field.key] as DataPoint)?.value))
        : formatDataValue((enriched[field.key] as DataPoint)?.value);
      return normalizedDraft !== comparableValue(original) ? count + 1 : count;
    }, 0);
  }, [profileDraft, selectedLead]);

  // ── Actions ──

  const handleSaveLead = async () => {
    if (!selectedLead || !leadDraft) return;
    setSavingLead(true);
    const prevStatus = selectedLead.status;
    try {
      const nextCustomData = { ...(selectedLead.custom_data || {}), notes: leadDraft.notes || undefined };
      const { data } = await updateLead(selectedLead.id, {
        first_name: leadDraft.first_name || null,
        last_name: leadDraft.last_name || null,
        email: leadDraft.email,
        domain: leadDraft.domain || null,
        status: leadDraft.status,
        custom_data: nextCustomData,
        follow_up_date: leadDraft.follow_up_date || null,
      });
      toast.success('Lead saved');
      setSelectedLead((c) => c ? { ...c, ...data, custom_data: nextCustomData } : data);
      await loadLeads(page * PAGE_SIZE);
      await loadLeadDetail(selectedLead.id);

      if (leadDraft.status === 'Meeting Booked' && prevStatus !== 'Meeting Booked') {
        setGeneratingBrief(true);
        try {
          await generateMeetingBrief(selectedLead.id);
          const { data: brief } = await getMeetingBrief(selectedLead.id);
          setMeetingBrief(brief);
          setShowBriefPanel(true);
          toast.success('Meeting brief generated');
        } catch { /* non-critical */ } finally { setGeneratingBrief(false); }
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Save failed'));
    } finally {
      setSavingLead(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!selectedLead?.domain) return;
    setSavingProfile(true);
    try {
      const enriched = selectedLead.company_profile?.enriched_data || {};
      const fields = PROFILE_FIELDS.flatMap((field) => {
        const draftValue = profileDraft[field.key] ?? '';
        const normalizedDraft = comparableValue(normalizeFieldValue(draftValue, field.numeric));
        const original = field.key === 'company_name'
          ? (selectedLead.company_profile?.name || formatDataValue((enriched[field.key] as DataPoint)?.value))
          : formatDataValue((enriched[field.key] as DataPoint)?.value);
        if (normalizedDraft === comparableValue(original)) return [];
        return [{ field_name: field.key, value: normalizeFieldValue(draftValue, field.numeric), confidence: 0.98, evidence: 'Manual override', source: 'manual_override' }];
      });
      if (!fields.length) { toast.info('No changes to save'); return; }
      await updateProfile(selectedLead.domain, {
        name: fields.some((f) => f.field_name === 'company_name') ? String(profileDraft.company_name || '').trim() : undefined,
        fields,
      });
      toast.success('Company profile updated');
      await loadLeads(page * PAGE_SIZE);
      await loadLeadDetail(selectedLead.id);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Save failed'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleApplyCooldown = async () => {
    if (!selectedLead) return;
    setCooldownLoading(true);
    try {
      await applyCooldown(selectedLead.id, 6);
      toast.success('Lead placed in cool-down for 6 months');
      await loadLeads(page * PAGE_SIZE);
      await loadLeadDetail(selectedLead.id);
    } catch (err) { toast.error(getErrorMessage(err, 'Failed')); }
    finally { setCooldownLoading(false); }
  };

  const handleRemoveCooldown = async () => {
    if (!selectedLead) return;
    setCooldownLoading(true);
    try {
      await removeCooldown(selectedLead.id);
      toast.success('Cool-down lifted');
      await loadLeads(page * PAGE_SIZE);
      await loadLeadDetail(selectedLead.id);
    } catch (err) { toast.error(getErrorMessage(err, 'Failed')); }
    finally { setCooldownLoading(false); }
  };

  const handleRescore = async () => {
    if (!icpId) { toast.info('Set an active ICP in Mission first to enable scoring'); return; }
    setRescoring(true);
    try {
      await scoreBatch(icpId);
      toast.success('Leads re-scored — refresh to see updated tiers');
      await loadLeads(page * PAGE_SIZE);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Re-score failed'));
    } finally {
      setRescoring(false);
    }
  };

  const handleAddAIColumn = (label: string, query: string) => {
    const id = `ai_${Date.now()}`;
    setAIColumns((prev) => [...prev, { id, label, query }]);
    toast.success(`AI column "${label}" added — research runs in the background`);
  };

  const closeDrawer = () => {
    setSelectedLeadId(null);
    setSelectedLead(null);
    setLeadDraft(null);
    setProfileDraft({});
  };

  // ── Render ──

  return (
    <div className="h-full flex flex-col min-h-0 bg-[#0A0F1E]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-slate-800/60 bg-[#0D1224] shrink-0">
        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search leads…"
            className="w-full rounded-xl border border-slate-800/60 bg-[#0A0F1E] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-500/40"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => { setPage(0); setStatusFilter(e.target.value); }}
          className="rounded-xl border border-slate-800/60 bg-[#0A0F1E] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40"
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <label className="flex items-center gap-2 rounded-xl border border-slate-800/60 bg-[#0A0F1E] px-3 py-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={enrichedOnly}
            onChange={(e) => { setPage(0); setEnrichedOnly(e.target.checked); }}
            className="accent-cyan-500"
          />
          Enriched only
        </label>

        <div className="ml-auto flex items-center gap-2">
          {total > 0 && (
            <button
              onClick={() => void handleRescore()}
              disabled={rescoring}
              title={icpId ? 'Re-score all leads against the active ICP' : 'Set an active ICP in Mission first'}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-50
                ${icpId
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/15'
                  : 'border-slate-700/50 text-slate-500 cursor-default'
                }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rescoring ? 'animate-spin' : ''}`} />
              Re-score
            </button>
          )}

          <button
            onClick={() => setShowAIModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700/60 bg-[#0A0F1E] text-slate-300 hover:text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            AI Column
          </button>

          <button
            onClick={() => void loadLeads(page * PAGE_SIZE)}
            className="rounded-xl border border-slate-800/60 bg-[#0A0F1E] p-2 text-slate-400 hover:text-white transition-colors"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>

          <span className="text-xs text-slate-500 pl-1">{total} leads</span>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-sm border-collapse min-w-[800px]">
          <thead className="sticky top-0 z-10 bg-[#0D1224] border-b border-slate-800/60">
            <tr>
              <th className="w-8 px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 border-r border-slate-800/40">#</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Contact</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Company</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Industry</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Employees</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Funding</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tier</th>
              {aiColumns.map((col) => (
                <th key={col.id} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-cyan-500/70">
                  <span className="flex items-center gap-1.5">
                    <Brain className="w-3 h-3" />
                    {col.label}
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/30">
            {loading && leads.length === 0 ? (
              <tr>
                <td colSpan={10 + aiColumns.length} className="px-4 py-12 text-center">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-600 mx-auto" />
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={10 + aiColumns.length} className="px-4 py-14 text-center text-sm text-slate-500">
                  No leads matched this view.
                </td>
              </tr>
            ) : (
              leads.map((lead, idx) => {
                const isSelected = selectedLeadId === lead.id;
                const profile = lead.company_profile;
                return (
                  <tr
                    key={lead.id}
                    onClick={() => void loadLeadDetail(lead.id)}
                    className={`cursor-pointer transition-colors hover:bg-white/[0.025]
                      ${isSelected ? 'bg-cyan-500/[0.06]' : ''}`}
                  >
                    <td className="px-3 py-2.5 text-center text-xs text-slate-600 font-mono border-r border-slate-800/30">
                      {page * PAGE_SIZE + idx + 1}
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-2.5">
                      <p className="text-sm font-medium text-white leading-none">
                        {displayLeadName(lead)}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">{lead.email}</p>
                    </td>

                    {/* Company */}
                    <td className="px-4 py-2.5">
                      <p className="text-sm text-slate-200">
                        {profile?.name || getCompanyValue(lead, 'company_name') || (
                          <span className="text-slate-600">—</span>
                        )}
                      </p>
                      {lead.domain && (
                        <p className="text-xs text-slate-500 font-mono">{lead.domain}</p>
                      )}
                    </td>

                    {/* Industry */}
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      {getCompanyValue(lead, 'industry') || <span className="text-slate-700">—</span>}
                    </td>

                    {/* Employees */}
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      {getCompanyValue(lead, 'employee_count') || <span className="text-slate-700">—</span>}
                    </td>

                    {/* Funding */}
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      {getCompanyValue(lead, 'funding_stage') || <span className="text-slate-700">—</span>}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold w-fit
                          ${STATUS_STYLES[lead.status] || STATUS_STYLES['Not Contacted']}`}>
                          {lead.status === 'Cool Down' && <Snowflake className="w-2.5 h-2.5" />}
                          {lead.status}
                        </span>
                        {lead.follow_up_date && (() => {
                          const due = new Date(lead.follow_up_date);
                          const isDue = due <= new Date();
                          return (
                            <span className={`text-[10px] flex items-center gap-1 ${isDue ? 'text-amber-400' : 'text-slate-500'}`}>
                              <CalendarClock className="w-2.5 h-2.5" />
                              {due.toLocaleDateString()}
                            </span>
                          );
                        })()}
                      </div>
                    </td>

                    {/* Tier */}
                    <td className="px-4 py-2.5">
                      {lead.icp_tier ? (
                        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-bold
                          ${TIER_STYLES[lead.icp_tier]?.bg} ${TIER_STYLES[lead.icp_tier]?.text}`}>
                          {lead.icp_tier}
                        </span>
                      ) : (
                        <span className="text-slate-700 text-xs">—</span>
                      )}
                    </td>

                    {/* AI Columns */}
                    {aiColumns.map((col) => (
                      <td key={col.id} className="px-4 py-2.5 text-xs text-slate-400 max-w-[200px]">
                        {aiColValues[lead.id]?.[col.id] || (
                          <span className="text-slate-700">—</span>
                        )}
                      </td>
                    ))}

                    {/* Updated */}
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {new Date(lead.updated_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-800/60 px-4 py-3 bg-[#0D1224] shrink-0">
          <span className="text-xs text-slate-500">Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-xl border border-slate-800/60 bg-[#0A0F1E] p-2 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-xl border border-slate-800/60 bg-[#0A0F1E] p-2 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Side drawer for selected lead */}
      {selectedLeadId && selectedLead && leadDraft && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/30"
            onClick={closeDrawer}
          />
          <LeadDrawer
            lead={selectedLead}
            leadDraft={leadDraft}
            profileDraft={profileDraft}
            onLeadDraftChange={setLeadDraft}
            onProfileDraftChange={setProfileDraft}
            onSaveLead={() => void handleSaveLead()}
            onSaveProfile={() => void handleSaveProfile()}
            onApplyCooldown={() => void handleApplyCooldown()}
            onRemoveCooldown={() => void handleRemoveCooldown()}
            onClose={closeDrawer}
            saving={savingLead}
            savingProfile={savingProfile}
            cooldownLoading={cooldownLoading}
            meetingBrief={meetingBrief}
            generatingBrief={generatingBrief}
            showBriefPanel={showBriefPanel}
            onToggleBrief={() => setShowBriefPanel((v) => !v)}
            changedProfileFieldCount={changedProfileFieldCount}
            provenanceRows={provenanceRows}
          />
          {detailLoading && (
            <div className="fixed top-4 right-[496px] z-50">
              <div className="flex items-center gap-2 rounded-xl bg-[#0D1224] border border-slate-800/60 px-3 py-2 shadow-xl">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span className="text-xs text-slate-400">Loading…</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* AI Column Modal */}
      {showAIModal && (
        <AIColumnModal
          onAdd={handleAddAIColumn}
          onClose={() => setShowAIModal(false)}
        />
      )}
    </div>
  );
}
