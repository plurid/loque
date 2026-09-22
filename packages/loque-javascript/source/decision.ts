import { LoqueError } from './errors';
import { shape } from './ir';
import { copyJson, isArray } from './json';
import type {
    BooleanDecision, ChoiceDecision, DecisionData, DecisionProbability, DecisionProvenance,
    DecisionResult, DecisionValue, ScoreDecision,
} from './types';

const probabilityTolerance = 1e-9;
const provenanceKeys = [
    'evaluator', 'evaluatorVersion', 'model', 'judgment', 'judgmentVersion', 'inputHash', 'timestamp',
] as const;

function invalid(message: string, path = ''): never {
    throw new LoqueError('INVALID_DECISION', message, path);
}

function outcomes<T extends string | number>(input: readonly T[], kind: 'choice' | 'score'): readonly T[] {
    const owned = copyJson(input, 'INVALID_DECISION');
    if (!isArray(owned) || owned.length === 0) invalid('Expected a nonempty outcome array');
    const seen = new Set<string | number>();
    owned.forEach((value, index) => {
        const path = `/${index}`;
        if (kind === 'choice') {
            if (typeof value !== 'string' || value.trim().length === 0) invalid('Expected a nonempty choice label', path);
        } else {
            if (typeof value !== 'number') invalid('Expected a numeric score', path);
            if (index > 0 && value <= (owned[index - 1] as number)) {
                invalid('Scores must be strictly increasing', path);
            }
        }
        // JSON validation already rejects non-finite numbers and non-data properties.
        if (seen.has(value as T)) invalid('Duplicate outcome', path);
        seen.add(value as T);
    });
    return owned as readonly T[];
}

function parse<T extends DecisionValue>(values: readonly T[], input: unknown): DecisionResult<T> {
    const owned = copyJson(input, 'INVALID_DECISION');
    shape(owned, ['distribution', 'provenance'], '', 'INVALID_DECISION');
    if (!isArray(owned.distribution) || owned.distribution.length !== values.length) {
        invalid('Expected one probability for every outcome', '/distribution');
    }

    const allowed = new Set<unknown>(values);
    const probabilities = new Map<T, number>();
    owned.distribution.forEach((entry, index) => {
        const path = `/distribution/${index}`;
        shape(entry, ['value', 'probability'], path, 'INVALID_DECISION');
        if (!allowed.has(entry.value)) invalid('Unknown outcome', `${path}/value`);
        const value = entry.value as T;
        if (probabilities.has(value)) invalid('Duplicate outcome', `${path}/value`);
        const probability = entry.probability;
        if (typeof probability !== 'number' || probability < 0 || probability > 1) {
            invalid('Expected a probability between zero and one', `${path}/probability`);
        }
        probabilities.set(value, probability);
    });

    // Canonical ordering also makes tie-breaking independent of provider entry order.
    const distribution = Object.freeze(values.map(value => Object.freeze({
        value, probability: probabilities.get(value)!,
    })));
    const total = distribution.reduce((sum, entry) => sum + entry.probability, 0);
    if (Math.abs(total - 1) > probabilityTolerance) invalid('Probabilities must sum to one', '/distribution');

    const provenance = owned.provenance;
    shape(provenance, provenanceKeys, '/provenance', 'INVALID_DECISION');
    for (const key of provenanceKeys) {
        if (typeof provenance[key] !== 'string' || provenance[key].trim().length === 0) {
            invalid('Expected a nonempty provenance string', `/provenance/${key}`);
        }
    }
    const timestamp = provenance.timestamp as string;
    const time = Date.parse(timestamp);
    if (!Number.isFinite(time) || new Date(time).toISOString() !== timestamp) {
        invalid('Expected a canonical UTC timestamp from toISOString()', '/provenance/timestamp');
    }

    const data: DecisionData<T> = Object.freeze({
        distribution, provenance: provenance as unknown as DecisionProvenance,
    });
    const winner = distribution.reduce((best, entry) => entry.probability > best.probability ? entry : best);
    return Object.freeze({
        ...data,
        value: winner.value,
        probability(value: T): number {
            if (!probabilities.has(value)) invalid('Unknown decision outcome');
            return probabilities.get(value)!;
        },
        toJSON: () => data,
    });
}

function expected(distribution: readonly DecisionProbability<number>[]): number {
    // Scale scores with nonzero mass to avoid overflow without letting impossible
    // extreme scores erase small values. Keep the reported probabilities intact.
    const scale = distribution.reduce((largest, entry) => entry.probability === 0
        ? largest : Math.max(largest, Math.abs(entry.value)), 0);
    if (scale === 0) return 0;
    const mass = distribution.reduce((sum, entry) => sum + entry.probability, 0);
    const mean = distribution.reduce((sum, entry) => entry.probability === 0
        ? sum : sum + (entry.value / scale) * entry.probability, 0) / mass;
    const lower = distribution[0].value / scale;
    const upper = distribution[distribution.length - 1].value / scale;
    return Math.max(lower, Math.min(upper, mean)) * scale;
}

/** Define a binary outcome space, ordered false then true for ties. */
export function booleanDecision(): BooleanDecision {
    const values = Object.freeze([false, true] as const);
    return Object.freeze({ kind: 'boolean', outcomes: values, parse: (input: unknown) => parse(values, input) });
}

/** Define a nonempty set of distinct string outcomes in tie-breaking order. */
export function choiceDecision<const T extends string>(input: readonly T[]): ChoiceDecision<T> {
    const values = outcomes(input, 'choice');
    return Object.freeze({ kind: 'choice', outcomes: values, parse: (input: unknown) => parse(values, input) });
}

/** Define finite numeric outcomes in strictly increasing order. */
export function scoreDecision<const T extends number>(input: readonly T[]): ScoreDecision<T> {
    const values = outcomes(input, 'score');
    return Object.freeze({
        kind: 'score',
        outcomes: values,
        parse(input: unknown) {
            const result = parse(values, input);
            return Object.freeze({ ...result, expected: expected(result.distribution) });
        },
    });
}
