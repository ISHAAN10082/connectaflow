export function isHttpUrl(value?: string | null): boolean {
    return Boolean(value && /^https?:\/\//i.test(value));
}

export function isTelValue(value?: string | null): boolean {
    return Boolean(value && /^\+?[\d()\-.+\s]{6,}$/.test(value.trim()));
}
