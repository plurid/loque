import { LoqueError } from './errors';
import { shape } from './ir';
import { appendPointer, copyJson, isArray } from './json';
import { limit, programOf } from './program';
import type {
    Capability, CapabilityOptions, ExpressionIR, JsonValue, MutationKind, PredicateIR, Program, ProgramIR, Violation,
} from './types';

/** Any one segment: `*` in a pattern, or an `each` step in a query. */
const ANY = Symbol('any');
type Segment = string | typeof ANY;
type Pattern = readonly Segment[];

interface Rules {
    readonly read: readonly Pattern[];
    readonly write: readonly Pattern[];
    readonly deny: readonly Pattern[];
    readonly judgments: ReadonlySet<string>;
    readonly mutations: ReadonlySet<MutationKind>;
}

const lists = ['read', 'write', 'deny', 'judgments', 'mutations'] as const;
const limits = ['maxMatches', 'maxEvaluations', 'maxOperations'] as const;
const mutationKinds: readonly MutationKind[] = ['merge', 'replace', 'remove'];
const rules = new WeakMap<object, Rules>();

function invalid(message: string, path: string): never {
    throw new LoqueError('INVALID_CAPABILITY', message, path);
}

function parse(pattern: JsonValue, path: string): Pattern {
    if (typeof pattern !== 'string' || (pattern !== '' && !pattern.startsWith('/')) || /~(?![01])/.test(pattern)) {
        invalid('Expected a JSON Pointer pattern', path);
    }
    return pattern === '' ? [] : pattern.slice(1).split('/')
        .map(token => token === '*' ? ANY : token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function format(location: Pattern): string {
    return location.reduce<string>((path, segment) => segment === ANY ? `${path}/*` : appendPointer(path, segment), '');
}

/** A pattern grants a location when it is a prefix; a query wildcard needs a pattern wildcard. */
function covers(pattern: Pattern, location: Pattern): boolean {
    return pattern.length <= location.length
        && pattern.every((segment, index) => segment === ANY || (location[index] !== ANY && segment === location[index]));
}

/** Some concrete path could be both inside the denied subtree and inside the location's subtree. */
function overlaps(pattern: Pattern, location: Pattern): boolean {
    const length = Math.min(pattern.length, location.length);
    for (let index = 0; index < length; index += 1) {
        const [left, right] = [pattern[index], location[index]];
        if (left !== ANY && right !== ANY && left !== right) return false;
    }
    return true;
}

function analyze(ir: ProgramIR, rules: Rules): Violation[] {
    const violations: Violation[] = [];
    const report = (kind: Violation['kind'], path: string, location: Pattern, message: string) => {
        violations.push(Object.freeze({ kind, path, location: format(location), message }));
    };
    const access = (kind: 'read' | 'write', location: Pattern, path: string) => {
        if (!rules[kind].some(pattern => covers(pattern, location))) {
            report(kind, path, location, kind === 'read' ? 'Location is not readable' : 'Location is not writable');
        } else if (rules.deny.some(pattern => overlaps(pattern, location))) {
            report(kind, path, location, 'Location overlaps a denied location');
        }
    };

    let location: Pattern = [];
    const expression = (value: ExpressionIR, path: string) => {
        switch (value.op) {
            case 'literal': return;
            case 'current': access('read', location, path); return;
            case 'field': access('read', [...location, ...value.path.map(String)], path); return;
            default:
                // Judgment inputs go to the host-authorized projection, not to the agent.
                if (!rules.judgments.has(value.judgment)) {
                    report('judgment', `${path}/judgment`, location, `Judgment ${value.judgment} is not allowed`);
                }
        }
    };
    const predicate = (value: PredicateIR, path: string): void => {
        switch (value.op) {
            case 'and': case 'or':
                value.predicates.forEach((item, position) => predicate(item, `${path}/predicates/${position}`));
                return;
            case 'not': predicate(value.predicate, `${path}/predicate`); return;
            case 'in': case 'exists': expression(value.value, `${path}/value`); return;
            default:
                expression(value.left, `${path}/left`);
                expression(value.right, `${path}/right`);
        }
    };

    ir.query.steps.forEach((step, position) => {
        const path = `/query/steps/${position}`;
        switch (step.op) {
            case 'field': location = [...location, step.key]; return;
            case 'index': location = [...location, String(step.index)]; return;
            case 'each': location = [...location, ANY]; return;
            case 'where': predicate(step.predicate, `${path}/predicate`); return;
            case 'sort': expression(step.by, `${path}/by`); return;
        }
    });
    // Read programs return selected values whole; write programs return only paths and operations.
    const { mutation } = ir;
    if (mutation === undefined) {
        access('read', location, '/query');
    } else {
        if (!rules.mutations.has(mutation.op)) {
            report('mutation', '/mutation/op', location, `Mutation ${mutation.op} is not allowed`);
        }
        if (mutation.op === 'merge') {
            for (const key of Object.keys(mutation.value)) {
                access('write', [...location, key], appendPointer('/mutation/value', key));
            }
        } else {
            access('write', location, '/mutation');
        }
    }
    return violations;
}

/** Define what programs may do. Everything not granted is denied. */
export function capability(options: CapabilityOptions): Capability {
    const owned = copyJson(options, 'INVALID_CAPABILITY');
    shape(owned, [], '', 'INVALID_CAPABILITY', [...lists, ...limits]);
    const list = (key: typeof lists[number]): readonly JsonValue[] => {
        const value = owned[key] ?? [];
        if (!isArray(value)) invalid('Expected an array', `/${key}`);
        return value;
    };
    const names = (key: 'judgments' | 'mutations') => list(key).map((value, position) => {
        const path = `/${key}/${position}`;
        if (key === 'judgments' ? typeof value !== 'string' || value.trim().length === 0
            : !mutationKinds.includes(value as MutationKind)) {
            invalid(key === 'judgments' ? 'Expected a judgment name' : 'Expected merge, replace, or remove', path);
        }
        return value as string;
    });
    for (const key of limits) {
        if (Object.hasOwn(owned, key)) limit(owned[key], `/${key}`, 'INVALID_CAPABILITY');
    }
    const compiled: Rules = {
        read: list('read').map((pattern, position) => parse(pattern, `/read/${position}`)),
        write: list('write').map((pattern, position) => parse(pattern, `/write/${position}`)),
        deny: list('deny').map((pattern, position) => parse(pattern, `/deny/${position}`)),
        judgments: new Set(names('judgments')),
        mutations: new Set(names('mutations') as MutationKind[]),
    };
    const normalized = Object.freeze({
        ...Object.fromEntries(lists.map(key => [key, owned[key] ?? Object.freeze([])])),
        ...Object.fromEntries(limits.filter(key => Object.hasOwn(owned, key)).map(key => [key, owned[key]])),
    }) as Capability['options'];
    const result: Capability = Object.freeze({
        options: normalized,
        check: (input: Program) => Object.freeze(analyze(programOf(input), compiled)),
    });
    rules.set(result, compiled);
    return result;
}

/** Violations for an already validated program, or an error for an unknown capability. */
export function violations(input: Capability, ir: ProgramIR): readonly Violation[] {
    const compiled = input !== null && typeof input === 'object' ? rules.get(input) : undefined;
    if (compiled === undefined) invalid('Expected a capability created by capability()', '');
    return analyze(ir, compiled);
}
