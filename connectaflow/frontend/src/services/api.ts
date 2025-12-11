import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8000/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

export interface Lead {
    id: string;
    first_name?: string;
    last_name?: string;
    email: string;
    company_id?: string;
    status: string;
    score: number;
    enrichment_status: 'pending' | 'enriched' | 'failed';
    custom_data: Record<string, any>;
    created_at: string;
    updated_at: string;
}

export const getLeads = async (offset = 0, limit = 50) => {
    const response = await api.get<Lead[]>('/leads', { params: { offset, limit } });
    return response.data;
};

export const createLead = async (lead: Partial<Lead>) => {
    const response = await api.post<Lead>('/leads', lead);
    return response.data;
};

export const enrichLead = async (id: string) => {
    const response = await api.post<Lead>(`/enrichment/${id}`);
    return response.data;
};
