import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createStaticServer } from '../app/server.ts';

async function withServer(fn: (base: string) => Promise<void>) {
  const server = createStaticServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    await fn(base);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

test('static pages, navigation, and health endpoints work on an ephemeral port', async () => {
  await withServer(async base => {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), 'ok');
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');

    const version = await fetch(`${base}/version`);
    assert.equal(version.status, 200);
    const payload = await version.json();
    assert.equal(payload.name, 'frontend-assessment-field-guide-demo');
    assert.equal(payload.version, '1.0.0');
    assert.ok(payload.commit);

    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    const html = await index.text();
    assert.match(html, /aria-label="Primary"/);
    assert.match(html, /href="\/guide\.html"/);
    assert.match(html, /Skip to lab/);
    assert.match(html, /frontend-assessment-field-guide/);

    const guide = await fetch(`${base}/guide.html`);
    assert.equal(guide.status, 200);
    assert.match(await guide.text(), /aria-current="page"/);

    const tokens = await fetch(`${base}/tokens.css`);
    assert.equal(tokens.status, 200);
    assert.match(await tokens.text(), /proctor-ink/);

    const missing = await fetch(`${base}/nope`);
    assert.equal(missing.status, 404);
  });
});

test('api serves station list, one public scenario, runs, and graded answers', async () => {
  await withServer(async base => {
    const list = await fetch(`${base}/api/scenarios`);
    assert.equal(list.status, 200);
    const { stations } = await list.json();
    assert.equal(stations.length, 20);

    const scenario = await fetch(`${base}/api/scenario?id=stale-effect`);
    assert.equal(scenario.status, 200);
    const pub = await scenario.json();
    assert.equal(pub.id, 'stale-effect');
    assert.equal(pub.correct, undefined, 'grading key must not leak');
    assert.equal(pub.rubric, undefined);

    const run = await fetch(`${base}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ station: 'metric-sort' }),
    });
    assert.equal(run.status, 200);
    const runBody = await run.json();
    assert.deepEqual(runBody.outcome.lexicographic, ['10000', '450', '9000']);

    const answer = await fetch(`${base}/api/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ station: 'metric-sort', choice: 'b' }),
    });
    assert.equal(answer.status, 200);
    const verdict = await answer.json();
    assert.equal(verdict.correct, true);
    assert.equal(verdict.rubric.userImpact.length > 0, true);
  });
});

test('api failure paths return JSON errors', async () => {
  await withServer(async base => {
    const badScenario = await fetch(`${base}/api/scenario?id=nope`);
    assert.equal(badScenario.status, 404);

    const badRun = await fetch(`${base}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ station: 'nope' }),
    });
    assert.equal(badRun.status, 400);
    assert.match((await badRun.json()).error, /unknown station/);

    const badAnswer = await fetch(`${base}/api/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ station: 'var-loop', choice: 'z' }),
    });
    assert.equal(badAnswer.status, 400);

    const badJson = await fetch(`${base}/api/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{broken',
    });
    assert.equal(badJson.status, 400);

    const unknownApi = await fetch(`${base}/api/nope`);
    assert.equal(unknownApi.status, 404);
  });
});
