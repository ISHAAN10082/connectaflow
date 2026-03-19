import type { DataValue } from '../services/api';

function dedupeList(items: string[]): string[] {
    return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function dedupeCommaSeparatedSources(text: string): string {
    return text.replace(/Source disagreement with ([^.]+)\./gi, (_match, sources: string) => {
        const normalized = dedupeList(sources.split(','));
        return `Source disagreement with ${normalized.join(', ')}.`;
    });
}

export function formatSourceLabel(source?: string): string {
    if (!source) return 'Unknown';
    return source
        .replace(/^meta_og$/, 'Open Graph')
        .replace(/^meta_html$/, 'HTML Meta')
        .replace(/^schema_org$/, 'Schema.org')
        .replace(/^http_headers$/, 'HTTP Headers')
        .replace(/^text_pattern$/, 'Page Text')
        .replace(/^contact_points$/, 'Contact Links')
        .replace(/^manual_override$/, 'Manual Override')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function humanizeEvidenceText(text?: string): string {
    if (!text) return '';
    const normalized = text
        .replace(/\[(\d+)\s+sources?\s+agree\]/gi, (_match, count: string) => `Confirmed by ${count} supporting matches.`)
        .replace(/\[CONFLICT with ([^\]]+)\]/g, (_match, sources: string) => `Source disagreement with ${sources}.`)
        .replace(/meta_og/g, 'Open Graph')
        .replace(/meta_html/g, 'HTML meta')
        .replace(/html_scripts/g, 'script inspection')
        .replace(/schema_org/g, 'Schema.org')
        .replace(/http_headers/g, 'HTTP headers')
        .replace(/httpx/g, 'live fetch')
        .replace(/text_pattern/g, 'page text')
        .replace(/contact_points/g, 'contact links')
        .replace(/manual_override/g, 'manual override');
    return dedupeCommaSeparatedSources(normalized);
}

export function describeEvidence(evidence?: string) {
    const raw = (evidence || '').trim();
    if (!raw) {
        return {
            label: 'No provenance note',
            tone: 'bg-slate-500/10 text-slate-400',
            detail: 'The field is stored, but this run did not attach a human-readable explanation.',
        };
    }

    const readable = humanizeEvidenceText(raw);
    if (readable.startsWith('Confirmed by')) {
        const detail = readable.replace(/^Confirmed by[^.]*\.\s*/, '').trim() || readable;
        return { label: 'Sources agree', tone: 'bg-emerald-500/10 text-emerald-300', detail };
    }

    if (readable.startsWith('Source disagreement')) {
        const chosenSourceMatch = readable.match(/Using ([^.]+)\./i);
        const chosenSource = chosenSourceMatch?.[1]?.trim();
        const detail = readable.replace(/^Source disagreement with [^.]*\.\s*Using [^.]*\.\s*/, '').trim();
        return {
            label: 'Evidence mixed',
            tone: 'bg-amber-500/10 text-amber-300',
            detail: [
                chosenSource ? `Different sources disagreed, so the most trusted value from ${chosenSource} is shown.` : 'Different sources disagreed, so the most trusted value is shown.',
                detail || null,
            ].filter(Boolean).join(' '),
        };
    }

    return { label: 'Single-source evidence', tone: 'bg-slate-500/10 text-slate-300', detail: readable };
}

export function formatDataValue(value: DataValue | undefined): string {
    if (value == null) return '';
    if (Array.isArray(value)) return dedupeList(value.map((item) => String(item))).join('\n');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}
