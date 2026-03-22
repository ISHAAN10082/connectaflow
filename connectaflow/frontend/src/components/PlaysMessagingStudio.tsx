'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  RefreshCw,
  Wand2,
  Mail,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  X,
  Edit3,
  Save,
  BookOpen,
} from 'lucide-react';
import api, {
  listMissionICPs,
  ICP,
  listAssets,
  SocialProofAsset,
  listMessagingPlays,
  createMessagingPlay,
  deleteMessagingPlay,
  getMessagingPlay,
  updateMessagingPlay,
  generateMessagingComponents,
  regenerateMessagingComponents,
  generateEmailVariants,
  updatePlayVariation,
  addPlayVariation,
  deletePlayVariation,
  MessagingPlay,
  PlayComponent,
  PlayVariation,
  EmailVariant,
  listGTMContexts,
  GTMContextSummary,
} from '../services/api';
import { getErrorMessage } from '../lib/errors';

const COMPONENT_ORDER = [
  'subject',
  'greeting',
  'opener',
  'problem',
  'value_prop',
  'story',
  'cta',
  'closer',
  'variables',
];

export function PlaysMessagingStudio() {
  const [missions, setMissions] = useState<GTMContextSummary[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [plays, setPlays] = useState<MessagingPlay[]>([]);
  const [selectedPlay, setSelectedPlay] = useState<MessagingPlay | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingEmails, setGeneratingEmails] = useState(false);
  const [globalInstruction, setGlobalInstruction] = useState('');
  const [showNewPlayModal, setShowNewPlayModal] = useState(false);
  const [newPlayForm, setNewPlayForm] = useState({
    name: '',
    persona_id: '',
    icp_id: '',
  });
  const [personas, setPersonas] = useState<any[]>([]);
  const [icps, setIcps] = useState<ICP[]>([]);
  const [copiedVariantId, setCopiedVariantId] = useState<string | null>(null);
  const [editingPlayName, setEditingPlayName] = useState(false);
  const [editedPlayName, setEditedPlayName] = useState('');
  const [savingPlayName, setSavingPlayName] = useState(false);
  const [assets, setAssets] = useState<SocialProofAsset[]>([]);
  const [showAssetPanel, setShowAssetPanel] = useState(false);
  const [assetFilter, setAssetFilter] = useState<'all' | 'case_study' | 'testimonial' | 'metric'>('all');

  // Fetch missions on mount
  useEffect(() => {
    const fetchMissions = async () => {
      try {
        const { data } = await listGTMContexts();
        const contexts = data.contexts || [];
        setMissions(contexts);
        if (contexts.length > 0) {
          setSelectedMissionId(contexts[0].id);
        }
      } catch (error) {
        toast.error(`Failed to load missions: ${getErrorMessage(error, 'Unknown error')}`);
      }
    };
    fetchMissions();
  }, []);

  // Fetch social proof assets
  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const { data } = await listAssets();
        setAssets(data.assets || []);
      } catch {
        // non-critical
      }
    };
    fetchAssets();
  }, []);

  // Fetch personas and ICPs when mission changes
  useEffect(() => {
    if (!selectedMissionId) return;

    const fetchMissionData = async () => {
      try {
        const [icpRes, missionRes] = await Promise.all([
          listMissionICPs(selectedMissionId),
          api.get(`/gtm/${selectedMissionId}`),
        ]);
        setIcps(icpRes.data.icps || []);
        setPersonas(missionRes.data.personas || []);
        setNewPlayForm((prev) => ({
          ...prev,
          persona_id: '',
          icp_id: '',
        }));
      } catch (error) {
        toast.error(
          `Failed to load mission data: ${getErrorMessage(error, 'Unknown error')}`
        );
      }
    };
    fetchMissionData();
  }, [selectedMissionId]);

  // Fetch plays when mission changes
  useEffect(() => {
    if (!selectedMissionId) return;

    const fetchPlays = async () => {
      try {
        setLoading(true);
        const { data } = await listMessagingPlays(selectedMissionId);
        setPlays(data.plays || []);
        setSelectedPlay(null);
      } catch (error) {
        toast.error(`Failed to load plays: ${getErrorMessage(error, 'Unknown error')}`);
      } finally {
        setLoading(false);
      }
    };
    fetchPlays();
  }, [selectedMissionId]);

  // Fetch full play detail when selected play changes
  useEffect(() => {
    if (!selectedPlay) return;

    const fetchPlayDetail = async () => {
      try {
        setLoading(true);
        const { data: detail } = await getMessagingPlay(selectedPlay.id);
        setSelectedPlay(detail);
        setGlobalInstruction(detail.global_instruction || '');
        setEditingPlayName(false);
      } catch (error) {
        toast.error(`Failed to load play details: ${getErrorMessage(error, 'Unknown error')}`);
      } finally {
        setLoading(false);
      }
    };
    fetchPlayDetail();
  }, [selectedPlay?.id]);

  const handleCreatePlay = async () => {
    if (!selectedMissionId || !newPlayForm.name || !newPlayForm.persona_id) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      const { data: newPlay } = await createMessagingPlay({
        mission_id: selectedMissionId,
        name: newPlayForm.name,
        persona_id: newPlayForm.persona_id,
        icp_id: newPlayForm.icp_id || undefined,
      });
      setPlays((prev) => [...prev, newPlay]);
      setSelectedPlay(newPlay);
      setShowNewPlayModal(false);
      setNewPlayForm({ name: '', persona_id: '', icp_id: '' });
      toast.success('Play created successfully');
    } catch (error) {
      toast.error(`Failed to create play: ${getErrorMessage(error, 'Unknown error')}`);
    }
  };

  const handleDeletePlay = async (playId: string) => {
    try {
      await deleteMessagingPlay(playId);
      setPlays((prev) => prev.filter((p) => p.id !== playId));
      if (selectedPlay?.id === playId) {
        setSelectedPlay(null);
      }
      toast.success('Play deleted successfully');
    } catch (error) {
      toast.error(`Failed to delete play: ${getErrorMessage(error, 'Unknown error')}`);
    }
  };

  const handleRegenerateAll = async () => {
    if (!selectedPlay) return;

    try {
      setGenerating(true);
      await regenerateMessagingComponents(selectedPlay.id, globalInstruction);
      const { data: updated } = await getMessagingPlay(selectedPlay.id);
      setSelectedPlay(updated);
      toast.success('Components regenerated successfully');
    } catch (error) {
      toast.error(`Failed to regenerate components: ${getErrorMessage(error, 'Unknown error')}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateMessaging = async () => {
    if (!selectedPlay) return;

    try {
      setGenerating(true);
      await generateMessagingComponents(
        selectedPlay.id,
        globalInstruction
      );
      const { data: updated } = await getMessagingPlay(selectedPlay.id);
      setSelectedPlay(updated);
      toast.success('Messaging components generated successfully');
    } catch (error) {
      toast.error(
        `Failed to generate components: ${getErrorMessage(error, 'Unknown error')}`
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateEmails = async () => {
    if (!selectedPlay) return;

    try {
      setGeneratingEmails(true);
      await generateEmailVariants(selectedPlay.id);
      const { data: updated } = await getMessagingPlay(selectedPlay.id);
      setSelectedPlay(updated);
      toast.success('Email variants generated successfully');
    } catch (error) {
      toast.error(`Failed to generate emails: ${getErrorMessage(error, 'Unknown error')}`);
    } finally {
      setGeneratingEmails(false);
    }
  };

  const handleUpdateVariation = async (
    componentId: string,
    variationIndex: number,
    newContent: string
  ) => {
    if (!selectedPlay) return;

    const component = selectedPlay.components?.find((c) => c.id === componentId);
    const variation = component?.variations[variationIndex];
    if (!variation) return;

    try {
      await updatePlayVariation(variation.id, { content: newContent });
      const { data: updated } = await getMessagingPlay(selectedPlay.id);
      setSelectedPlay(updated);
    } catch (error) {
      toast.error(`Failed to update variation: ${getErrorMessage(error, 'Unknown error')}`);
    }
  };

  const handleAddVariation = async (componentId: string) => {
    if (!selectedPlay) return;

    try {
      await addPlayVariation({ component_id: componentId, content: '' });
      const { data: updated } = await getMessagingPlay(selectedPlay.id);
      setSelectedPlay(updated);
    } catch (error) {
      toast.error(`Failed to add variation: ${getErrorMessage(error, 'Unknown error')}`);
    }
  };

  const handleDeleteVariation = async (
    componentId: string,
    variationIndex: number
  ) => {
    if (!selectedPlay) return;

    const component = selectedPlay.components?.find((c) => c.id === componentId);
    const variation = component?.variations[variationIndex];
    if (!variation) return;

    try {
      await deletePlayVariation(variation.id);
      const { data: updated } = await getMessagingPlay(selectedPlay.id);
      setSelectedPlay(updated);
    } catch (error) {
      toast.error(`Failed to delete variation: ${getErrorMessage(error, 'Unknown error')}`);
    }
  };

  const handleCopyVariant = async (variant: EmailVariant) => {
    const text = `Subject: ${variant.subject}\n\n${variant.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedVariantId(variant.id);
      setTimeout(() => setCopiedVariantId(null), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleSavePlayName = async () => {
    if (!selectedPlay || !editedPlayName.trim()) {
      setEditingPlayName(false);
      return;
    }

    try {
      setSavingPlayName(true);
      await updateMessagingPlay(selectedPlay.id, { name: editedPlayName });
      setPlays((prev) =>
        prev.map((p) =>
          p.id === selectedPlay.id ? { ...p, name: editedPlayName } : p
        )
      );
      setSelectedPlay((prev) =>
        prev ? { ...prev, name: editedPlayName } : null
      );
      setEditingPlayName(false);
      toast.success('Play name updated');
    } catch (error) {
      toast.error(`Failed to update play name: ${getErrorMessage(error, 'Unknown error')}`);
    } finally {
      setSavingPlayName(false);
    }
  };

  const getPersonaName = (personaId: string) => {
    const persona = personas.find((p) => p.id === personaId);
    return persona?.name || personaId;
  };

  const getICPName = (icpId: string | null) => {
    if (!icpId) return null;
    const icp = icps.find((i) => i.id === icpId);
    return icp?.name || icpId;
  };

  const selectedMission = missions.find((m) => m.id === selectedMissionId);
  const componentCount = selectedPlay?.components?.length || 0;
  const componentMap: Record<string, PlayComponent> = {};
  if (selectedPlay?.components) {
    selectedPlay.components.forEach((comp) => {
      componentMap[comp.component_type] = comp;
    });
  }

  return (
    <div className="flex h-full bg-[#0A0F1E]">
      {/* Left Panel */}
      <div className="w-72 shrink-0 flex flex-col border-r border-slate-800/60 bg-[#0D1224]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800/60 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Messaging Plays</h2>
          <button
            onClick={() => setShowNewPlayModal(true)}
            className="p-2 rounded-lg hover:bg-[#10172B] text-cyan-500 transition-colors"
            title="Create new play"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Plays List */}
        <div className="flex-1 overflow-y-auto">
          {plays.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-sm">
              No plays created yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-2 p-3">
              {plays.map((play) => (
                <div
                  key={play.id}
                  onClick={() => setSelectedPlay(play)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors group ${
                    selectedPlay?.id === play.id
                      ? 'bg-[#10172B] border border-cyan-500/30'
                      : 'bg-[#0D1224] border border-slate-800/60 hover:bg-[#10172B]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {play.name}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-xs px-2 py-1 rounded bg-cyan-500/20 text-cyan-400">
                          {getPersonaName(play.persona_id)}
                        </span>
                        {play.icp_id && (
                          <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400">
                            {getICPName(play.icp_id)}
                          </span>
                        )}
                        <span
                          className={`text-xs px-2 py-1 rounded font-semibold ${
                            play.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : play.status === 'archived'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-slate-500/20 text-slate-400'
                          }`}
                        >
                          {play.status || 'draft'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePlay(play.id);
                      }}
                      className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all"
                      title="Delete play"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col bg-[#0A0F1E] overflow-hidden">
        {!selectedPlay ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Mail size={48} className="mx-auto text-slate-600 mb-4" />
              <p className="text-slate-400 mb-2">Select a play or create a new one</p>
              <button
                onClick={() => setShowNewPlayModal(true)}
                className="mt-4 px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors flex items-center gap-2 mx-auto"
              >
                <Plus size={16} />
                Create Play
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Play Header */}
            <div className="p-6 border-b border-slate-800/60 flex-shrink-0">
              <div className="flex items-center gap-3 mb-3">
                {editingPlayName ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editedPlayName}
                      onChange={(e) => setEditedPlayName(e.target.value)}
                      className="flex-1 px-3 py-2 rounded bg-[#10172B] border border-slate-800/60 text-white text-xl font-semibold focus:outline-none focus:border-cyan-500/60"
                      autoFocus
                    />
                    <button
                      onClick={handleSavePlayName}
                      disabled={savingPlayName}
                      className="p-2 rounded hover:bg-[#10172B] text-cyan-500 transition-colors"
                    >
                      <Save size={18} />
                    </button>
                    <button
                      onClick={() => setEditingPlayName(false)}
                      className="p-2 rounded hover:bg-[#10172B] text-slate-400 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <h2
                    onClick={() => {
                      setEditingPlayName(true);
                      setEditedPlayName(selectedPlay.name);
                    }}
                    className="text-2xl font-semibold text-white cursor-pointer hover:text-cyan-400 transition-colors flex-1"
                  >
                    {selectedPlay.name}
                  </h2>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs px-3 py-1.5 rounded bg-cyan-500/20 text-cyan-400 font-medium">
                  {getPersonaName(selectedPlay.persona_id)}
                </span>
                {selectedPlay.icp_id && (
                  <span className="text-xs px-3 py-1.5 rounded bg-blue-500/20 text-blue-400 font-medium">
                    {getICPName(selectedPlay.icp_id)}
                  </span>
                )}
              </div>
            </div>

            {/* Global Instruction Bar */}
            <div className="px-6 py-4 border-b border-slate-800/60 flex-shrink-0 flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase">
                  Global Instruction
                </label>
                <input
                  type="text"
                  value={globalInstruction}
                  onChange={(e) => setGlobalInstruction(e.target.value)}
                  placeholder="Add guidance for all message variations..."
                  className="w-full px-3 py-2 rounded bg-[#10172B] border border-slate-800/60 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
                />
              </div>
              {componentCount > 0 && (
                <button
                  onClick={handleRegenerateAll}
                  disabled={generating}
                  className="mt-6 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors flex items-center gap-2 font-medium text-sm disabled:opacity-50"
                >
                  <RefreshCw size={16} className={generating ? 'animate-spin' : ''} />
                  Regenerate All
                </button>
              )}
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
              {componentCount === 0 ? (
                <div className="p-6 flex flex-col items-center justify-center h-full">
                  <Wand2 size={48} className="text-slate-600 mb-4" />
                  <p className="text-slate-400 mb-4 text-center">
                    No messaging components yet. Generate them to get started.
                  </p>
                  <button
                    onClick={handleGenerateMessaging}
                    disabled={generating}
                    className="px-6 py-3 rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition-colors font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    <Wand2 size={18} />
                    Generate Messaging
                  </button>
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {/* Messaging Anatomy Table */}
                  {loading ? (
                    <div className="space-y-3">
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className="h-12 bg-[#10172B]/50 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="border border-slate-800/60 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800/60 bg-[#0D1224]">
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">
                                Component
                              </th>
                              {[0, 1, 2].map((i) => (
                                <th
                                  key={i}
                                  className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase min-w-[250px]"
                                >
                                  Variation {String.fromCharCode(65 + i)}
                                </th>
                              ))}
                              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase w-12">
                                +
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {COMPONENT_ORDER.map((componentType) => {
                              const component = componentMap[componentType];
                              if (!component) return null;

                              return (
                                <tr
                                  key={componentType}
                                  className="border-b border-slate-800/60 hover:bg-[#10172B]/30"
                                >
                                  <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase w-28 shrink-0">
                                    {componentType.replace(/_/g, ' ')}
                                  </td>
                                  {[0, 1, 2].map((variationIndex) => {
                                    const variation =
                                      component.variations?.[variationIndex];
                                    return (
                                      <td
                                        key={variationIndex}
                                        className="px-4 py-3 min-w-[250px]"
                                      >
                                        {variation ? (
                                          <div className="group relative">
                                            <textarea
                                              value={variation.content}
                                              onChange={(e) => {
                                                // Update local state for UI feedback
                                                const newContent =
                                                  e.target.value;
                                              }}
                                              onBlur={(e) => {
                                                if (
                                                  e.currentTarget.value !==
                                                  variation.content
                                                ) {
                                                  handleUpdateVariation(
                                                    component.id,
                                                    variationIndex,
                                                    e.currentTarget.value
                                                  );
                                                }
                                              }}
                                              className="w-full px-2 py-1.5 rounded bg-transparent border border-slate-800/60 text-white text-sm focus:outline-none focus:border-cyan-500/60 resize-none"
                                              style={{ minHeight: '60px' }}
                                            />
                                            <button
                                              onClick={() =>
                                                handleDeleteVariation(
                                                  component.id,
                                                  variationIndex
                                                )
                                              }
                                              className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all"
                                              title="Delete variation"
                                            >
                                              <X size={14} />
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="px-2 py-1.5 text-slate-500 text-sm italic">
                                            Empty
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={() =>
                                        handleAddVariation(component.id)
                                      }
                                      className="p-1.5 rounded hover:bg-[#10172B] text-cyan-500 transition-colors"
                                      title="Add variation"
                                    >
                                      <Plus size={16} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Social Proof Asset Library */}
                  <div className="border border-slate-800/60 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setShowAssetPanel(!showAssetPanel)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#0D1224] hover:bg-slate-800/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <BookOpen size={16} className="text-purple-400" />
                        <span className="text-sm font-semibold text-white">Social Proof Library</span>
                        {assets.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">{assets.length}</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{showAssetPanel ? '▲ Hide' : '▼ Show'} — AI uses these during message generation</span>
                    </button>

                    {showAssetPanel && (
                      <div className="bg-[#0A0F1E] border-t border-slate-800/60 p-4">
                        {/* Filter tabs */}
                        <div className="flex gap-2 mb-3">
                          {(['all', 'case_study', 'testimonial', 'metric'] as const).map((f) => (
                            <button
                              key={f}
                              onClick={() => setAssetFilter(f)}
                              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                                assetFilter === f ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-800/40 text-slate-400 hover:text-slate-300'
                              }`}
                            >
                              {f === 'all' ? 'All' : f.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                            </button>
                          ))}
                        </div>

                        {assets.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-4">
                            No assets yet. Add case studies, testimonials & metrics in GTM Intelligence → Assets to give AI better messaging context.
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {assets
                              .filter((a) => assetFilter === 'all' || a.type === assetFilter)
                              .map((asset) => (
                                <div key={asset.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-800/30 border border-slate-800/60">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold flex-shrink-0 ${
                                    asset.type === 'case_study' ? 'bg-blue-500/20 text-blue-400' :
                                    asset.type === 'testimonial' ? 'bg-green-500/20 text-green-400' :
                                    'bg-amber-500/20 text-amber-400'
                                  }`}>
                                    {asset.type.replace('_', ' ')}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-white">{asset.title}</p>
                                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{asset.content}</p>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Generate Emails Button */}
                  {componentCount > 0 && (
                    <button
                      onClick={handleGenerateEmails}
                      disabled={generatingEmails}
                      className="w-full px-6 py-3 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Mail size={18} />
                      Generate Full Emails
                    </button>
                  )}

                  {/* Email Variants */}
                  {selectedPlay.email_variants &&
                    selectedPlay.email_variants.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-4">
                          Email Variants
                        </h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {selectedPlay.email_variants.map((variant) => (
                            <div
                              key={variant.id}
                              className="p-4 rounded-lg border border-slate-800/60 bg-[#0D1224]"
                            >
                              <div className="flex items-start justify-between gap-2 mb-3">
                                <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400 font-semibold">
                                  {variant.style_label}
                                </span>
                                <button
                                  onClick={() => handleCopyVariant(variant)}
                                  className="p-1.5 rounded hover:bg-[#10172B] text-cyan-500 transition-colors"
                                  title="Copy email"
                                >
                                  {copiedVariantId === variant.id ? (
                                    <Check size={16} />
                                  ) : (
                                    <Copy size={16} />
                                  )}
                                </button>
                              </div>
                              <p className="text-sm font-bold text-white mb-2">
                                {variant.subject}
                              </p>
                              <p className="text-xs text-slate-400 whitespace-pre-wrap max-h-40 overflow-y-auto">
                                {variant.body}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New Play Modal */}
      {showNewPlayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#0D1224] rounded-lg p-6 max-w-md w-full mx-4 border border-slate-800/60">
            <h3 className="text-xl font-semibold text-white mb-4">
              Create New Play
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Play Name
                </label>
                <input
                  type="text"
                  value={newPlayForm.name}
                  onChange={(e) =>
                    setNewPlayForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  placeholder="Enter play name"
                  className="w-full px-3 py-2 rounded bg-[#10172B] border border-slate-800/60 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Mission
                </label>
                <select
                  value={selectedMissionId || ''}
                  onChange={(e) => {
                    setSelectedMissionId(e.target.value);
                    setNewPlayForm((prev) => ({
                      ...prev,
                      persona_id: '',
                      icp_id: '',
                    }));
                  }}
                  className="w-full px-3 py-2 rounded bg-[#10172B] border border-slate-800/60 text-white focus:outline-none focus:border-cyan-500/60"
                >
                  <option value="">Select a mission</option>
                  {missions.map((mission) => (
                    <option key={mission.id} value={mission.id}>
                      {mission.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Persona
                </label>
                <select
                  value={newPlayForm.persona_id}
                  onChange={(e) =>
                    setNewPlayForm((prev) => ({
                      ...prev,
                      persona_id: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 rounded bg-[#10172B] border border-slate-800/60 text-white focus:outline-none focus:border-cyan-500/60"
                >
                  <option value="">Select a persona</option>
                  {personas.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  ICP (Optional)
                </label>
                <select
                  value={newPlayForm.icp_id}
                  onChange={(e) =>
                    setNewPlayForm((prev) => ({
                      ...prev,
                      icp_id: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 rounded bg-[#10172B] border border-slate-800/60 text-white focus:outline-none focus:border-cyan-500/60"
                >
                  <option value="">Select an ICP (optional)</option>
                  {icps.map((icp) => (
                    <option key={icp.id} value={icp.id}>
                      {icp.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewPlayModal(false);
                  setNewPlayForm({ name: '', persona_id: '', icp_id: '' });
                }}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-800/60 text-slate-300 hover:bg-[#10172B] transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePlay}
                className="flex-1 px-4 py-2 rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition-colors font-medium"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
