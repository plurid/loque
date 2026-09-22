export type LoqueErrorCode =
    | 'INVALID_JSON' | 'INVALID_QUERY' | 'INVALID_MUTATION' | 'INVALID_DECISION' | 'INVALID_JUDGMENT'
    | 'EVALUATION_FAILED' | 'BUDGET_EXCEEDED';

export class LoqueError extends Error {
    readonly code: LoqueErrorCode;
    /** JSON Pointer into the invalid input or the targeted snapshot. */
    readonly path: string;

    constructor(code: LoqueErrorCode, message: string, path = '', options?: { cause?: unknown }) {
        super(`${message} at ${JSON.stringify(path)}`, options);
        this.name = 'LoqueError';
        this.code = code;
        this.path = path;
    }
}
