import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATIONS,
  listStations,
  getStation,
  publicScenario,
  simulateStation,
  evaluateAnswer,
  gradeSession,
  formatClock,
} from '../public/lab.js';

test('twenty stations cover the assessment areas', () => {
  assert.equal(STATIONS.length, 20);
  const ids = listStations().map(s => s.id);
  assert.deepEqual(ids, [
    'var-loop', 'stale-effect', 'big-table', 'fetch-ok', 'metric-sort', 'div-button',
    'microtasks', 'memo-deps', 'abort-fetch', 'timezone', 'focus-trap', 'derived-state',
    'token-storage', 'xss-inner', 'index-keys', 'ts-narrow',
    'this-binding', 'mutate-props', 'coercion', 'aria-live',
  ]);
});

test('every station has a complete grading payload', () => {
  for (const s of STATIONS) {
    assert.ok(s.code.length > 0, s.id);
    assert.ok(s.question.length > 0, s.id);
    assert.ok(s.options.length >= 3, s.id);
    assert.ok(s.options.some(o => o.id === s.correct), `${s.id}: correct id must exist in options`);
    assert.ok(s.explanation.length > 0, s.id);
    assert.ok(s.fix.length > 0, s.id);
    for (const key of ['assumption', 'options', 'tradeOff', 'userImpact']) {
      assert.ok(s.rubric[key as keyof typeof s.rubric].length > 0, `${s.id}.rubric.${key}`);
    }
  }
});

test('publicScenario strips grading fields', () => {
  const pub = publicScenario('var-loop') as Record<string, unknown>;
  assert.equal(pub.correct, undefined);
  assert.equal(pub.explanation, undefined);
  assert.equal(pub.fix, undefined);
  assert.equal(pub.rubric, undefined);
  assert.ok(Array.isArray(pub.options));
});

test('var-loop trace ends at 3,3,3 and let fix logs 0,1,2', () => {
  const run = simulateStation('var-loop');
  assert.deepEqual(run.outcome.logged, [3, 3, 3]);
  assert.deepEqual(run.outcome.fixedLogged, [0, 1, 2]);
  assert.ok(run.steps.length >= 6);
});

test('stale-effect writes 1 every tick while functional update reaches N', () => {
  const run = simulateStation('stale-effect');
  assert.deepEqual(run.outcome.writes, [1, 1, 1]);
  assert.deepEqual(run.outcome.fixedWrites, [1, 2, 3]);
});

test('big-table binds DOM cost: naive 400k nodes vs 320 windowed', () => {
  const run = simulateStation('big-table');
  const nodes = run.outcome.nodes;
  assert.equal(nodes.naive, 400_000);
  assert.equal(nodes.memoized, 400_000); // memo skips re-render, not first render
  assert.equal(nodes.virtualized, 320);
  assert.equal(nodes.paginated, 200);
});

test('fetch-ok resolves on HTTP errors and rejects only on transport failure', () => {
  const run = simulateStation('fetch-ok');
  assert.deepEqual(run.outcome.resolvesOn, ['200', '404', '500']);
  assert.ok(run.outcome.rejectsOn.includes('network failure'));
});

test('metric-sort shows lexicographic trap and numeric fix', () => {
  const run = simulateStation('metric-sort');
  assert.deepEqual(run.outcome.lexicographic, ['10000', '450', '9000']);
  assert.deepEqual(run.outcome.numeric, [450, 9000, 10000]);
});

test('div-button is unreachable by keyboard while real button is focusable', () => {
  const run = simulateStation('div-button');
  assert.equal(run.outcome.focusable.div, false);
  assert.equal(run.outcome.focusable.button, true);
});

test('microtasks drain before macrotasks: a, d, c, b', () => {
  const run = simulateStation('microtasks');
  assert.deepEqual(run.outcome.order, ['a', 'd', 'c', 'b']);
});

test('memo-deps stays stale under empty dep array', () => {
  const run = simulateStation('memo-deps');
  assert.equal(run.outcome.stale, true);
});

test('abort-fetch: last-resolved (stale) wins without cancellation', () => {
  const run = simulateStation('abort-fetch');
  assert.match(run.outcome.winner, /r1/);
});

test('timezone: date-only string renders a day early in UTC-4', () => {
  const run = simulateStation('timezone');
  assert.equal(run.outcome.renderedAs, '10/4/2026 (UTC-4)');
});

test('focus-trap: background page keeps Tab order without a trap', () => {
  const run = simulateStation('focus-trap');
  assert.equal(run.outcome.trapped, false);
});

test('derived-state snapshot survives prop updates', () => {
  const run = simulateStation('derived-state');
  assert.equal(run.outcome.stale, true);
});

test('token-storage: localStorage readable by origin scripts, httpOnly not', () => {
  const run = simulateStation('token-storage');
  assert.equal(run.outcome.exposed.localStorage, true);
  assert.equal(run.outcome.exposed.httpOnlyCookie, false);
});

test('xss-inner: stored payload executes on every viewer', () => {
  const run = simulateStation('xss-inner');
  assert.equal(run.outcome.executes, true);
});

test('index-keys: deleting row 0 corrupts surviving row state', () => {
  const run = simulateStation('index-keys');
  assert.equal(run.outcome.corrupt, true);
});

test('ts-narrow: union member access fails until narrowed', () => {
  const run = simulateStation('ts-narrow');
  assert.equal(run.outcome.compiles, false);
});

test('this-binding detaches the receiver at the call site', () => {
  const run = simulateStation('this-binding');
  assert.match(run.outcome.thisValue, /HTMLButtonElement|undefined/);
});

test('mutate-props: sort mutates the shared array in place', () => {
  const run = simulateStation('mutate-props');
  assert.equal(run.outcome.mutated, true);
});

test('coercion: a real zero renders the empty state', () => {
  const run = simulateStation('coercion');
  assert.equal(run.outcome.renders, 'Empty state');
});

test('aria-live: async outcome never announced without a live region', () => {
  const run = simulateStation('aria-live');
  assert.equal(run.outcome.announced, false);
});

test('formatClock renders mm:ss and clamps at zero', () => {
  assert.equal(formatClock(90 * 60 * 1000), '90:00');
  assert.equal(formatClock(65_000), '01:05');
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(-500), '00:00');
});

test('evaluateAnswer scores correct and incorrect choices', () => {
  for (const s of STATIONS) {
    const right = evaluateAnswer(s.id, s.correct);
    assert.equal(right.correct, true, s.id);
    const wrong = s.options.find(o => o.id !== s.correct)!;
    const miss = evaluateAnswer(s.id, wrong.id);
    assert.equal(miss.correct, false, s.id);
    assert.equal(miss.correctOption.id, s.correct);
  }
});

test('evaluateAnswer rejects unknown stations and options', () => {
  assert.throws(() => evaluateAnswer('nope', 'a'), /unknown station/);
  assert.throws(() => evaluateAnswer('var-loop', 'z'), /unknown option/);
});

test('simulateStation rejects unknown station', () => {
  assert.throws(() => simulateStation('nope'), /unknown station/);
});

test('gradeSession counts only answered stations and renders a verdict', () => {
  assert.equal(gradeSession({}).answered, 0);
  const allRight = Object.fromEntries(STATIONS.map(s => [s.id, s.correct]));
  const perfect = gradeSession(allRight);
  assert.equal(perfect.correct, 20);
  assert.match(perfect.verdict, /assessment-ready/);
  const oneMiss = gradeSession({ ...allRight, 'var-loop': 'a' });
  assert.equal(oneMiss.correct, 19);
  assert.match(oneMiss.verdict, /strong pass/);
});
