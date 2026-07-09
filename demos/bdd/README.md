# BDD Generated Demos

End-to-end examples of the bdd-* pipeline output. Each subdirectory is one
feature; run `/bdd-pipeline <feature>` to (re)generate it from a `.feature`
file in `demos/bdd/<feature>/`.

## Layout

```
demos/bdd/
├── login/          # Fully generated (contract + components + tests + backend)
├── recovery/
├── registration/
├── session/
└── welcome/
```

Each generated feature has:

```
<feature>/
├── *.feature                          # Gherkin source (input)
├── *.feature.contract.json            # Contract (Phase 1 output)
├── components/                        # Phase 2 — React
│   ├── LoginPage.tsx, LoginTypes.ts, LoginConstants.ts, index.ts
│   └── preview-server.ts              # Bun.serve() for visual review
├── tests/                             # Phase 3 — Cucumber
│   ├── login.steps.ts                 # step definitions
│   ├── world.ts, hooks.ts             # Playwright lifecycle
│   └── pages/                         # page object model
├── backend/                           # Phase 4 — typed API
├── cucumber.cjs                       # Cucumber config (CommonJS — see "CJS gotcha")
├── Dockerfile                         # Containerised test runner (per-feature)
└── run-tests.sh                       # Local test runner (starts preview + runs cucumber)
```

## Running locally

The fastest loop is the per-feature shell script — it starts the preview
server, waits for it to be reachable, runs cucumber, and tears everything down
on exit.

```bash
# All scenarios:
bash demos/bdd/login/run-tests.sh

# Tag filter (forwarded to cucumber-js):
bash demos/bdd/login/run-tests.sh --tags @happy-path
bash demos/bdd/login/run-tests.sh --tags "not @unhappy"

# Point at a different app URL (e.g. staging):
BDD_BASE_URL=https://staging.example.com bash demos/bdd/login/run-tests.sh
```

## Running in Docker

Each feature has its own Dockerfile. Build context is the repo root; the
`.dockerignore` at the repo root keeps the context small.

```bash
# Build (one image per feature):
docker build -f demos/bdd/login/Dockerfile -t matrixx-bdd-login .

# Run with all defaults:
docker run --rm matrixx-bdd-login

# Tag filter:
docker run --rm -e BDD_ARGS="--tags @happy-path" matrixx-bdd-login
```

## Running every feature (parent batch runner)

When the pipeline is run on a directory of multiple `.feature` files, it also
generates a **parent** `Dockerfile` and `run-tests.sh` at the input directory
root. The parent runner discovers every subdirectory that has a per-feature
`run-tests.sh` and invokes them in sequence, aggregating pass/fail counts.

```bash
# Run all features locally:
bash demos/bdd/run-tests.sh

# Run a single feature by name (e.g. just `login`):
BDD_FEATURE=login bash demos/bdd/run-tests.sh

# Forward cucumber args to every feature:
bash demos/bdd/run-tests.sh --tags @happy-path
```

In Docker, the parent image builds once and runs them all:

```bash
# Build the parent image:
docker build -f demos/bdd/Dockerfile -t matrixx-bdd .

# Run all features:
docker run --rm matrixx-bdd

# Run a single feature:
docker run --rm -e BDD_FEATURE=login matrixx-bdd

# Forward cucumber args:
docker run --rm -e BDD_ARGS="--tags @happy-path" matrixx-bdd
```

The parent exits 0 only when every feature passes. Failures are listed at the
end of the run.


## Adding a new feature

1. Drop a `<feature>.feature` (pure Gherkin, no `# @` comments) into
   `demos/bdd/<name>/`.
2. Run the pipeline:
   ```bash
   /bdd-pipeline demos/bdd/<name>/<feature>.feature --out demos/bdd/<name>
   ```
3. The pipeline will:
   - Produce `<feature>.feature.contract.json` (via bdd-contract agent + deterministic tools)
   - Generate `components/` including a self-contained `preview-server.ts` (via bdd-frontend skill)
   - Generate `tests/` (via bdd-tests skill)
   - Generate `backend/` (via bdd-backend skill)
   - Generate a per-feature `Dockerfile` and `run-tests.sh` (via bdd-tests skill)

## CJS gotcha (cucumber.cjs)

`cucumber.cjs` is CommonJS, not `.js`, because the matrixx `package.json` has
`"type": "module"`. Renaming it to `cucumber.js` would make Node treat it as
ESM and fail with `module is not defined`. The file extension tells Node
explicitly to use CommonJS regardless of the project setting.
