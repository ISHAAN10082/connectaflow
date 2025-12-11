
import { Loader2 } from 'lucide-react';

export function ProcessingIndicator() {
    return (
        <div className="flex items-center text-xs text-blue-600 font-medium animate-pulse">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Searching...
        </div>
    );
}
