import { expect } from 'vitest';
import { LoqueError, type LoqueErrorCode } from '../index';

export function expectError(run: () => unknown, code: LoqueErrorCode, path?: string): void {
    let thrown: unknown;
    try { run(); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(LoqueError);
    expect(thrown).toMatchObject({ name: 'LoqueError', code, ...(path === undefined ? {} : { path }) });
    expect((thrown as Error).message.length).toBeGreaterThan(0);
}

export function expectFrozen(value: unknown): void {
    if (value !== null && typeof value === 'object') {
        expect(Object.isFrozen(value)).toBe(true);
        for (const child of Object.values(value)) expectFrozen(child);
    }
}
