"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDocumentKey = exports.documentCache = void 0;
// documentCache.ts
exports.documentCache = new Map();
/**
 * Generates a simple key for the given text.
 * In a real extension you might want to use a hash function.
 */
function generateDocumentKey() {
    // For simplicity, use current time plus a random string.
    return Date.now().toString() + Math.random().toString(36).substr(2, 5);
}
exports.generateDocumentKey = generateDocumentKey;
//# sourceMappingURL=documentCache.js.map