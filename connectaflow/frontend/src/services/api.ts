import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

const api = axios.create({
    baseURL: API_BASE,
    timeout: 30000,
});

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface DataPoint {
    value: any;
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
    custom_data: Record<string, any>;
    created_at: string;
    updated_at: string;
    company_profile?: Partial<CompanyProfile>;
}

export interface ICPDefinition {
    id: string;
    name: string;
    product_description: string;
    customer_examples: string[];
    rubric: ICPRubric;
    created_at: string;
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
    match_value: any;
}

export interface ICPScoreResult {
    domain: string;
    name: string | null;
    final_score: number | null;
    score_low: number | null;
    score_high: number | null;
    fit_category: string;
    quality_score: number;
    criterion_scores: Record<string, any>;
    missing_fields: string[];
}

export interface SignalQueueItem {
    domain: string;
    company_name: string;
    composite_score: number;
    icp_score: number;
    quality_score: number;
    signals: SignalDetail[];
    signal_count: number;
}

export interface SignalDetail {
    type: string;
    strength: number;
    recency_decay: number;
    evidence: string;
    source_url: string;
    detected_at: string;
    age_days: number;
}

export interface EnrichmentJobStatus {
    job_id: string;
    status: string;
    total: number;
    completed: number;
    failed: number;
    progress_pct: number;
    results: EnrichmentResult[];
}

export interface EnrichmentResult {
    domain: string;
    quality_score: number;
    quality_tier: string;
    sources: string[];
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
    enrichment_patterns: Record<string, any> | null;
    // Children
    personas: PersonaData[];
    triggers: BuyingTriggerData[];
    signal_definitions: SignalDefinitionData[];
    plays: GTMPlayData[];
}

// ─────────────────────────────────────────────────────────────
// GTM Intelligence API Functions
// ─────────────────────────────────────────────────────────────

export const listGTMContexts = () =>
    api.get<{ contexts: GTMContextSummary[] }>('/gtm/');

export const createGTMContext = (data: {
    name: string; product_description?: string; target_industries?: string[];
    customer_examples?: string[]; value_proposition?: string; competitors?: string[];
    geographic_focus?: string; avg_deal_size?: string; sales_cycle_days?: string;
    decision_process?: string; key_integrations?: string[]; why_customers_buy?: string;
    why_customers_churn?: string; common_objections?: string[]; market_maturity?: string;
    pricing_model?: string;
}) => api.post<GTMContextDetail>('/gtm/', data);

export const getGTMContext = (id: string) =>
    api.get<GTMContextDetail>(`/gtm/${id}`);

export const updateGTMContext = (id: string, data: Record<string, any>) =>
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

export const updateGTMPlay = (playId: string, data: Record<string, any>) =>
    api.patch<GTMPlayData>(`/gtm/plays/${playId}`, data);

export const deleteGTMPlay = (playId: string) =>
    api.delete(`/gtm/plays/${playId}`);

export const generateGTMStrategy = (ctxId: string) =>
    api.post<{ status: string; created: Record<string, any[]>; counts: Record<string, number> }>(`/gtm/${ctxId}/generate`);

export const refineFromEnrichment = (ctxId: string) =>
    api.post<{ status: string; companies_analyzed: number; high_fit_count: number; signaled_count: number; analysis: Record<string, any> }>(`/gtm/${ctxId}/refine-from-enrichment`);

// ─────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────

// Health
export const getHealth = () => api.get('/health');

// Leads
export const getLeads = (skip = 0, limit = 50) =>
    api.get<{ leads: Lead[]; total: number }>(`/leads/?skip=${skip}&limit=${limit}`);

export const createLead = (data: { email: string; first_name?: string; last_name?: string; domain?: string }) =>
    api.post<Lead>('/leads/', data);

export const updateLead = (id: string, data: Partial<Lead>) =>
    api.patch<Lead>(`/leads/${id}`, data);

export const deleteLead = (id: string) =>
    api.delete(`/leads/${id}`);

// Enrichment
export const startBatchEnrichment = (domains: string[], icp_id?: string) =>
    api.post<{ job_id: string; total: number }>('/enrichment/batch', { domains, icp_id });

export const getJobStatus = (jobId: string) =>
    api.get<EnrichmentJobStatus>(`/enrichment/status/${jobId}`);

export const importCSV = (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ job_id: string; domains_imported: number }>('/enrichment/import-csv', formData);
};

export const getProfiles = (skip = 0, limit = 50, qualityTier?: string) => {
    let url = `/enrichment/profiles?skip=${skip}&limit=${limit}`;
    if (qualityTier) url += `&quality_tier=${qualityTier}`;
    return api.get<{ profiles: CompanyProfile[]; total: number }>(url);
};

export const getProfile = (domain: string) =>
    api.get<CompanyProfile>(`/enrichment/profiles/${domain}`);

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
export const getSignalQueue = (icp_id?: string, limit = 50) => {
    let url = `/signals/queue?limit=${limit}`;
    if (icp_id) url += `&icp_id=${icp_id}`;
    return api.get<{ queue: SignalQueueItem[]; total: number }>(url);
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
    config: Record<string, any>;
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
    lead?: { email: string; first_name: string | null; domain: string | null };
}

export interface PlayData {
    id: string;
    playbook_id: string;
    name: string;
    description: string;
    trigger_rules: Record<string, any>;
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
        trigger_rules: Record<string, any>;
        priority: number;
        steps: { step_number: number; step_type: string; config: Record<string, any> }[];
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

export const createPlay = (playbookId: string, data: { name: string; description?: string; trigger_rules?: Record<string, any>; priority?: number }) =>
    api.post<PlayData>(`/playbooks/${playbookId}/plays`, data);

export const updatePlay = (playId: string, data: { name?: string; description?: string; trigger_rules?: Record<string, any>; priority?: number; status?: string }) =>
    api.patch<PlayData>(`/playbooks/plays/${playId}`, data);

export const deletePlay = (playId: string) =>
    api.delete(`/playbooks/plays/${playId}`);

export const createPlayStep = (playId: string, data: { step_number: number; step_type: string; config: Record<string, any> }) =>
    api.post<PlayStepData>(`/playbooks/plays/${playId}/steps`, data);

export const updatePlayStep = (stepId: string, data: { step_number?: number; step_type?: string; config?: Record<string, any> }) =>
    api.patch<PlayStepData>(`/playbooks/steps/${stepId}`, data);

export const deletePlayStep = (stepId: string) =>
    api.delete(`/playbooks/steps/${stepId}`);

export const enrollInPlay = (playId: string, data: { lead_ids?: string[]; domains?: string[] }) =>
    api.post<{ enrolled: number; enrollment_ids: string[] }>(`/playbooks/plays/${playId}/enroll`, data);

export const getPlayEnrollments = (playId: string) =>
    api.get<{ enrollments: PlayEnrollmentData[] }>(`/playbooks/plays/${playId}/enrollments`);

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
    const { data } = await getProfiles(0, 1000);
    const profiles = data.profiles;

    const headers = ['domain', 'name', 'quality_score', 'quality_tier', 'employee_count', 'industry', 'business_model', 'hq_location', 'founded_year', 'sources'];
    const rows = profiles.map(p => [
        p.domain,
        p.name || '',
        (p.quality_score * 100).toFixed(0) + '%',
        p.quality_tier,
        p.enriched_data?.employee_count?.value || '',
        p.enriched_data?.industry?.value || '',
        p.enriched_data?.business_model?.value || '',
        p.enriched_data?.hq_location?.value || '',
        p.enriched_data?.founded_year?.value || '',
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

export default api;
