export type LoqueErrorCode = 'INVALID_JSON' | 'INVALID_QUERY' | 'INVALID_MUTATION' | 'INVALID_DECISION';

export class LoqueError extends Error {
    readonly code: LoqueErrorCode;
    /** JSON Pointer into the invalid input or the targeted snapshot. */
    readonly path: string;

    constructor(code: LoqueErrorCode, message: string, path = '') {
        super(`${message} at ${JSON.stringify(path)}`);
        this.name = 'LoqueError';
        this.code = code;
        this.path = path;
    }
}
