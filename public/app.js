import { gradeSession, formatClock, STATIONS } from './lab.js';

const $ = selector => document.querySelector(selector);
const stationGrid = $('#station-grid');
const traceList = $('#trace-list');
const optionList = $('#option-list');
const answerForm = $('#answer-form');
const submitBtn = $('#submit');
const timerEl = $('#timer');
const timedBtn = $('#timed');

const TIMED_MS = 90 * 60 * 1000;

const state = {
  station: null,       // current public scenario
  answers: {},         // stationId -> choiceId
  graded: {},          // stationId -> correct bool
  deadline: null,      // timed-run end timestamp, or null
  locked: false,       // submissions closed (time expired / run ended)
};
let tickId = null;

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

const post = (path, payload) =>
  api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });

function addStep({ label, detail }, index) {
  const li = document.createElement('li');
  li.className = 'revealed';
  const l = document.createElement('span');
  l.className = 'step-label';
  l.textContent = label;
  const d = document.createElement('span');
  d.className = 'step-detail';
  d.textContent = detail;
  li.append(l, d);
  traceList.appendChild(li);
  return index;
}

async function loadStation(id) {
  const scenario = await api(`/api/scenario?id=${encodeURIComponent(id)}`);
  state.station = scenario;
  $('#area-badge').textContent = scenario.area;
  $('#scenario-title').textContent = scenario.title;
  $('#scenario-code').textContent = scenario.code;
  $('#scenario-question').textContent = scenario.question;
  $('#options-legend').textContent = scenario.question;
  traceList.replaceChildren();
  optionList.replaceChildren();
  $('#verdict-badge').textContent = '—';
  $('#verdict-badge').className = 'badge';
  $('#verdict-panel').className = 'verdict-panel';
  $('#verdict-text').textContent = 'Verdict and explanation appear here.';
  $('#verdict-text').className = 'muted';
  $('#fix-output').hidden = true;
  $('#rubric-list').hidden = true;
  submitBtn.disabled = false;

  const already = state.answers[id];
  for (const opt of scenario.options) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'answer';
    input.value = opt.id;
    if (already === opt.id) input.checked = true;
    label.append(input, document.createTextNode(opt.label));
    optionList.appendChild(label);
    input.addEventListener('change', () => {
      [...optionList.children].forEach(l => l.classList.remove('picked'));
      label.classList.add('picked');
    });
  }
  [...stationGrid.children].forEach(btn =>
    btn.setAttribute('aria-pressed', String(btn.dataset.station === id)));
  $('#run-status').textContent = `Loaded “${scenario.title}” — run the trace, then commit.`;
  if (state.locked) revealStation(id);
}

// After the clock locks, stations open read-only: correct answer, explanation,
// fix, and rubric pulled from the local domain module (it ships to the browser).
function revealStation(id) {
  const station = STATIONS.find(s => s.id === id);
  if (!station || state.answers[id]) return; // answered stations already show verdict
  submitBtn.disabled = true;
  [...optionList.querySelectorAll('input')].forEach(i => { i.disabled = true; });
  [...optionList.children].forEach((label, i) => {
    if (station.options[i].id === station.correct) label.classList.add('answer-correct');
  });
  $('#verdict-badge').textContent = 'unanswered';
  $('#verdict-badge').className = 'badge fail';
  $('#verdict-panel').className = 'verdict-panel fail';
  $('#verdict-text').className = '';
  $('#verdict-text').textContent = station.explanation;
  const fix = $('#fix-output');
  fix.hidden = false;
  fix.textContent = `// the fix\n${station.fix}`;
  const rubric = $('#rubric-list');
  rubric.replaceChildren();
  rubric.hidden = false;
  for (const [key, value] of Object.entries(station.rubric)) {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = value;
    row.append(dt, dd);
    rubric.appendChild(row);
  }
}

async function runTrace() {
  if (!state.station) { $('#run-status').textContent = 'Pick a station first.'; return; }
  const run = await post('/api/run', { station: state.station.id });
  traceList.replaceChildren();
  run.steps.forEach(addStep);
  $('#run-status').textContent = `Trace complete: ${run.outcome.summary}`;
}

async function submitAnswer(event) {
  event.preventDefault();
  if (!state.station || state.locked) return;
  const choice = answerForm.elements.answer.value;
  if (!choice) { $('#verdict-text').textContent = 'Pick an option first — committing is part of the test.'; return; }

  const result = await post('/api/answer', { station: state.station.id, choice });
  state.answers[state.station.id] = choice;
  state.graded[state.station.id] = result.correct;

  const badge = $('#verdict-badge');
  badge.textContent = result.correct ? 'correct' : 'missed';
  badge.className = `badge ${result.correct ? 'pass' : 'fail'}`;
  $('#verdict-panel').className = `verdict-panel ${result.correct ? 'pass' : 'fail'}`;
  $('#verdict-text').className = '';
  $('#verdict-text').textContent = result.explanation;

  const fix = $('#fix-output');
  fix.hidden = false;
  fix.textContent = `// the fix\n${result.fix}`;

  const rubric = $('#rubric-list');
  rubric.replaceChildren();
  rubric.hidden = false;
  for (const [key, value] of Object.entries(result.rubric)) {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = value;
    row.append(dt, dd);
    rubric.appendChild(row);
  }

  [...optionList.children].forEach((label, i) => {
    label.classList.remove('picked');
    if (result.correctOption.id === state.station.options[i].id) label.classList.add('answer-correct');
    else if (state.station.options[i].id === choice) label.classList.add('answer-wrong');
  });
  submitBtn.disabled = true;
  refreshScore();
}

function refreshScore() {
  const score = gradeSession(state.answers);
  $('#score-text').textContent = `${score.correct} / ${score.total}`;
  const meter = $('#score-meter');
  meter.setAttribute('aria-valuenow', String(score.correct));
  meter.setAttribute('aria-valuemax', String(score.total));
  $('#score-meter-fill').style.width = `${(score.correct / score.total) * 100}%`;
  $('#score-verdict').textContent = score.verdict;
}

function tickClock() {
  const left = state.deadline - Date.now();
  timerEl.textContent = formatClock(left);
  if (left <= 0) endRun(true);
}

function startTimed() {
  if (state.deadline) { endRun(false); return; }
  state.deadline = Date.now() + TIMED_MS;
  timerEl.hidden = false;
  timerEl.classList.add('running');
  timedBtn.textContent = 'End run';
  $('#run-status').textContent = `Timed run — ${STATIONS.length} stations. The clock locks submissions at 00:00.`;
  tickId = setInterval(tickClock, 1000);
  tickClock();
}

function endRun(expired) {
  clearInterval(tickId);
  state.deadline = null;
  state.locked = true;
  submitBtn.disabled = true;
  [...optionList.querySelectorAll('input')].forEach(i => { i.disabled = true; });
  timerEl.classList.remove('running');
  timerEl.classList.add('done');
  timedBtn.textContent = 'Start timed run · 90:00';
  const score = gradeSession(state.answers);
  $('#score-verdict').textContent =
    (expired ? `time expired — ` : `run ended — `) + score.verdict +
    (score.remaining ? ` (${score.remaining} unanswered = missed)` : '');
  $('#run-status').textContent = 'Submissions locked — click any station to review its rubric.';
}

async function init() {
  const { stations } = await api('/api/scenarios');
  for (const s of stations) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'station-card';
    btn.dataset.station = s.id;
    btn.setAttribute('aria-pressed', 'false');
    const area = document.createElement('span');
    area.className = 'area';
    area.textContent = s.area;
    const title = document.createElement('span');
    title.textContent = s.title;
    btn.append(area, title);
    btn.addEventListener('click', () => loadStation(s.id).catch(e => {
      $('#run-status').textContent = `Load failed: ${e.message}`;
    }));
    stationGrid.appendChild(btn);
  }
  $('#run').addEventListener('click', () => runTrace().catch(e => {
    $('#run-status').textContent = `Trace failed: ${e.message}`;
  }));
  answerForm.addEventListener('submit', e => submitAnswer(e).catch(err => {
    $('#verdict-text').textContent = `Scoring failed: ${err.message}`;
  }));
  timedBtn.addEventListener('click', startTimed);
  $('#reset').addEventListener('click', () => {
    clearInterval(tickId);
    state.answers = {};
    state.graded = {};
    state.deadline = null;
    state.locked = false;
    timerEl.hidden = true;
    timerEl.className = 'timer';
    timedBtn.textContent = 'Start timed run · 90:00';
    stationGrid.replaceChildren();
    refreshScore();
    init();
    traceList.replaceChildren();
    $('#run-status').textContent = 'Session reset — choose a station.';
  });
}

init().catch(e => { $('#run-status').textContent = `Boot failed: ${e.message}`; });
