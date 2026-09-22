import { isDecisionDefinition } from './decision';
import { LoqueError } from './errors';
import { copyJson } from './json';
import type {
    DecisionValue, EvaluationGroup, Evaluator, Judgment, JudgmentOptions, JsonValue, RuleEvaluatorOptions,
} from './types';

const judgments = new WeakSet<object>();

function invalid(message: string, path = ''): never {
    throw new LoqueError('INVALID_JUDGMENT', message, path);
}

export function nonblank(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) invalid('Expected a nonblank string', path);
    return value;
}

export function isJudgment(value: unknown): value is Judgment {
    return value !== null && typeof value === 'object' && judgments.has(value);
}

/** Define a reusable, versioned judgment; queries refer to it by name. */
export function judgment<T extends DecisionValue>(options: JudgmentOptions<T>): Judgment<T> {
    if (options === null || typeof options !== 'object') invalid('Expected judgment options');
    const { decision, project } = options;
    if (!isDecisionDefinition(decision)) {
        invalid('Expected a definition from booleanDecision, choiceDecision, or scoreDecision', '/decision');
    }
    if (project !== undefined && typeof project !== 'function') invalid('Expected a projection function', '/project');
    const result: Judgment<T> = Object.freeze({
        name: nonblank(options.name, '/name'),
        version: nonblank(options.version, '/version'),
        evaluator: nonblank(options.evaluator, '/evaluator'),
        decision,
        instructions: copyJson(options.instructions ?? null, 'INVALID_JUDGMENT', true, '/instructions'),
        project(value: JsonValue): JsonValue {
            // Projections are application code; their output must still be JSON.
            return project === undefined ? value : copyJson(project(value), 'INVALID_JUDGMENT');
        },
    });
    judgments.add(result);
    return result;
}

/**
 * Wrap a local function (rules, a classifier, a fixture) as an evaluator.
 * Provenance is filled from the request, so it always matches.
 */
export function ruleEvaluator(options: RuleEvaluatorOptions): Evaluator {
    if (options === null || typeof options !== 'object') invalid('Expected evaluator options');
    const { decide, now = () => new Date(), maxBatchSize } = options;
    if (typeof decide !== 'function') invalid('Expected a decide function', '/decide');
    const name = nonblank(options.name, '/name');
    const version = nonblank(options.version, '/version');
    const model = nonblank(options.model, '/model');
    return Object.freeze({
        name, version, maxBatchSize,
        evaluate: (groups: readonly EvaluationGroup[]) => Promise.all(groups.map(group => Promise.all(
            group.questions.map(async question => ({
                distribution: await decide(group.input, question),
                provenance: {
                    evaluator: name, evaluatorVersion: version, model,
                    judgment: question.judgment, judgmentVersion: question.judgmentVersion,
                    inputHash: group.inputHash, timestamp: now().toISOString(),
                },
            })),
        ))),
    });
}
