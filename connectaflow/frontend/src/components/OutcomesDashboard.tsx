import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Mail, Linkedin, Phone, RefreshCw, Upload, Download,
  TrendingUp, Users, MessageSquare, Calendar, CheckCircle2,
  AlertCircle, ExternalLink, UserCheck, Layers, FileText,
  ChevronDown, ChevronRight, Briefcase, Bot,
} from 'lucide-react';
import {
  getOutcomesSummary, getOutcomesByChannel, getOutcomesByTier,
  getOutcomesByPlay, getOutcomesByPersona,
  syncSmartlead, getSmartleadStats,
  uploadLinkedinCSV, uploadCallsCSV,
  downloadLinkedinTemplate, downloadCallsTemplate,
  getMeetingBrief,
  OutcomesSummary, OutcomesByChannel, SmartleadStats, MeetingBrief,
} from '../services/api';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errors';

interface TierData {
  tier: string; total: number; replies: number;
  reply_rate: number; meetings_booked: number; conversion_rate: number;
}
interface PlayRow { play_id: string; play_name: string; replies: number; meetings: number; }
interface PersonaRow { persona_id: string; persona_name: string; replies: number; meetings: number; }

type Tab = 'summary' | 'email' | 'linkedin' | 'calls' | 'tiers' | 'plays' | 'personas';

const TABS: { key: Tab; label: string; icon?: React.ComponentType<{ className?: string }> }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { key: 'calls', label: 'Cold Calls', icon: Phone },
  { key: 'tiers', label: 'By Tier', icon: Layers },
  { key: 'plays', label: 'By Play', icon: Briefcase },
  { key: 'personas', label: 'By Persona', icon: UserCheck },
];

export function OutcomesDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [summary, setSummary] = useState<OutcomesSummary | null>(null);
  const [byChannel, setByChannel] = useState<OutcomesByChannel | null>(null);
  const [tiers, setTiers] = useState<TierData[]>([]);
  const [smartleadStats, setSmartleadStats] = useState<SmartleadStats[]>([]);
  const [plays, setPlays] = useState<PlayRow[]>([]);
  const [personas, setPersonas] = useState<PersonaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  // Meeting Brief modal
  const [briefLeadId, setBriefLeadId] = useState<string | null>(null);
  const [brief, setBrief] = useState<MeetingBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [showBrief, setShowBrief] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, channelRes, tierRes, statsRes, playsRes, personasRes] = await Promise.all([
        getOutcomesSummary(),
        getOutcomesByChannel(),
        getOutcomesByTier(),
        getSmartleadStats(),
        getOutcomesByPlay(),
        getOutcomesByPersona(),
      ]);
      setSummary(summaryRes.data);
      setByChannel(channelRes.data);
      setTiers(tierRes.data.tiers || []);
      setSmartleadStats(statsRes.data.stats || []);
      setPlays((playsRes.data as { by_play?: PlayRow[] }).by_play || []);
      setPersonas((personasRes.data as { by_persona?: PersonaRow[] }).by_persona || []);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load outcomes data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSyncSmartlead = async () => {
    setSyncing(true);
    try {
      await syncSmartlead();
      setLastSynced(new Date().toLocaleTimeString());
      toast.success('Smartlead data synced successfully');
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to sync Smartlead'));
    } finally {
      setSyncing(false);
    }
  };

  const handleLinkedinUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadLinkedinCSV(file);
      toast.success('LinkedIn CSV uploaded successfully');
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to upload LinkedIn CSV'));
    }
  };

  const handleCallsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadCallsCSV(file);
      toast.success('Calls CSV uploaded successfully');
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to upload calls CSV'));
    }
  };

  const openMeetingBrief = async (leadId: string) => {
    setBriefLeadId(leadId);
    setShowBrief(true);
    setBriefLoading(true);
    setBrief(null);
    try {
      const { data } = await getMeetingBrief(leadId);
      setBrief(data);
    } catch {
      toast.error('No meeting brief found. Generate one from the Lead record first.');
    } finally {
      setBriefLoading(false);
    }
  };

  // ── Sub-components ────────────────────────────────────────────────────────

  const MetricCard = ({
    label, value, icon: Icon, color,
  }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color: string }) => (
    <div className="bg-[#10172B] rounded-2xl border border-slate-800/60 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-400 mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
        </div>
        <Icon className={`w-8 h-8 ${color} opacity-40`} />
      </div>
    </div>
  );

  const TierBadge = ({ tier }: { tier: string }) => (
    <span className={`inline-block px-3 py-1 rounded-lg text-xs font-semibold ${
      tier === 'T1' ? 'bg-emerald-500/20 text-emerald-400' :
      tier === 'T2' ? 'bg-amber-500/20 text-amber-400' :
      tier === 'T3' ? 'bg-slate-500/20 text-slate-400' :
      'bg-slate-700/40 text-slate-500'
    }`}>{tier}</span>
  );

  const EmptyState = ({ msg }: { msg: string }) => (
    <div className="bg-[#10172B] rounded-2xl border border-slate-800/60 p-8 text-center">
      <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
      <p className="text-sm text-slate-400">{msg}</p>
    </div>
  );

  // ── Meeting Brief Modal ───────────────────────────────────────────────────

  const MeetingBriefModal = () => {
    if (!showBrief) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-[#0D1224] border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
          <div className="sticky top-0 bg-[#0D1224] border-b border-slate-800/60 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-cyan-400" />
              <span className="font-semibold text-white">Meeting Brief</span>
            </div>
            <button onClick={() => setShowBrief(false)} className="text-slate-400 hover:text-white text-lg leading-none">✕</button>
          </div>

          <div className="p-6">
            {briefLoading && (
              <div className="text-center py-10">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Loading brief…</p>
              </div>
            )}
            {!briefLoading && !brief && (
              <EmptyState msg="No meeting brief found. Open the lead record and click 'Generate Meeting Brief' first." />
            )}
            {!briefLoading && brief && (
              <div className="space-y-5">
                {/* ICP fit */}
                <div className="bg-[#10172B] rounded-xl border border-slate-800/60 p-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ICP Fit</h3>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full"
                        style={{ width: `${brief.content_json.icp_fit_score}%` }} />
                    </div>
                    <span className="text-sm font-bold text-cyan-400 w-12 text-right">{brief.content_json.icp_fit_score}%</span>
                    <TierBadge tier={brief.content_json.icp_tier} />
                  </div>
                  <p className="text-sm text-slate-300">{brief.content_json.icp_fit_reason}</p>
                </div>

                {/* Company overview */}
                <div className="bg-[#10172B] rounded-xl border border-slate-800/60 p-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Company Overview</h3>
                  <p className="text-sm text-slate-300">{brief.content_json.company_overview}</p>
                </div>

                {/* Active signals */}
                {brief.content_json.active_signals?.length > 0 && (
                  <div className="bg-[#10172B] rounded-xl border border-slate-800/60 p-4">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Active Buying Signals</h3>
                    <ul className="space-y-1">
                      {brief.content_json.active_signals.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                          <span className="text-green-400 mt-0.5">●</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Conversation history */}
                {brief.content_json.conversation_history && (
                  <div className="bg-[#10172B] rounded-xl border border-slate-800/60 p-4">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Conversation History</h3>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">{brief.content_json.conversation_history}</p>
                  </div>
                )}

                {/* Key talking points */}
                {brief.content_json.key_talking_points?.length > 0 && (
                  <div className="bg-[#10172B] rounded-xl border border-slate-800/60 p-4">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Key Talking Points</h3>
                    <ul className="space-y-1">
                      {brief.content_json.key_talking_points.map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                          <ChevronRight className="w-3 h-3 text-cyan-400 mt-1 flex-shrink-0" /> {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Objections + questions in 2 cols */}
                <div className="grid grid-cols-2 gap-4">
                  {brief.content_json.likely_objections?.length > 0 && (
                    <div className="bg-[#10172B] rounded-xl border border-slate-800/60 p-4">
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Likely Objections</h3>
                      <ul className="space-y-1">
                        {brief.content_json.likely_objections.map((o, i) => (
                          <li key={i} className="text-xs text-amber-300">⚠ {o}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {brief.content_json.suggested_questions?.length > 0 && (
                    <div className="bg-[#10172B] rounded-xl border border-slate-800/60 p-4">
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Suggested Questions</h3>
                      <ul className="space-y-1">
                        {brief.content_json.suggested_questions.map((q, i) => (
                          <li key={i} className="text-xs text-cyan-300">? {q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <MeetingBriefModal />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-cyan-400" />
          <h1 className="text-2xl font-bold text-white">Outcomes</h1>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-800/40 hover:bg-slate-700/60 text-slate-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800/60 overflow-x-auto pb-px">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium rounded-xl border transition-colors whitespace-nowrap ${
              activeTab === key
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                : 'border-slate-800/60 text-slate-400 hover:text-slate-300'
            }`}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {label}
          </button>
        ))}
      </div>

      {/* ── SUMMARY ── */}
      {activeTab === 'summary' && summary && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Replies" value={summary.replied} icon={MessageSquare} color="text-green-400" />
            <MetricCard label="Reply Rate" value={`${(summary.reply_rate * 100).toFixed(1)}%`} icon={TrendingUp} color="text-cyan-400" />
            <MetricCard label="Meetings Booked" value={summary.meetings_booked} icon={Calendar} color="text-purple-400" />
            <MetricCard label="Conversion Rate" value={`${(summary.conversion_rate * 100).toFixed(1)}%`} icon={CheckCircle2} color="text-emerald-400" />
          </div>
          <div className="bg-[#10172B] rounded-2xl border border-slate-800/60 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Pipeline Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-slate-400 mb-1">Total Leads</p><p className="text-xl font-bold text-slate-300">{summary.total_leads}</p></div>
              <div><p className="text-xs text-slate-400 mb-1">Contacted</p><p className="text-xl font-bold text-cyan-400">{summary.contacted}</p></div>
            </div>
            {/* Funnel bar */}
            {summary.total_leads > 0 && (
              <div className="mt-4 space-y-2">
                {[
                  { label: 'Contacted', val: summary.contacted, color: 'bg-blue-500' },
                  { label: 'Replied', val: summary.replied, color: 'bg-green-500' },
                  { label: 'Meetings', val: summary.meetings_booked, color: 'bg-purple-500' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-20">{label}</span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`}
                        style={{ width: `${Math.min(100, (val / summary.total_leads) * 100)}%` }} />
                    </div>
                    <span className="text-xs text-slate-300 w-8 text-right">{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── EMAIL (SMARTLEAD) ── */}
      {activeTab === 'email' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={handleSyncSmartlead}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              Sync Now
            </button>
            {lastSynced && <span className="text-xs text-slate-400">Last synced: {lastSynced}</span>}
          </div>

          {smartleadStats.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <MetricCard label="Emails Sent" value={smartleadStats.reduce((s, x) => s + x.emails_sent, 0)} icon={Mail} color="text-blue-400" />
                <MetricCard label="Opens" value={smartleadStats.reduce((s, x) => s + x.opens, 0)} icon={ExternalLink} color="text-cyan-400" />
                <MetricCard label="Avg Open Rate" value={`${(smartleadStats.reduce((s, x) => s + x.open_rate, 0) / smartleadStats.length * 100).toFixed(1)}%`} icon={TrendingUp} color="text-emerald-400" />
                <MetricCard label="Replies" value={smartleadStats.reduce((s, x) => s + x.replies, 0)} icon={MessageSquare} color="text-green-400" />
                <MetricCard label="Avg Reply Rate" value={`${(smartleadStats.reduce((s, x) => s + x.reply_rate, 0) / smartleadStats.length * 100).toFixed(1)}%`} icon={TrendingUp} color="text-cyan-400" />
                <MetricCard label="Meetings Booked" value={smartleadStats.reduce((s, x) => s + x.meetings_booked, 0)} icon={Calendar} color="text-purple-400" />
              </div>

              {/* Campaign breakdown + A/B comparison */}
              <div className="bg-[#10172B] rounded-2xl border border-slate-800/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800/60">
                  <h3 className="text-sm font-semibold text-white">Campaign Performance (A/B Comparison)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Compare performance across campaigns and email variants</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800/60">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Campaign</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Sent</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Opens</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Open Rate</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Replies</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Reply Rate</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Meetings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {smartleadStats.map((stat) => {
                        const topReplyRate = Math.max(...smartleadStats.map(s => s.reply_rate));
                        const isTop = stat.reply_rate >= topReplyRate && topReplyRate > 0;
                        return (
                          <tr key={stat.id} className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-300">{stat.campaign_name}</span>
                                {isTop && <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400">Best</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-300">{stat.emails_sent}</td>
                            <td className="px-4 py-3 text-slate-300">{stat.opens}</td>
                            <td className="px-4 py-3 text-slate-300">{(stat.open_rate * 100).toFixed(1)}%</td>
                            <td className="px-4 py-3 text-slate-300">{stat.replies}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-cyan-500 rounded-full"
                                    style={{ width: `${Math.min(100, stat.reply_rate * 100)}%` }} />
                                </div>
                                <span className="text-slate-300 text-xs">{(stat.reply_rate * 100).toFixed(1)}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-300">{stat.meetings_booked}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <EmptyState msg="No Smartlead data. Configure your API key in workspace settings and sync." />
          )}
        </div>
      )}

      {/* ── LINKEDIN ── */}
      {activeTab === 'linkedin' && byChannel && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              Upload CSV
              <input type="file" accept=".csv" onChange={handleLinkedinUpload} className="hidden" />
            </label>
            <button onClick={downloadLinkedinTemplate} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-700/60 text-slate-300 transition-colors">
              <Download className="w-4 h-4" />
              Download Template
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard label="Attempted" value={byChannel.linkedin.attempted} icon={Users} color="text-blue-400" />
            <MetricCard label="Replies" value={byChannel.linkedin.replies} icon={MessageSquare} color="text-green-400" />
            <MetricCard label="Reply Rate" value={`${(byChannel.linkedin.reply_rate * 100).toFixed(1)}%`} icon={TrendingUp} color="text-cyan-400" />
          </div>
          {byChannel.linkedin.meetings !== undefined && (
            <div className="bg-[#10172B] rounded-2xl border border-slate-800/60 p-4">
              <p className="text-xs text-slate-400 mb-1">Meetings from LinkedIn</p>
              <p className="text-xl font-bold text-purple-400">{byChannel.linkedin.meetings}</p>
            </div>
          )}
        </div>
      )}

      {/* ── CALLS ── */}
      {activeTab === 'calls' && byChannel && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              Upload CSV
              <input type="file" accept=".csv" onChange={handleCallsUpload} className="hidden" />
            </label>
            <button onClick={downloadCallsTemplate} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-700/60 text-slate-300 transition-colors">
              <Download className="w-4 h-4" />
              Download Template
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard label="Attempted" value={byChannel.calls.attempted} icon={Users} color="text-blue-400" />
            <MetricCard label="Replies" value={byChannel.calls.replies} icon={MessageSquare} color="text-green-400" />
            <MetricCard label="Reply Rate" value={`${(byChannel.calls.reply_rate * 100).toFixed(1)}%`} icon={TrendingUp} color="text-cyan-400" />
          </div>
        </div>
      )}

      {/* ── BY TIER ── */}
      {activeTab === 'tiers' && (
        tiers.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tiers.filter(t => ['T1','T2','T3'].includes(t.tier)).map((t) => (
                <div key={t.tier} className="bg-[#10172B] rounded-2xl border border-slate-800/60 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <TierBadge tier={t.tier} />
                    <span className="text-xs text-slate-400">{t.total} leads</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-400">Reply Rate</span><span className="text-cyan-400 font-semibold">{(t.reply_rate * 100).toFixed(1)}%</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Replies</span><span className="text-green-400">{t.replies}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Meetings</span><span className="text-purple-400">{t.meetings_booked}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Conversion</span><span className="text-emerald-400">{(t.conversion_rate * 100).toFixed(1)}%</span></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-[#10172B] rounded-2xl border border-slate-800/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-800/60">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Tier</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Total Leads</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Replies</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Reply Rate</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Meetings</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Conversion</th>
                </tr></thead>
                <tbody>
                  {tiers.map((tier) => (
                    <tr key={tier.tier} className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3"><TierBadge tier={tier.tier} /></td>
                      <td className="px-4 py-3 text-slate-300">{tier.total}</td>
                      <td className="px-4 py-3 text-slate-300">{tier.replies}</td>
                      <td className="px-4 py-3 text-slate-300">{(tier.reply_rate * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3 text-slate-300">{tier.meetings_booked}</td>
                      <td className="px-4 py-3 text-slate-300">{(tier.conversion_rate * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : <EmptyState msg="No tier data. Run ICP scoring to generate tiers." />
      )}

      {/* ── BY PLAY ── */}
      {activeTab === 'plays' && (
        plays.length > 0 ? (
          <div className="bg-[#10172B] rounded-2xl border border-slate-800/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/60">
              <h3 className="text-sm font-semibold text-white">Performance by Messaging Play</h3>
              <p className="text-xs text-slate-400 mt-0.5">Which plays are generating the most replies and meetings?</p>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-800/60">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Play</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Replies</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Meetings</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Performance</th>
              </tr></thead>
              <tbody>
                {[...plays].sort((a, b) => b.replies - a.replies).map((p) => {
                  const maxReplies = Math.max(...plays.map(x => x.replies), 1);
                  return (
                    <tr key={p.play_id} className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-medium">{p.play_name}</td>
                      <td className="px-4 py-3 text-green-400 font-semibold">{p.replies}</td>
                      <td className="px-4 py-3 text-purple-400">{p.meetings}</td>
                      <td className="px-4 py-3 w-40">
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-cyan-500 to-green-500 rounded-full"
                            style={{ width: `${(p.replies / maxReplies) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState msg="No play data yet. Log activities linked to plays to see performance breakdowns." />
      )}

      {/* ── BY PERSONA ── */}
      {activeTab === 'personas' && (
        personas.length > 0 ? (
          <div className="bg-[#10172B] rounded-2xl border border-slate-800/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/60">
              <h3 className="text-sm font-semibold text-white">Performance by Persona</h3>
              <p className="text-xs text-slate-400 mt-0.5">Which buyer roles are responding best to your outreach?</p>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-800/60">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Persona</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Replies</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Meetings</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Engagement</th>
              </tr></thead>
              <tbody>
                {[...personas].sort((a, b) => b.replies - a.replies).map((p) => {
                  const maxReplies = Math.max(...personas.map(x => x.replies), 1);
                  return (
                    <tr key={p.persona_id} className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-slate-500" />
                          <span className="text-slate-300 font-medium">{p.persona_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-green-400 font-semibold">{p.replies}</td>
                      <td className="px-4 py-3 text-purple-400">{p.meetings}</td>
                      <td className="px-4 py-3 w-40">
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                            style={{ width: `${(p.replies / maxReplies) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState msg="No persona data yet. Create personas in GTM Intelligence and link them to messaging plays." />
      )}
    </div>
  );
}
