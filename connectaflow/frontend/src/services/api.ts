import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const WORKSPACE_STORAGE_KEY = 'connectaflow.workspaceId';

const api = axios.create({
    baseURL: API_BASE,
    timeout: 30000,
});

const readActiveWorkspaceId = () => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
};

export const getActiveWorkspaceId = () => readActiveWorkspaceId();

export const setActiveWorkspaceId = (workspaceId: string | null) => {
    if (typeof window === 'undefined') return;
    if (!workspaceId) {
        window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
        return;
    }
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
};

api.interceptors.request.use((config) => {
    const workspaceId = readActiveWorkspaceId();
    if (workspaceId) {
        config.headers = config.headers ?? {};
        config.headers['X-Workspace-Id'] = workspaceId;
    }
    return config;
});

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type DataValue = string | number | boolean | null | string[] | number[] | Record<string, unknown>;
export type JsonRecord = Record<string, unknown>;

export interface DataPoint {
    value: DataValue;
    confidence: number;
    source: string;
    source_url?: string;
    evidence?: string;
}

export interface CompanyProfile {
    domain: string;
    name: string | null;
    enriched_data: Record<string, DataPoint>;
    quality_score: number;
    quality_tier: string;
    sources_used: string[];
    enriched_at: string | null;
    fetch_metadata?: JsonRecord;
}

export interface LeadCompanyProfile extends Partial<CompanyProfile> {
    fetch_metadata?: JsonRecord;
}

export interface Lead {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    domain: string | null;
    status: string;
    score: number;
    enrichment_status: string;
    custom_data: JsonRecord;
    created_at: string;
    updated_at: string;
    company_profile?: LeadCompanyProfile;
    // ICP scoring (populated when domain has been ICP scored)
    icp_tier?: string | null;
    icp_final_score?: number | null;
    // Cooldown / follow-up
    follow_up_date?: string | null;
    cooldown_until?: string | null;
    contacts_without_reply?: number;
}

export interface ICPDefinition {
    id: string;
    name: string;
    product_description: string;
    customer_examples: string[];
    rubric: ICPRubric;
    created_at: string;
}

export interface ICPSyncResult {
    icp_id: string;
    name: string;
    rubric: ICPRubric;
    status: string;
}

export interface ICPRubric {
    criteria: ICPCriterion[];
    required_fields: string[];
    description: string;
    exclusions: string[];
}

export interface ICPCriterion {
    field_name: string;
    label: string;
    weight: number;
    match_type: string;
    match_value: DataValue | { min?: number; max?: number };
}

export interface ICPScoreResult {
    domain: string;
    name: string | null;
    final_score: number | null;
    score_low: number | null;
    score_high: number | null;
    fit_category: string;
    quality_score: number;
    criterion_scores: Record<string, number | null>;
    missing_fields: string[];
    tier?: string | null;
}

export interface SignalQueueItem {
    domain: string;
    company_name: string;
    composite_score: number;
    icp_score: number;
    quality_score: number;
    signal_score: number;
    signals: SignalDetail[];
    signal_count: number;
    priority_band: 'act_now' | 'work_soon' | 'review_first';
    recommended_action: string;
    ranking_reason: string;
}

export interface SignalDetail {
    type: string;
    label: string;
    strength: number;
    effective_strength: number;
    recency_decay: number;
    evidence: string;
    source_url: string;
    detected_at: string;
    age_days: number;
}

export interface SignalQueueSummary {
    act_now: number;
    work_soon: number;
    review_first: number;
}

export interface EnrichmentJobStatus {
    job_id: string;
    status: string;
    phase?: string | null;
    total: number;
    completed: number;
    failed: number;
    progress_pct: number;
    results: EnrichmentResult[];
    error?: string | null;
}

export interface EnrichmentResult {
    domain: string;
    quality_score: number;
    quality_tier: string;
    sources: string[];
}

export interface ImportLeadsResult {
    job_id: string | null;
    domains_imported: number;
    leads_imported: number;
    leads_updated: number;
    rows_processed: number;
    rows_skipped: number;
    domains_truncated?: number;
    status: string;
}

export interface LeadListParams {
    skip?: number;
    limit?: number;
    status?: string;
    q?: string;
    enriched_only?: boolean;
}

export interface ProfileFieldPatch {
    field_name: string;
    value: DataValue;
    confidence?: number;
    evidence?: string;
    source?: string;
}

export interface ProfileUpdateRequest {
    name?: string | null;
    fields: ProfileFieldPatch[];
}

export interface HealthStatus {
    status: string;
    version?: string;
    providers?: {
        groq?: boolean;
        gemini?: boolean;
    };
}

export interface WorkspaceData {
    id: string;
    name: string;
    settings?: JsonRecord;
}

// ─────────────────────────────────────────────────────────────
// GTM Intelligence Types
// ─────────────────────────────────────────────────────────────

export interface PersonaData {
    id: string;
    gtm_context_id: string;
    name: string;
    department: string;
    seniority: string;
    job_titles: string[];
    responsibilities: string[];
    kpis: string[];
    pain_points: string[];
    decision_role: string;
    // Deep buyer psychology
    buying_style: string;
    information_diet: string[];
    objections: string[];
    internal_politics: string;
    trigger_phrases: string[];
    day_in_life: string;
    success_looks_like: string;
    nightmare_scenario: string;
    evaluation_criteria: string[];
    messaging_do: string[];
    messaging_dont: string[];
}

export interface BuyingTriggerData {
    id: string;
    gtm_context_id: string;
    name: string;
    description: string;
    category: string;
    urgency_level: string;
    why_it_matters: string;
    ideal_timing: string;
    qualifying_questions: string[];
}

export interface SignalDefinitionData {
    id: string;
    gtm_context_id: string;
    trigger_id: string | null;
    name: string;
    description: string;
    source: string;
    detection_method: string;
    keywords: string[];
    strength_score: number;
    false_positive_notes: string;
    enrichment_fields_used: string[];
}

export interface GTMPlayData {
    id: string;
    gtm_context_id: string;
    name: string;
    icp_statement: string;
    trigger_id: string | null;
    signal_id: string | null;
    persona_id: string | null;
    messaging_angle: string;
    status: string;
    playbook_id: string | null;
    // Tactical depth
    channel_sequence: string[];
    timing_rationale: string;
    opening_hook: string;
    objection_handling: Record<string, string>;
    competitive_positioning: string;
    success_criteria: string;
    email_subject_lines: string[];
    call_talk_track: string;
}

export interface ICPSuggestion {
    icp_name: string;
    icp_statement: string;
    icp_priority: string;
    firmographic_range: Record<string, string | undefined>;
    icp_rationale: string;
    list_sourcing_guidance: string;
}

export interface GTMContextSummary {
    id: string;
    name: string;
    product_description: string;
    target_industries: string[];
    customer_examples: string[];
    value_proposition: string;
    competitors: string[];
    geographic_focus: string;
    icp_id: string | null;
    status: string;
    persona_count: number;
    trigger_count: number;
    play_count: number;
    created_at: string;
}

export interface GTMContextDetail {
    id: string;
    company_name: string;
    website_url: string;
    core_problem: string;
    product_category: string;
    context_notes: string;
    name: string;
    product_description: string;
    target_industries: string[];
    customer_examples: string[];
    value_proposition: string;
    competitors: string[];
    geographic_focus: string;
    icp_id: string | null;
    status: string;
    // Deep discovery fields
    avg_deal_size: string;
    sales_cycle_days: string;
    decision_process: string;
    key_integrations: string[];
    why_customers_buy: string;
    why_customers_churn: string;
    common_objections: string[];
    market_maturity: string;
    pricing_model: string;
    icp_name: string;
    icp_statement: string;
    icp_priority: string;
    firmographic_range: Record<string, string | undefined>;
    icp_rationale: string;
    list_sourcing_guidance: string;
    enrichment_patterns: JsonRecord | null;
    // Children
    personas: PersonaData[];
    triggers: BuyingTriggerData[];
    signal_definitions: SignalDefinitionData[];
    plays: GTMPlayData[];
    context_quality_score?: number;
}

// ─────────────────────────────────────────────────────────────
// GTM Intelligence API Functions
// ─────────────────────────────────────────────────────────────

export const listGTMContexts = () =>
    api.get<{ contexts: GTMContextSummary[] }>('/gtm/');

export const createGTMContext = (data: {
    company_name?: string; website_url?: string; core_problem?: string; product_category?: string; context_notes?: string;
    name: string; product_description?: string; target_industries?: string[];
    customer_examples?: string[]; value_proposition?: string; competitors?: string[];
    geographic_focus?: string; avg_deal_size?: string; sales_cycle_days?: string;
    decision_process?: string; key_integrations?: string[]; why_customers_buy?: string;
    why_customers_churn?: string; common_objections?: string[]; market_maturity?: string;
    pricing_model?: string;
    icp_name?: string; icp_statement?: string; icp_priority?: string; firmographic_range?: Record<string, string | undefined>;
    icp_rationale?: string; list_sourcing_guidance?: string;
}) => api.post<GTMContextDetail>('/gtm/', data);

export const getGTMContext = (id: string) =>
    api.get<GTMContextDetail>(`/gtm/${id}`);

export const updateGTMContext = (id: string, data: Record<string, unknown>) =>
    api.patch<GTMContextDetail>(`/gtm/${id}`, data);

export const deleteGTMContext = (id: string) =>
    api.delete(`/gtm/${id}`);

export const createPersona = (ctxId: string, data: Partial<PersonaData>) =>
    api.post<PersonaData>(`/gtm/${ctxId}/personas`, data);

export const deletePersona = (id: string) =>
    api.delete(`/gtm/personas/${id}`);

export const createBuyingTrigger = (ctxId: string, data: { name: string; description?: string; category?: string }) =>
    api.post<BuyingTriggerData>(`/gtm/${ctxId}/triggers`, data);

export const deleteBuyingTrigger = (id: string) =>
    api.delete(`/gtm/triggers/${id}`);

export const createSignalDef = (ctxId: string, data: { name: string; description?: string; trigger_id?: string; source?: string; detection_method?: string }) =>
    api.post<SignalDefinitionData>(`/gtm/${ctxId}/signals`, data);

export const deleteSignalDef = (id: string) =>
    api.delete(`/gtm/signals/${id}`);

export const createGTMPlay = (ctxId: string, data: { name: string; icp_statement?: string; trigger_id?: string; signal_id?: string; persona_id?: string; messaging_angle?: string }) =>
    api.post<GTMPlayData>(`/gtm/${ctxId}/plays`, data);

export const updateGTMPlay = (playId: string, data: Record<string, unknown>) =>
    api.patch<GTMPlayData>(`/gtm/plays/${playId}`, data);

export const deleteGTMPlay = (playId: string) =>
    api.delete(`/gtm/plays/${playId}`);

export const generateGTMStrategy = (ctxId: string) =>
    api.post<{ status: string; created: Record<string, unknown[]>; counts: Record<string, number> }>(`/gtm/${ctxId}/generate`);

export const refineFromEnrichment = (ctxId: string) =>
    api.post<{ status: string; companies_analyzed: number; high_fit_count: number; signaled_count: number; analysis: JsonRecord }>(`/gtm/${ctxId}/refine-from-enrichment`);

export const parseGTMContextFiles = (files: File[]) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    return api.post<{ extracted: JsonRecord; context_quality_score: number }>('/gtm/context/parse', formData);
};

export const generateICPSuggestions = (ctxId: string) =>
    api.post<{ suggestions: ICPSuggestion[] }>(`/gtm/${ctxId}/icp-suggestions`);

export const generateSourcingGuide = (ctxId: string) =>
    api.post<{ sourcing_guide: string }>(`/gtm/${ctxId}/sourcing-guide`);

// ─────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────

// Health
export const getHealth = () => api.get<HealthStatus>('/health');

// Workspaces
export const listWorkspaces = () =>
    api.get<{ workspaces: WorkspaceData[] }>('/workspaces/');

export const createWorkspace = (data: { name: string }) =>
    api.post<WorkspaceData>('/workspaces/', data);

// Leads
export const getLeads = ({ skip = 0, limit = 50, status, q, enriched_only }: LeadListParams = {}) => {
    const params = new URLSearchParams({
        skip: String(skip),
        limit: String(limit),
    });
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    if (enriched_only) params.set('enriched_only', 'true');
    return api.get<{ leads: Lead[]; total: number }>(`/leads/?${params.toString()}`);
};

export const createLead = (data: { email: string; first_name?: string; last_name?: string; domain?: string }) =>
    api.post<Lead>('/leads/', data);

export const getLead = (id: string) =>
    api.get<Lead>(`/leads/${id}`);

export const updateLead = (id: string, data: Partial<Lead>) =>
    api.patch<Lead>(`/leads/${id}`, data);

export const deleteLead = (id: string) =>
    api.delete(`/leads/${id}`);

export const applyCooldown = (id: string, months = 6) =>
    api.post<Lead>(`/leads/${id}/cooldown`, { months });

export const removeCooldown = (id: string) =>
    api.delete<Lead>(`/leads/${id}/cooldown`);

// Enrichment
export const startBatchEnrichment = (domains: string[], icp_id?: string) =>
    api.post<{ job_id: string; total: number }>('/enrichment/batch', { domains, icp_id });

export const getJobStatus = (jobId: string) =>
    api.get<EnrichmentJobStatus>(`/enrichment/status/${jobId}`);

export const importCSV = (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<ImportLeadsResult>('/enrichment/import-csv', formData);
};

export const getProfiles = (skip = 0, limit = 50, qualityTier?: string, q?: string) => {
    let url = `/enrichment/profiles?skip=${skip}&limit=${limit}`;
    if (qualityTier) url += `&quality_tier=${qualityTier}`;
    if (q) url += `&q=${encodeURIComponent(q)}`;
    return api.get<{ profiles: CompanyProfile[]; total: number }>(url);
};

export const getProfile = (domain: string) =>
    api.get<CompanyProfile>(`/enrichment/profiles/${domain}`);

export const updateProfile = (domain: string, data: ProfileUpdateRequest) =>
    api.patch<CompanyProfile>(`/enrichment/profiles/${domain}`, data);

export const listAllProfiles = async (qualityTier?: string) => {
    const pageSize = 200;
    let skip = 0;
    let total = 0;
    const profiles: CompanyProfile[] = [];

    while (skip === 0 || profiles.length < total) {
        const { data } = await getProfiles(skip, pageSize, qualityTier);
        const page = data.profiles || [];
        total = data.total || profiles.length;
        profiles.push(...page);
        if (page.length === 0) break;
        skip += page.length;
    }

    return { profiles, total };
};

// ICP
export const generateICPSync = (data: { name: string; product_description: string; customer_examples: string[] }) =>
    api.post('/icp/generate-sync', data);

export const listICPs = () =>
    api.get<{ icps: ICPDefinition[] }>('/icp/');

export const getICP = (id: string) =>
    api.get<ICPDefinition>(`/icp/${id}`);

export const deleteICP = (id: string) =>
    api.delete(`/icp/${id}`);

export const scoreBatch = (icp_id: string, domains: string[] = []) =>
    api.post<{ scores: ICPScoreResult[]; total: number; icp_name: string }>('/icp/score', { icp_id, domains });

// Signals
export const getSignalQueue = (icp_id?: string, limit = 50, skip = 0, q?: string) => {
    let url = `/signals/queue?limit=${limit}&skip=${skip}`;
    if (icp_id) url += `&icp_id=${icp_id}`;
    if (q) url += `&q=${encodeURIComponent(q)}`;
    return api.get<{ queue: SignalQueueItem[]; total: number; summary: SignalQueueSummary }>(url);
};

// ─────────────────────────────────────────────────────────────
// Playbook Types
// ─────────────────────────────────────────────────────────────

export interface PlaybookSummary {
    id: string;
    name: string;
    description: string;
    icp_id: string | null;
    status: string;
    play_count: number;
    total_enrolled: number;
    created_at: string;
    updated_at: string;
}

export interface PlayStepData {
    id: string;
    play_id: string;
    step_number: number;
    step_type: string; // email | wait | task | condition
    config: Record<string, unknown>;
}

export interface PlayStepSummary {
    step_number: number;
    step_type: string;
    label: string;
    description: string;
}

export interface StepHistoryEntry {
    timestamp: string;
    action: string;
    status: string;
    step: number;
    outcome?: string | null;
    notes?: string | null;
}

export interface PlayEnrollmentData {
    id: string;
    play_id: string;
    lead_id: string | null;
    domain: string | null;
    current_step: number;
    status: string;
    enrolled_at: string;
    last_step_at: string | null;
    current_step_detail?: PlayStepSummary | null;
    next_step_detail?: PlayStepSummary | null;
    step_history?: StepHistoryEntry[];
    step_history_count?: number;
    lead?: { email: string; first_name: string | null; domain: string | null };
}

export interface PlayData {
    id: string;
    playbook_id: string;
    name: string;
    description: string;
    trigger_rules: Record<string, unknown>;
    priority: number;
    status: string;
    steps: PlayStepData[];
    enrollments: PlayEnrollmentData[];
    enrollment_count: number;
}

export interface PlaybookDetail extends PlaybookSummary {
    plays: PlayData[];
}

export interface PlaybookTemplate {
    id: string;
    name: string;
    description: string;
    plays: {
        name: string;
        description: string;
        trigger_rules: Record<string, unknown>;
        priority: number;
        steps: { step_number: number; step_type: string; config: Record<string, unknown> }[];
    }[];
}

// ─────────────────────────────────────────────────────────────
// Playbook API Functions
// ─────────────────────────────────────────────────────────────

export const listPlaybooks = () =>
    api.get<{ playbooks: PlaybookSummary[] }>('/playbooks/');

export const createPlaybook = (data: { name: string; description?: string; icp_id?: string }) =>
    api.post<PlaybookSummary>('/playbooks/', data);

export const getPlaybook = (id: string) =>
    api.get<PlaybookDetail>(`/playbooks/${id}`);

export const updatePlaybook = (id: string, data: { name?: string; description?: string; status?: string }) =>
    api.patch<PlaybookSummary>(`/playbooks/${id}`, data);

export const deletePlaybook = (id: string) =>
    api.delete(`/playbooks/${id}`);

export const createPlay = (playbookId: string, data: { name: string; description?: string; trigger_rules?: Record<string, unknown>; priority?: number }) =>
    api.post<PlayData>(`/playbooks/${playbookId}/plays`, data);

export const updatePlay = (playId: string, data: { name?: string; description?: string; trigger_rules?: Record<string, unknown>; priority?: number; status?: string }) =>
    api.patch<PlayData>(`/playbooks/plays/${playId}`, data);

export const deletePlay = (playId: string) =>
    api.delete(`/playbooks/plays/${playId}`);

export const createPlayStep = (playId: string, data: { step_number: number; step_type: string; config: Record<string, unknown> }) =>
    api.post<PlayStepData>(`/playbooks/plays/${playId}/steps`, data);

export const updatePlayStep = (stepId: string, data: { step_number?: number; step_type?: string; config?: Record<string, unknown> }) =>
    api.patch<PlayStepData>(`/playbooks/steps/${stepId}`, data);

export const deletePlayStep = (stepId: string) =>
    api.delete(`/playbooks/steps/${stepId}`);

export const enrollInPlay = (playId: string, data: { lead_ids?: string[]; domains?: string[] }) =>
    api.post<{ enrolled: number; enrollment_ids: string[] }>(`/playbooks/plays/${playId}/enroll`, data);

export const getPlayEnrollments = (playId: string) =>
    api.get<{ enrollments: PlayEnrollmentData[] }>(`/playbooks/plays/${playId}/enrollments`);

export const updateEnrollmentProgress = (enrollmentId: string, data: {
    action?: 'pause' | 'resume' | 'advance' | 'complete' | 'exit';
    status?: string;
    current_step?: number;
    outcome?: string;
    notes?: string;
}) => api.patch<PlayEnrollmentData>(`/playbooks/enrollments/${enrollmentId}`, data);

export const autoEnrollPlaybook = (playbookId: string) =>
    api.post<{ enrolled_total: number; by_play: Record<string, { name: string; enrolled: number }> }>(`/playbooks/${playbookId}/auto-enroll`);

export const getPlaybookTemplates = () =>
    api.get<{ templates: PlaybookTemplate[] }>('/playbooks/templates/library');

export const applyPlaybookTemplate = (templateId: string, playbookId: string) =>
    api.post<{ applied: boolean; plays_created: string[] }>(`/playbooks/templates/${templateId}/apply?playbook_id=${playbookId}`);

// SSE streaming helper
export const createSSEStream = (path: string): EventSource => {
    return new EventSource(`${API_BASE}${path}`);
};

// Export CSV
export const exportEnrichedCSV = async () => {
    const { profiles } = await listAllProfiles();

    const formatValue = (value: DataValue | undefined) => {
        if (value == null) return '';
        if (Array.isArray(value)) return value.join('; ');
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    const headers = ['domain', 'name', 'quality_score', 'quality_tier', 'employee_count', 'industry', 'business_model', 'hq_location', 'founded_year', 'sources'];
    const rows = profiles.map(p => [
        p.domain,
        p.name || '',
        (p.quality_score * 100).toFixed(0) + '%',
        p.quality_tier,
        formatValue(p.enriched_data?.employee_count?.value),
        formatValue(p.enriched_data?.industry?.value),
        formatValue(p.enriched_data?.business_model?.value),
        formatValue(p.enriched_data?.hq_location?.value),
        formatValue(p.enriched_data?.founded_year?.value),
        (p.sources_used || []).join('; '),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `connectaflow_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

// ─────────────────────────────────────────────────────────────
// New Module Types
// ─────────────────────────────────────────────────────────────

// ICP (Plays-linked, per-mission)
export interface ICP {
    id: string;
    workspace_id: string;
    mission_id: string;
    name: string;
    industry: string[];
    company_size: Record<string, unknown>;
    geography: string[];
    use_cases: string[];
    firmographic_range: Record<string, unknown>;
    icp_statement: string;
    icp_priority: string; // Primary | Secondary | Experimental
    list_sourcing_guidance: string;
    icp_rationale: string;
    created_at: string;
}

// Social Proof Asset
export interface SocialProofAsset {
    id: string;
    workspace_id: string;
    type: string; // case_study | testimonial | metric
    title: string;
    content: string;
    icp_id: string | null;
    persona_id: string | null;
    use_case_tags: string[];
    created_at: string;
}

// Reply
export interface Reply {
    id: string;
    workspace_id: string;
    lead_id: string | null;
    lead?: { id: string; name: string; email: string; domain: string | null; status: string } | null;
    activity_id: string | null;
    play_id: string | null;
    channel: string; // email | linkedin | call
    reply_text: string;
    classification: string | null; // interested | objection | neutral | ooo
    sentiment: string | null; // positive | negative | neutral
    source: string; // smartlead | manual_csv | manual_entry
    received_at: string | null;
}

// Messaging Play
export interface MessagingPlay {
    id: string;
    mission_id: string;
    persona_id: string;
    persona_name: string;
    icp_id: string | null;
    icp_name: string;
    name: string;
    global_instruction: string;
    status: string; // draft | active | archived
    component_count: number;
    created_at: string;
    updated_at: string;
    components?: PlayComponent[];
    email_variants?: EmailVariant[];
}

export interface PlayComponent {
    id: string;
    component_type: string; // subject | greeting | opener | problem | value_prop | story | cta | closer | variables
    display_order: number;
    variations: PlayVariation[];
}

export interface PlayVariation {
    id: string;
    component_id: string;
    content: string;
    tone: string | null;
    is_selected: boolean;
    created_at: string;
}

export interface EmailVariant {
    id: string;
    play_id: string;
    subject: string;
    body: string;
    style_label: string | null;
    smartlead_variant_id: string | null;
    created_at: string;
}

// Meeting Brief
export interface MeetingBrief {
    id: string;
    lead_id: string;
    content_json: {
        company_overview: string;
        icp_fit_score: number;
        icp_fit_reason: string;
        icp_tier: string;
        active_signals: string[];
        conversation_history: string;
        key_talking_points: string[];
        likely_objections: string[];
        suggested_questions: string[];
    };
    generated_at: string;
}

// External Signal
export interface ExternalSignal {
    id: string;
    domain: string;
    company_name: string | null;
    signal_type: string;
    strength: number;
    relevance: number;
    confidence: number;
    evidence: string | null;
    source_url: string | null;
    matched_icp_id: string | null;
    status: string; // new | dismissed | added
    discovered_at: string;
}

// Smartlead Stats
export interface SmartleadStats {
    id: string;
    campaign_id: string;
    campaign_name: string;
    emails_sent: number;
    opens: number;
    open_rate: number;
    replies: number;
    reply_rate: number;
    meetings_booked: number;
    synced_at: string;
}

// Outcomes
export interface OutcomesSummary {
    total_leads: number;
    contacted: number;
    replied: number;
    reply_rate: number;
    meetings_booked: number;
    conversion_rate: number;
}

export interface OutcomesByChannel {
    email: { attempted: number; replies: number; reply_rate: number; meetings: number; stats?: SmartleadStats[] };
    linkedin: { attempted: number; replies: number; reply_rate: number; meetings: number };
    calls: { attempted: number; replies: number; reply_rate: number; meetings: number };
}

// Copilot
export interface CopilotResponse {
    answer: string;
    context_summary: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// ICP API (Mission-linked ICPs)
// ─────────────────────────────────────────────────────────────

export const listMissionICPs = (missionId: string) =>
    api.get<{ icps: ICP[]; total: number }>(`/gtm/${missionId}/icps`);

export const createMissionICP = (missionId: string, data: Partial<ICP>) =>
    api.post<ICP>(`/gtm/${missionId}/icps`, data);

export const updateMissionICP = (missionId: string, icpId: string, data: Partial<ICP>) =>
    api.patch<ICP>(`/gtm/${missionId}/icps/${icpId}`, data);

export const deleteMissionICP = (missionId: string, icpId: string) =>
    api.delete(`/gtm/${missionId}/icps/${icpId}`);

// ─────────────────────────────────────────────────────────────
// Assets API
// ─────────────────────────────────────────────────────────────

export const listAssets = (params?: { icp_id?: string; persona_id?: string; type?: string }) =>
    api.get<{ assets: SocialProofAsset[]; total: number }>('/assets/', { params });

export const createAsset = (data: Partial<SocialProofAsset>) =>
    api.post<SocialProofAsset>('/assets/', data);

export const updateAsset = (id: string, data: Partial<SocialProofAsset>) =>
    api.patch<SocialProofAsset>(`/assets/${id}`, data);

export const deleteAsset = (id: string) =>
    api.delete(`/assets/${id}`);

// ─────────────────────────────────────────────────────────────
// Replies API
// ─────────────────────────────────────────────────────────────

export const listReplies = (params?: { lead_id?: string; channel?: string; classification?: string; play_id?: string; skip?: number; limit?: number }) =>
    api.get<{ replies: Reply[]; total: number; skip: number; limit: number }>('/replies/', { params });

export const createReply = (data: { lead_id?: string; channel: string; reply_text: string; source?: string; play_id?: string; received_at?: string }) =>
    api.post<Reply>('/replies/', data);

export const deleteReply = (id: string) =>
    api.delete(`/replies/${id}`);

export const getReplyInsights = () =>
    api.get<{ sentiment_split: Record<string, number>; top_objections: string[]; total_replies: number }>('/replies/insights/summary');

export const uploadRepliesCSV = (file: File, channel: string = 'email') => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ created: number; errors: string[] }>(`/replies/upload-csv?channel=${channel}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};

// ─────────────────────────────────────────────────────────────
// Meeting Brief API
// ─────────────────────────────────────────────────────────────

export const generateMeetingBrief = (leadId: string) =>
    api.post<MeetingBrief['content_json']>(`/leads/${leadId}/meeting-brief`);

export const getMeetingBrief = (leadId: string) =>
    api.get<MeetingBrief>(`/leads/${leadId}/meeting-brief`);

// ─────────────────────────────────────────────────────────────
// Plays Messaging Studio API
// ─────────────────────────────────────────────────────────────

export const listMessagingPlays = (missionId?: string) =>
    api.get<{ plays: MessagingPlay[]; total: number }>('/plays-messaging/', { params: missionId ? { mission_id: missionId } : {} });

export const createMessagingPlay = (data: { mission_id: string; persona_id: string; icp_id?: string; name: string; global_instruction?: string }) =>
    api.post<MessagingPlay>('/plays-messaging/', data);

export const getMessagingPlay = (id: string) =>
    api.get<MessagingPlay>(`/plays-messaging/${id}`);

export const updateMessagingPlay = (id: string, data: Partial<MessagingPlay>) =>
    api.patch<MessagingPlay>(`/plays-messaging/${id}`, data);

export const deleteMessagingPlay = (id: string) =>
    api.delete(`/plays-messaging/${id}`);

export const generateMessagingComponents = (playId: string, instruction?: string) =>
    api.post<{ play_id: string; components: PlayComponent[] }>(`/plays-messaging/${playId}/generate-messaging`, { instruction: instruction || '' });

export const regenerateMessagingComponents = (playId: string, instruction: string) =>
    api.post<{ play_id: string; components: PlayComponent[] }>(`/plays-messaging/${playId}/regenerate`, { instruction });

export const generateEmailVariants = (playId: string) =>
    api.post<{ email_variants: EmailVariant[]; count: number }>(`/plays-messaging/${playId}/generate-emails`);

export const updatePlayVariation = (variationId: string, data: { content?: string; tone?: string; is_selected?: boolean }) =>
    api.patch<PlayVariation>(`/plays-messaging/variations/${variationId}`, data);

export const addPlayVariation = (data: { component_id: string; content: string; tone?: string; is_selected?: boolean }) =>
    api.post<PlayVariation>('/plays-messaging/variations', data);

export const deletePlayVariation = (variationId: string) =>
    api.delete(`/plays-messaging/variations/${variationId}`);

export const listEmailVariants = (playId: string) =>
    api.get<{ email_variants: EmailVariant[]; count: number }>(`/plays-messaging/${playId}/email-variants`);

// ─────────────────────────────────────────────────────────────
// Outcomes API
// ─────────────────────────────────────────────────────────────

export const getOutcomesSummary = () =>
    api.get<OutcomesSummary>('/outcomes/summary');

export const getOutcomesByChannel = () =>
    api.get<OutcomesByChannel>('/outcomes/by-channel');

export const getOutcomesByTier = () =>
    api.get<{ tiers: Array<{ tier: string; total: number; replies: number; reply_rate: number; meetings_booked: number; conversion_rate: number }> }>('/outcomes/by-tier');

export const getOutcomesByPlay = () =>
    api.get<{ plays: Array<{ play_id: string; play_name: string; replies: number; meetings: number }> }>('/outcomes/by-play');

export const getOutcomesByPersona = () =>
    api.get<{ personas: Array<{ persona_id: string; persona_name: string; replies: number; meetings: number }> }>('/outcomes/by-persona');

export const syncSmartlead = () =>
    api.post<{ campaigns_synced: number; stats_upserted: number; replies_created: number; errors: string[] }>('/outcomes/smartlead/sync');

export const getSmartleadStats = () =>
    api.get<{ stats: SmartleadStats[]; total: number }>('/outcomes/smartlead/stats');

export const uploadLinkedinCSV = (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ created: number; errors: string[] }>('/outcomes/upload/linkedin', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};

export const uploadCallsCSV = (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ created: number; errors: string[] }>('/outcomes/upload/calls', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};

export const downloadLinkedinTemplate = () =>
    window.open(`${API_BASE}/outcomes/templates/linkedin`, '_blank');

export const downloadCallsTemplate = () =>
    window.open(`${API_BASE}/outcomes/templates/calls`, '_blank');

// ─────────────────────────────────────────────────────────────
// External Signals API
// ─────────────────────────────────────────────────────────────

export const listExternalSignals = (params?: { status?: string; icp_id?: string; skip?: number; limit?: number }) =>
    api.get<{ signals: ExternalSignal[]; total: number; skip: number; limit: number }>('/signals/external', { params });

export const updateExternalSignal = (id: string, status: string) =>
    api.patch<ExternalSignal>(`/signals/external/${id}`, null, { params: { status } });

export const downloadExternalSignalsCSV = (status?: string) => {
    const url = status ? `${API_BASE}/signals/external/download?status=${status}` : `${API_BASE}/signals/external/download`;
    window.open(url, '_blank');
};

// ─────────────────────────────────────────────────────────────
// AI Copilot API
// ─────────────────────────────────────────────────────────────

export const queryCopilot = (query: string) =>
    api.post<CopilotResponse>('/copilot/query', { query });

export default api;
