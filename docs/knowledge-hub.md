# Knowledge Hub (Phase-0 Workaround)

> Zero-code routing for the external knowledge base. No source changes required.
> Configuration reference (registry) below.

## Phase-0: AGENTS.md Pointer (no code)

Workers get KB routing today by pointing at the router index. No files under
`src/` are touched, and nothing under `/home/klpanagi/Dropbox/_knowledge/` is modified.

### Router format

`/home/klpanagi/Dropbox/_knowledge/_index.md` is the single entry point. Its
`## Reference Documents` section is a routing table with columns:

`| File | Content | When to consult |`

Each row maps a KB file to a summary of its content and the task domain that
should trigger reading it. Consult the index first, then read single files on
demand — never bulk-read the corpus.

### Copy-paste AGENTS.md snippet

Add this line to `AGENTS.md` (or project instructions) for immediate routing:

```markdown
Consult /home/klpanagi/Dropbox/_knowledge/_index.md as router before answering domain questions; read single files on demand, never bulk.
```

### Symlink alternative (optional)

If a relative path is preferred, link the KB into the repo root (link only,
never copy):

```bash
ln -s /home/klpanagi/Dropbox/_knowledge ./knowledge-hub
```

Then the pointer becomes `knowledge-hub/_index.md`. The symlink is convenience
only; the canonical path remains `/home/klpanagi/Dropbox/_knowledge/_index.md`.

### Rules

- KB is read-only: no modification, no commits to KB files. Source corpus files
  stay untouched.
- Router-only discipline: always check `_index.md` first; open only the rows
  whose `When to consult` column matches the task.
- Frontmatter is optional for Phase-0; no metadata changes required.
- Secrets: `_index.md` references `api_access/.publisync_env` and
  `api_access/.alz_mongo_env` by filename only — never print or commit their contents.

### Verification

```bash
cat docs/knowledge-hub.md
git status --porcelain src/
ls /home/klpanagi/Dropbox/_knowledge/_index.md
```

Expected: pointer line visible in the doc, `git status --porcelain src/` empty
(no source files changed), and the index file exists.

## Configuration

Declare hubs in `matrixx.jsonc` (project `.opencode/matrixx.jsonc` or user
`~/.config/opencode/matrixx.jsonc`) under the `knowledge` key:

```jsonc
{
  // ...
  "knowledge": {
    "hubs": [
      {
        "name": "kb",
        "path": "/home/klpanagi/Dropbox/_knowledge",
        "index": "_index.md",
        "scope": "global",
        "mode": "router-only"
      },
      {
        "name": "project-kb",
        "path": "./docs/kb",
        "index": "_index.md",
        "scope": "project",
        "mode": "pinned",
        "exclude": ["scratch/**"]
      }
    ]
  }
}
```

### Fields

| Field | Required | Default | Meaning |
|---|---|---|---|
| `name` | yes | — | Hub handle used in `hub:<name>/path` and `@<name>/path` references |
| `path` | yes | — | Hub root. `~`/`~/` expand to home, `$VAR`/`${VAR}` from env, relative paths resolve against the project dir |
| `index` | no | `_index.md` | Router file injected on read, truncated to ~6000 tokens |
| `scope` | no | `global` | `global` (shared KB) or `project` (repo-local) |
| `mode` | no | `router-only` | `router-only` injects the index only; `pinned` additionally injects configured pinned files |
| `exclude` | no | `[]` | Extra picomatch patterns merged over `DEFAULT_KNOWLEDGE_EXCLUDES`; matched paths stay writable |

### Guard behavior

`knowledge-hub-guard` (`tool.execute.before`) makes every hub root read-only:
writes via Write/Edit and destructive Bash (`rm`, `mv`, `>` redirections, ...)
inside a hub root are denied unless the target matches the hub `exclude` list.
Reads are never blocked, paths outside all hubs are never blocked, and a
missing `knowledge` config fails open (writes allowed, one warning logged).

### Confirm flow (user-approved writes)

The deny error names the hub and the blocked path, then instructs the agent:

1. Ask the user via the question tool for confirmation.
2. If the user approves, call `knowledge_hub_confirm` with the path, then
   retry the blocked write.

Approvals are session-scoped and in-memory only (10 min TTL, exact path or
parent dir covers children); without a recorded approval the guard keeps
denying. Never bypass the guard without asking the user first.

### Verification

```bash
bun test src/hooks/knowledge-hub-guard/ src/hooks/knowledge-hub-injector/
rg knowledge-hub-injector src/plugin/tool-execute-after.ts
```
