/** Malformed IR shared by validator and schema tests: [input, error path]. */
export const invalidQueries: [unknown, string][] = [
    [null, ''], [[], ''], [{}, '/version'],
    [{ version: 2, steps: [] }, '/version'],
    [{ version: 1, steps: {} }, '/steps'],
    [{ version: 1, steps: [], extra: true }, '/extra'],
    [{ version: 1, steps: [null] }, '/steps/0'],
    [{ version: 1, steps: [{ op: 'unknown' }] }, '/steps/0/op'],
    [{ version: 1, steps: [{ op: 'field' }] }, '/steps/0/key'],
    [{ version: 1, steps: [{ op: 'field', key: 1 }] }, '/steps/0/key'],
    [{ version: 1, steps: [{ op: 'each', extra: true }] }, '/steps/0/extra'],
];

export const invalidIndices: unknown[] = [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0', null, true];

/** Predicates placed in a where step: [predicate, path below /steps/0/predicate]. */
export const invalidPredicates: [unknown, string][] = [
    [null, ''], [{ op: 'unknown' }, '/op'],
    [{ op: 'eq', left: { op: 'current' } }, '/right'],
    [{ op: 'eq', left: null, right: { op: 'current' } }, '/left'],
    [{ op: 'eq', left: { op: 'unknown' }, right: { op: 'current' } }, '/left/op'],
    [{ op: 'exists', value: { op: 'field', path: [] } }, '/value/path'],
    [{ op: 'exists', value: { op: 'field', path: 'id' } }, '/value/path'],
    [{ op: 'exists', value: { op: 'current', extra: 1 } }, '/value/extra'],
    [{ op: 'in', value: { op: 'current' }, values: {} }, '/values'],
    [{ op: 'and', predicates: {} }, '/predicates'],
    [{ op: 'or', predicates: [false] }, '/predicates/0'],
    [{ op: 'not', predicate: {} }, '/predicate/op'],
];

const judged = { op: 'decision', judgment: 'intent', input: { op: 'current' } };

/** Single steps: [step, path below /steps/0]. */
export const invalidSteps: [unknown, string][] = [
    [{ op: 'sort', by: { op: 'current' } }, '/direction'],
    [{ op: 'sort', by: { op: 'current' }, direction: 'up' }, '/direction'],
    [{ op: 'sort', by: judged, direction: 'asc' }, '/by/op'],
    [{ op: 'skip', count: -1 }, '/count'],
    [{ op: 'limit', count: 1.5 }, '/count'],
    [{ op: 'limit' }, '/count'],
    [{ op: 'where', predicate: { op: 'exists', value: { ...judged, judgment: ' ' } } }, '/predicate/value/judgment'],
    [{ op: 'where', predicate: { op: 'exists', value: { ...judged, input: judged } } }, '/predicate/value/input/op'],
    [{ op: 'where', predicate: { op: 'exists', value: { ...judged, outcome: 1 } } }, '/predicate/value/outcome'],
    [{ op: 'where', predicate: { op: 'exists', value: { ...judged, op: 'probability' } } }, '/predicate/value/outcome'],
    [{ op: 'where', predicate: { op: 'exists', value: { ...judged, op: 'probability', outcome: null } } }, '/predicate/value/outcome'],
];
