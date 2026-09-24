# Evolution Portable Exchange Note (D6 backlog, T11)

**Status:** backlog / design only. Not scheduled, not implemented.
**Scope:** documentation. Zero code, zero dependencies, zero hooks/tools/commands.
**Audience:** whoever picks up an export or import story for evolution knowledge later.

---

## 1. Why this exists

Evolution knowledge currently lives on one machine, inside one project checkout,
under `.matrixx/evolution/`. It is derived from that machine's raw tool traces and
that project's git identity. There is no supported way to hand a distilled artifact
to another clone, another contributor, or another machine.

This note sketches what a portable file would look like if we ever want that. It is
deliberately frozen before anyone writes code, so the shape is decided on paper and
not by whatever the first implementation happens to emit.

## 2. Explicit non-goals

- No hosted dependency. No service, registry, or account is involved.
- No federation. No discovery, no publish/subscribe, no sync protocol, no conflict resolution between peers.
- No implementation in this note. No module, MCP server, hook, tool, command, or dependency.
- No migration of existing on-disk stores. Whatever exists locally stays as-is.
- No guarantee that a received bundle is safe to run. Import is a read path, not a trust path.
- No exchange of raw traces by default (see section 6).

## 3. Envelope v1

A single UTF-8 JSON document. Top level carries versioning and integrity, not
domain data.

```json
{
  "schemaVersion": 1,
  "kind": "matrixx.evolution.exchange",
  "producedAt": "2026-09-24T21:40:00.000Z",
  "producer": {
    "matrixxVersion": "2.6.1",
    "platform": "linux-x64",
    "projectId": "sha256:4f2c…",
    "gitCommit": "9c1ab3e"
  },
  "payloadHash": "sha256:1f8a…",
  "signature": null,
  "knowledge": [ /* DistilledKnowledgeExport[] */ ],
  "traces": []            // empty by default; see section 6
}
```

Field notes:

- `schemaVersion` (integer, required). Envelope and payload versions move together in v1. See section 4.
- `kind` (string literal, required). Guards against mistaking some other JSON for this format.
- `producer.projectId` is the git-derived identity already used locally. It is a
  `sha256:<hex>` of the remote URL, or the canonical repo-root path when there is no
  remote. Absent or unknown normalizes to `unscoped-legacy`, exactly as it does today.
- `producer.gitCommit` is informational. It is the commit the knowledge was distilled
  against, not a claim that the bundle applies to that commit.
- `payloadHash` covers `knowledge` + `traces` only, so re-signing does not invalidate
  content addressing.

## 4. Versioning

- `schemaVersion` is an integer, present on every envelope, starting at `1`.
- Within a version, readers MUST ignore unknown object keys rather than reject the
  document. This is the same fail-open posture `normalizeKnowledgeKind` already takes
  for stored JSON, and it is what makes additive changes cheap.
- A major bump (v1 -> v2) happens only when a reader can no longer honor the
  ignore-unknowns rule: a field is renamed, a type changes, or a semantic default
  flips. Example of a flip: deciding `confidence` is no longer 0..1.
- Removed fields stay documented in the note for at least one major version so old
  bundles can be read forward.
- Readers MUST refuse a `schemaVersion` higher than the one they implement. Unknown
  newer major = reject with a clear message, never a best-effort parse.
- There is no separate `minReaderVersion`. `schemaVersion` alone carries the contract.

## 5. Payload v1

Both records below are exported with the field names they have in
`src/features/evolution/types.ts` today. No renaming for the wire; a translation layer
would be pure overhead at this stage.

### 5.1 `DistilledKnowledgeExport`

```json
{
  "id": "guid or content hash of this record",
  "title": "Prefer offline compressor when budget ledger is over cap",
  "summary": "…",
  "patterns": ["…"],
  "pitfalls": ["…"],
  "prerequisites": ["…"],
  "skillDraft": "---\nname: …\n---\n…",
  "confidence": 0.78,
  "kind": "workflow",
  "projectId": "sha256:4f2c…",
  "sourceTraceIDs": ["tr_9f2a…", "tr_11cd…"],
  "sourceSessionIDs": ["ses_abc…"],
  "distilledAt": "2026-09-24T21:12:00.000Z",

  "status": "approved",
  "quarantined": false,
  "superseded": false,
  "superseded_by": null,
  "contentHash": "sha256:77b1…"
}
```

Mapping to current types:

| Field | Source | Notes |
|---|---|---|
| `title`, `summary`, `patterns`, `pitfalls`, `prerequisites`, `skillDraft`, `confidence` | `DistilledKnowledge` | verbatim |
| `kind` | `KnowledgeKind` | `workflow \| correction \| debugging_pattern \| gotcha \| convention`; missing normalizes to `convention` |
| `projectId` | `DistilledKnowledge.projectId` | absent normalizes to `unscoped-legacy` on import |
| `sourceTraceIDs` | `DistilledKnowledge.sourceTraceIDs` | absent defaults to `[]` |
| `distilledAt` | `DistilledKnowledge.distilledAt` | absent is back-filled at import, same as parse time today |
| `status` | `ProposalStatus` | `pending \| approved \| rejected \| quarantined \| superseded` |
| `quarantined`, `superseded` | `RetrievalMeta` | boolean, default `false` |
| `superseded_by` | **new, forward-looking** | `string | null`; see below |

`superseded_by` does not exist in the store yet. It is reserved so that when
supersession with live-head promotion lands, the replacement reference has a home in
the export format and does not require a version bump. Expected shape: the `id` of the
record that replaced this one, or `null` when the record is still live. A record with
`status: "superseded"` and no `superseded_by` is incomplete but still valid.

`contentHash` is `sha256` over the canonical JSON of the record's domain fields
(`title` through `distilledAt`), excluding lifecycle and hash fields. It lets an
importer dedupe across bundles without diffing prose, and it gives `superseded_by`
something stable to point at.

`isRetrievable` semantics are preserved on import. A receiving store evaluates
`status`, `quarantined`, `superseded`, project scope, kind, and token cost exactly as
it does locally. Importing a bundle never makes a record retrievable that the local
predicate would otherwise reject.

### 5.2 `TraceRecordExport`

```json
{
  "id": "tr_9f2a…",
  "timestamp": "2026-09-24T20:58:31.000Z",
  "agent": "morpheus",
  "tool": "bash",
  "args": { "command": "bun run typecheck" },
  "output": "…",
  "durationMs": 4120,
  "success": true,
  "errorType": null,
  "model": "…",

  "sessionID": "ses_…",
  "callID": "call_…",
  "projectId": "sha256:4f2c…",
  "contentHash": "sha256:aa03…"
}
```

`id`, `timestamp`, `agent`, `tool`, `args`, `output`, `durationMs`, `success`,
`errorType?`, `model?` are `TraceRecord` verbatim. `sessionID` and `callID` are the
same type's local bookkeeping fields (section 6), carried for correlation and
treatable as optional by an exporter.

`args` is `unknown` in the type and stays `unknown` on the wire: whatever JSON was
recorded is what ships. Trace payloads are the most likely place for a stray token or
path to appear, which is the whole reason traces are excluded from the default bundle
(section 6).

## 6. Local vs shareable boundary

This is the load-bearing rule of the format. It is a classification of fields, not a
feature flag.

**LOCAL ONLY, never leaves the machine:**

- Raw `TraceRecord` payloads (`args`, `output`). They are unfiltered tool I/O and can
  contain secrets, absolute paths, and host details. Export of traces is opt-in, off by
  default, and gated behind an explicit redaction pass.
- The git remote URL itself. Only the derived `sha256:<hex>` identity travels. The
  remote string stays in memory on the exporting host, matching what the identity
  resolver already does.
- Session IDs (`sessionID`, `sourceSessionIDs`) are local bookkeeping. They are
  meaningless outside the originating install and they link records back to a person's
  working history. v1 ships them in the payload for internal correlation but an exporter
  MAY blank them; a reader MUST treat them as optional.
- Cost/usage numbers (`CompressionUsage`: `inputTokens`, `outputTokens`, `costCents`)
  and the budget ledger. Not knowledge, not portable.
- Everything else under `.matrixx/`: plans, tasks, notepads, handoffs, audit logs,
  background handles.

**SHAREABLE:**

- `DistilledKnowledge` domain fields: `title`, `summary`, `patterns`, `pitfalls`,
  `prerequisites`, `skillDraft`, `confidence`, `kind`, `distilledAt`.
- Content hashes: `payloadHash`, `contentHash`. Hashes are safe by construction; they
  reveal the existence and shape of content, not its content.
- `projectId` as the hash it already is.
- Lifecycle status (`status`, `quarantined`, `superseded`, `superseded_by`) so a
  receiver does not have to rediscover that an artifact is dead.

**Rule of thumb:** if a field was computed from content (hash, distilled summary,
kind, confidence), it is shareable. If a field identifies a machine, a repo URL, a
person's session, or raw I/O, it stays local.

## 7. Signature and provenance

Provenance answers "where did this come from." Signature answers "is it the bytes
that left."

- `payloadHash` is mandatory. `sha256` over canonical JSON (sorted keys, no
  insignificant whitespace). It is an integrity check, not an authenticity check.
- `signature` is optional and `null` in v1. When present:
  ```json
  "signature": {
    "alg": "ed25519",
    "keyId": "sha256:…of the public key",
    "value": "base64…",
    "signedAt": "2026-09-24T21:40:05.000Z"
  }
  ```
  It signs `schemaVersion`, `kind`, `producedAt`, `producer`, and `payloadHash`.
  Signing the hash rather than the payload keeps the signature small and lets a
  verifier confirm content before parsing domain data.
- Keys are local. No key distribution, no revocation list, no certificate authority.
  Whoever you got the bundle from is whoever vouches for the key. That is the whole
  trust model, and it is intentionally weak.
- Hashes and signatures are **not secrets**. Nothing in this format is encrypted. A
  bundle is a plain file; treat it like a plain file.
- Import MUST verify `payloadHash` when present and MUST NOT reject a bundle whose
  `signature` is `null`. Unsigned is the normal case.
- Import MUST run the existing secret-scan gate over `skillDraft` and any string field
  before anything is written to disk. Provenance fields are not a substitute for that
  check.

## 8. Import behavior (constraints, not design)

Listed only so the export shape is not later regretted:

- Import is additive and idempotent. Same `contentHash` + same `projectId` + same
  `kind` = skip.
- Imported records enter as `pending` unless the bundle says otherwise and the local
  quality gate agrees. A bundle cannot promote its own content to `approved`.
- Project scope is re-resolved locally. A bundle from another project never lands in
  this project's retrievable set just because it says so.
- Rejected on: `schemaVersion` > 1, `kind` mismatch, failed `payloadHash`, failed
  secret scan.

## 9. Open questions

- Should `sourceSessionIDs` be blanked by default like raw traces, or kept for
  correlation? Leaning toward blank.
- Is `id` on `DistilledKnowledgeExport` a GUID or the content hash? Content hash
  collapses dedupe and identity into one value but makes re-distillation of the same
  idea look like a duplicate.
- Does `superseded_by` need a hash of the successor as well as its `id`, in case the
  successor never arrives in the same bundle?
- Does v1 need a `traces` section at all, or should the field exist as `null` until
  there is a concrete redaction pass to hang it on?

## 10. Non-goals, restated

No hosted dependency. No federation. No implementation. This file is a backlog note
and nothing in it is a commitment to build.
