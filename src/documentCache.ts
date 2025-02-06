// documentCache.ts
export const documentCache = new Map<string, string>();

/**
 * Generates a simple key for the given text.
 * In a real extension you might want to use a hash function.
 */
export function generateDocumentKey(): string {
    // For simplicity, use current time plus a random string.
    return Date.now().toString() + Math.random().toString(36).substr(2, 5);
}