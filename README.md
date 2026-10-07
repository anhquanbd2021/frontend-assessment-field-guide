# Assessment Room — front-end reasoning lab

Companion demo for the article **"The Front-End Assessment Is a Reasoning Test Dressed as a Coding Test"**.

Twenty deterministic stations mirror the question families a front-end technical assessment grades:

1. **The `var` loop** — shared-binding tracing (`3, 3, 3`)
2. **The stale effect** — `useEffect` closure over a render snapshot
3. **The 50,000-row table** — why memoization can't beat DOM quantity
4. **The `fetch` that "works"** — HTTP 500 resolves; only transport fails reject
5. **The sorted revenue column** — lexicographic `sort()` vs numeric comparators
6. **The div that looks like a button** — keyboard and screen-reader reachability
7. **Microtasks beat timers** — event-loop ordering (`a, d, c, b`)
8. **The frozen `useMemo`** — a `[]` dep array caches the first computation forever
9. **The racy search** — last-resolved wins, not last-sent; `AbortController` fix
10. **The off-by-one day** — `"2026-10-05"` parses as UTC midnight
11. **The focus that escapes** — a div modal never receives keyboard focus
12. **Props vs the snapshot** — `useState(prop)` is an initializer, not a subscription
13. **Token in `localStorage`** — origin scripts read it; httpOnly cookies trade XSS for CSRF
14. **The comment that runs** — `innerHTML` on user input is stored XSS
15. **Index keys slide** — delete row 0 and state migrates to the wrong row
16. **Narrow the union** — `string | number` shares only common members; `any` checks nothing
17. **The lost `this`** — extracting a method detaches its receiver; arrow or `.bind` fixes it
18. **The in-place sort** — `sort()` mutates the prop array the parent still owns
19. **The invisible zero** — `count ? … : …` swallows a real `0`; check `!= null`
20. **The silent save** — async outcomes need `aria-live` or screen readers hear nothing

Each station: read the code → run the trace → commit to an answer → read the rubric card
(assumption → options → trade-off → user impact). **Start timed run** puts all twenty
under a 90-minute countdown — the real assessment's format — then locks submissions and
opens every rubric for review.

## Run

```sh
npm start        # node app/server.ts → http://localhost:3000
npm test         # node --test "test/*.test.ts" (unit + e2e, zero deps)
```

Requires Node ≥ 24 (native TypeScript type stripping — `app/server.ts` runs as-is).

## API

| Route | Purpose |
|---|---|
| `GET /health` | liveness (`ok`) |
| `GET /version` | name, version, deploy commit |
| `GET /api/scenarios` | station list |
| `GET /api/scenario?id=<id>` | scenario without grading fields |
| `POST /api/run` `{station}` | deterministic trace + outcome |
| `POST /api/answer` `{station, choice}` | verdict, explanation, fix, rubric |
