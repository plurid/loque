import { freezeJson } from './json';
import type { JsonObject } from './types';

// Keep in step with ir.ts, program.ts, and mutation.ts; schema.test.ts checks agreement.

const count = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const name = { type: 'string', minLength: 1, pattern: '\\S' };

function node(op: string | readonly string[], properties: JsonObject = {}, description?: string): JsonObject {
    return {
        type: 'object',
        ...(description === undefined ? {} : { description }),
        properties: { op: typeof op === 'string' ? { const: op } : { enum: op }, ...properties },
        required: ['op', ...Object.keys(properties)],
        additionalProperties: false,
    };
}

const ref = (definition: string) => ({ $ref: `#/$defs/${definition}` });

const definitions = {
    json: { description: 'Any JSON value.' },
    deterministicExpression: {
        oneOf: [
            node('current', {}, 'The current node.'),
            node('field', {
                path: { type: 'array', minItems: 1, items: { anyOf: [{ type: 'string' }, count] } },
            }, 'A property path inside the current node; numbers index arrays.'),
            node('literal', { value: ref('json') }, 'A fixed JSON value.'),
        ],
    },
    judgmentExpression: {
        oneOf: [
            node('probability', {
                judgment: name, input: ref('deterministicExpression'), outcome: { type: ['boolean', 'string', 'number'] },
            }, 'The probability the named judgment assigns to an outcome for the input.'),
            node(['decision', 'expected'], { judgment: name, input: ref('deterministicExpression') },
                'The most probable outcome, or the expected value of a score judgment.'),
        ],
    },
    expression: { oneOf: [ref('deterministicExpression'), ref('judgmentExpression')] },
    predicate: {
        oneOf: [
            node(['eq', 'ne', 'lt', 'lte', 'gt', 'gte'], { left: ref('expression'), right: ref('expression') },
                'Compare two values; ordering applies to two numbers or two strings.'),
            node('in', { value: ref('expression'), values: { type: 'array', items: ref('json') } },
                'Membership in a literal array.'),
            node('exists', { value: ref('expression') }, 'The value is present.'),
            node(['and', 'or'], { predicates: { type: 'array', items: ref('predicate') } }),
            node('not', { predicate: ref('predicate') }),
        ],
    },
    step: {
        oneOf: [
            node('field', { key: { type: 'string' } }, 'Move to a property.'),
            node('index', { index: count }, 'Move to an array element.'),
            node('each', {}, 'Move to every array element or object value.'),
            node('where', { predicate: ref('predicate') }, 'Keep nodes matching the predicate.'),
            node('sort', { by: ref('deterministicExpression'), direction: { enum: ['asc', 'desc'] } },
                'Stable sort: numbers, then strings, then other values.'),
            node(['skip', 'limit'], { count }, 'Page through the selection.'),
        ],
    },
    query: {
        type: 'object',
        properties: { version: { const: 1 }, steps: { type: 'array', items: ref('step') } },
        required: ['version', 'steps'],
        additionalProperties: false,
    },
    mutation: {
        oneOf: [
            node('merge', { value: { type: 'object' } }, 'Add or replace properties of each selected object.'),
            node('replace', { value: ref('json') }, 'Replace each selected value.'),
            node('remove', {}, 'Remove each selected value.'),
        ],
    },
    limits: {
        type: 'object',
        properties: { maxMatches: count, maxEvaluations: count, maxOperations: count },
        additionalProperties: false,
    },
};

const dialect = 'https://json-schema.org/draft/2020-12/schema';

/** JSON Schema (2020-12) for a query IR document. */
export const querySchema = freezeJson({
    $schema: dialect,
    title: 'Loque query',
    ...definitions.query,
    $defs: definitions,
}) as JsonObject;

/** JSON Schema (2020-12) for a program document, suitable as a tool input schema. */
export const programSchema = freezeJson({
    $schema: dialect,
    title: 'Loque program',
    description: 'Select nodes in a JSON document with a query, and optionally plan one mutation of every selected node.',
    type: 'object',
    properties: {
        version: { const: 1 },
        query: ref('query'),
        mutation: ref('mutation'),
        limits: ref('limits'),
    },
    required: ['version', 'query'],
    additionalProperties: false,
    $defs: definitions,
}) as JsonObject;
