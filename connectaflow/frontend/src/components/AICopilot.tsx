"use client";
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, X, Send, Sparkles, Zap, TrendingUp, MessageSquare,
  Target, ArrowRight, RefreshCw,
} from 'lucide-react';
import {
  queryCopilot, getOutcomesSummary, getSignalQueue, listReplies,
  OutcomesSummary, SignalQueueItem,
} from '../services/api';
import { getErrorMessage } from '../lib/errors';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface PipelineSnapshot {
  summary: OutcomesSummary | null;
  hotLeads: SignalQueueItem[];
  recentReplies: number;
  pendingReplies: number;
}

const SUGGESTED_QUERIES = [
  "What's working best right now?",
  'Who should I contact today?',
  'Why are my reply rates low?',
  'Which personas are responding?',
  'What signals should I act on?',
  'Which plays are performing best?',
];

export function AICopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'chat'>('dashboard');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<PipelineSnapshot>({
    summary: null, hotLeads: [], recentReplies: 0, pendingReplies: 0,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    try {
      const [summaryRes, signalsRes, repliesRes] = await Promise.all([
        getOutcomesSummary(),
        getSignalQueue(undefined, 5),
        listReplies({ limit: 100 }),
      ]);
      const allReplies = repliesRes.data.replies || [];
      setSnapshot({
        summary: summaryRes.data,
        hotLeads: signalsRes.data.queue?.slice(0, 5) || [],
        recentReplies: allReplies.filter((r) => r.classification === 'interested').length,
        pendingReplies: allReplies.filter((r) => !r.classification).length,
      });
    } catch {
      // Non-critical — silently fail
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadSnapshot();
  }, [isOpen, loadSnapshot]);

  const handleSendMessage = async (query?: string) => {
    const text = (query ?? inputValue).trim();
    if (!text || loading) return;
    const userMessage: Message = { role: 'user', content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);
    setActiveView('chat');
    try {
      const response = await queryCopilot(text);
      setMessages((prev) => [...prev, {
        role: 'assistant', content: response.data.answer, timestamp: new Date(),
      }]);
    } catch (error) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an issue: ${getErrorMessage(error, 'Unknown error')}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center"
      >
        <Bot className="w-6 h-6" />
        <span className="absolute w-14 h-14 rounded-full bg-cyan-500 animate-ping opacity-20" />
      </button>
    );
  }

  const s = snapshot.summary;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 h-[600px] bg-[#0D1224] border border-slate-800/60 rounded-2xl shadow-2xl flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-500/20 to-teal-600/20 border-b border-slate-800/60 rounded-t-2xl px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-cyan-400" />
          <span className="text-sm font-semibold text-white">AI Copilot</span>
          <span className="px-1.5 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-300">GTM</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={loadSnapshot} disabled={snapshotLoading} className="p-1 hover:bg-slate-700/40 rounded-lg transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${snapshotLoading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-slate-700/40 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-400 hover:text-white" />
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex border-b border-slate-800/60 flex-shrink-0">
        {(['dashboard', 'chat'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeView === v ? 'text-cyan-400 border-b-2 border-cyan-500' : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            {v === 'dashboard' ? '⚡ Pipeline Status' : '💬 Ask Anything'}
          </button>
        ))}
      </div>

      {/* DASHBOARD VIEW */}
      {activeView === 'dashboard' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {snapshotLoading && (
            <div className="text-center py-8">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-400">Loading pipeline…</p>
            </div>
          )}

          {!snapshotLoading && (
            <>
              {/* Pipeline health */}
              {s && (
                <div className="bg-[#10172B] rounded-xl border border-slate-800/60 p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-white">Pipeline Health</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Reply Rate', value: `${(s.reply_rate * 100).toFixed(1)}%`, color: s.reply_rate >= 0.2 ? 'text-green-400' : 'text-amber-400' },
                      { label: 'Conversion', value: `${(s.conversion_rate * 100).toFixed(1)}%`, color: s.conversion_rate >= 0.05 ? 'text-green-400' : 'text-amber-400' },
                      { label: 'Meetings', value: String(s.meetings_booked), color: 'text-purple-400' },
                      { label: 'Contacted', value: String(s.contacted), color: 'text-blue-400' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-slate-800/40 rounded-lg p-2">
                        <p className="text-xs text-slate-400">{label}</p>
                        <p className={`text-lg font-bold ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${
                    s.reply_rate >= 0.2 ? 'bg-green-500/10 text-green-300' :
                    s.reply_rate >= 0.1 ? 'bg-amber-500/10 text-amber-300' :
                    'bg-red-500/10 text-red-300'
                  }`}>
                    {s.reply_rate >= 0.2 ? '✅ Strong pipeline — keep the momentum'
                      : s.reply_rate >= 0.1 ? '⚠️ Reply rate below target — refine messaging'
                      : '🔴 Low reply rate — review plays and target audience'}
                  </div>
                </div>
              )}

              {/* Reply activity */}
              {(snapshot.recentReplies > 0 || snapshot.pendingReplies > 0) && (
                <div className="bg-[#10172B] rounded-xl border border-slate-800/60 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-semibold text-white">Reply Activity</span>
                  </div>
                  <div className="flex gap-2">
                    {snapshot.recentReplies > 0 && (
                      <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-green-400">{snapshot.recentReplies}</p>
                        <p className="text-xs text-green-300">Interested</p>
                      </div>
                    )}
                    {snapshot.pendingReplies > 0 && (
                      <div className="flex-1 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-amber-400">{snapshot.pendingReplies}</p>
                        <p className="text-xs text-amber-300">Need Review</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Hot leads to contact today */}
              {snapshot.hotLeads.length > 0 && (
                <div className="bg-[#10172B] rounded-xl border border-slate-800/60 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-white">Contact Today</span>
                    <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">{snapshot.hotLeads.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {snapshot.hotLeads.map((lead) => (
                      <div key={lead.domain} className="flex items-center gap-2 p-2 bg-slate-800/40 rounded-lg">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          lead.priority_band === 'act_now' ? 'bg-red-400' :
                          lead.priority_band === 'work_soon' ? 'bg-amber-400' : 'bg-slate-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate">{lead.company_name || lead.domain}</p>
                          <p className="text-xs text-slate-400 truncate">{lead.recommended_action}</p>
                        </div>
                        <span className="text-xs font-bold text-cyan-400 flex-shrink-0">{Math.round(lead.composite_score * 100)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested queries */}
              <div className="bg-[#10172B] rounded-xl border border-slate-800/60 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-white">Quick Insights</span>
                </div>
                <div className="space-y-1">
                  {SUGGESTED_QUERIES.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSendMessage(q)}
                      className="w-full text-left text-xs px-2 py-1.5 rounded-lg bg-slate-800/40 hover:bg-slate-700/60 text-slate-300 hover:text-cyan-300 transition-colors flex items-center gap-1.5"
                    >
                      <ArrowRight className="w-3 h-3 text-cyan-500 flex-shrink-0" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* CHAT VIEW */}
      {activeView === 'chat' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-6">
              <Sparkles className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
              <p className="text-sm text-slate-300 mb-1">GTM Copilot</p>
              <p className="text-xs text-slate-400">Ask about pipeline, signals, replies, plays, or who to contact today.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                msg.role === 'user' ? 'bg-cyan-500/20 text-cyan-100' : 'bg-[#10172B] text-slate-200 border border-slate-800/60'
              }`}>
                {msg.role === 'assistant'
                  ? msg.content.split('\n\n').map((p, idx) => <p key={idx} className={idx > 0 ? 'mt-2' : ''}>{p}</p>)
                  : msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#10172B] px-3 py-2 rounded-2xl flex gap-1 border border-slate-800/60">
                {[0, 0.1, 0.2].map((delay, i) => (
                  <div key={i} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-800/60 px-3 py-3 flex gap-2 flex-shrink-0">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask about pipeline, signals, replies…"
          disabled={loading}
          className="flex-1 bg-[#10172B] border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={loading || !inputValue.trim()}
          className="p-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
