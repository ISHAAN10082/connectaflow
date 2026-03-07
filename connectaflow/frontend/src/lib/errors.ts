export type ApiErrorShape = {
    response?: {
        data?: {
            detail?: string;
        };
    };
};

export const getErrorMessage = (err: unknown, fallback: string): string => {
    if (typeof err === 'object' && err !== null && 'response' in err) {
        const apiErr = err as ApiErrorShape;
        const detail = apiErr.response?.data?.detail;
        if (typeof detail === 'string' && detail.trim()) {
            return detail;
        }
    }

    if (err instanceof Error && err.message) {
        return err.message;
    }

    return fallback;
};
