export type LoqueErrorCode =
    | 'INVALID_JSON' | 'INVALID_QUERY' | 'INVALID_MUTATION' | 'INVALID_DECISION' | 'INVALID_JUDGMENT'
    | 'INVALID_PROGRAM' | 'INVALID_CAPABILITY' | 'CAPABILITY_DENIED' | 'LIMIT_EXCEEDED'
    | 'EVALUATION_FAILED' | 'BUDGET_EXCEEDED';

export class LoqueError extends Error {
    readonly code: LoqueErrorCode;
    /** JSON Pointer into the invalid input or the targeted snapshot. */
    readonly path: string;
    /** The message without its location. */
    readonly reason: string;

    constructor(code: LoqueErrorCode, message: string, path = '', options?: { cause?: unknown }) {
        super(`${message} at ${JSON.stringify(path)}`, options);
        this.name = 'LoqueError';
        this.code = code;
        this.path = path;
        this.reason = message;
    }
}

/** Run a nested validation, reporting its errors relative to `base`. */
export function within<T>(base: string, run: () => T): T {
    try {
        return run();
    } catch (error) {
        if (!(error instanceof LoqueError)) throw error;
        throw new LoqueError(error.code, error.reason, `${base}${error.path}`, { cause: error.cause });
    }
}
