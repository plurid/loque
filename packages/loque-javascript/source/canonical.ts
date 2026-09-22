import { isArray } from './json';
import type { JsonValue } from './types';

/**
 * RFC 8785 (JCS) serialization of validated JSON: keys sorted by UTF-16 code
 * units, ECMAScript number and string serialization, and no whitespace.
 */
export function canonicalJson(value: JsonValue): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    return `{${Object.keys(value).sort()
        .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

/** Hex SHA-256 of UTF-8 text using the platform WebCrypto implementation. */
export async function sha256Hex(text: string): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
