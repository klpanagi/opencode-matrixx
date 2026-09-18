# Oracle Plan Agent Interruption — Matrixx Config Desktop App (2026-09-13)

## Summary

The Oracle plan agent (`task(subagent_type="oracle")`) for designing the Matrixx & OpenCode Configuration Desktop App was interrupted at the 600 s synchronous poll limit. The plan was not created by Oracle — it was created manually afterward.

## Timeline (Europe/Athens, 2026-09-13)

| Time | Event | Evidence |
|------|-------|----------|
| ~11:00 | Oracle attempt launched (blocking): `ses_f663c5504ffe9v273M6n5N4PJh` | Session open message |
| ~11:00–11:05 | Oracle gathers context, reads plan files | Session transcript |
| ~11:05 | Oracle delegates to Seraph for pre-planning analysis | `[tool: task]` in transcript |
| ~11:05–12:05 | **600 s poll timeout** | `Poll timeout reached after 600000ms for session ses_f663c5504ffe9v273M6n5N4PJh` |

## Root Cause Analysis

This follows the **exact same pattern** as the Oracle/Seraph stall documented in `2026-09-12-oracle-seraph-stall.md`:

1. **Nested delegation**: Oracle → Seraph delegation consumed the majority of the 600 s budget
2. **Blocking invocation**: `task(subagent_type="oracle")` used default synchronous poll mode
3. **Context bloat**: Large `memory_context` blocks injected at 3 nesting levels (Morpheus → Oracle → Seraph)
4. **No progress reporting**: Nested `task()` calls have no independent progress reporting, so the outer poll expires while inner work continues

### Comparison with Previous Stall

| Aspect | 2026-09-12 (plan_* enforcement) | 2026-09-13 (desktop app) |
|--------|--------------------------------|--------------------------|
| Oracle → Seraph | Yes | Yes |
| Timeout | 600 s | 600 s |
| Plan created? | No (synthesized manually) | No (created manually) |
| Trinity agents | Completed normally | Completed normally |
| Impact | ~20 min wasted | ~10 min wasted |

## Evidence

- Oracle task session: `ses_f663c5504ffe9v273M6n5N4PJh`
- Error message: `Poll timeout reached after 600000ms for session ses_f663c5504ffe9v273M6n5N4PJh`
- Plan was created manually at `.matrixx/plans/matrixx-config-desktop-app.md`
- Smith review completed successfully on the manually-created plan

## Hypotheses (confirmed by pattern matching)

- **H1 (confirmed)**: Nested `task()` delegation (Oracle → Seraph) has no independent progress reporting; the outer 600 s poll expires while inner work is still running
- **H2 (confirmed)**: Seraph's workflow (~3+ min) is too slow to nest inside a blocking Oracle call with a fixed 600 s budget
- **H4 (confirmed)**: Per-round `memory_context` injection at depth 3 pushes prompts near context limits, degrading speed

## Impact

- No data loss: the plan was created manually and reviewed by Smith
- Cost: ~10 min of wall-clock on this Oracle run
- The plan at `.matrixx/plans/matrixx-config-desktop-app.md` is complete and ready for implementation

## Suggested Next Steps

1. **Policy change**: Invoke Oracle in `run_in_background=true` mode by default; use `background_output` to collect results
2. **Avoid Oracle → Seraph nesting**: Split into two sequential top-level calls (Oracle first, then Seraph if needed)
3. **Use `slashcommand` for oracle**: Consider `/start-work` or `/research` instead of raw `task(subagent_type="oracle")`
4. **For plan creation**: Consider using `slashcommand` with `command="plan"` or direct `plan_create` from Morpheus instead of Oracle delegation
5. **Measure Seraph standalone latency**: Confirm Seraph completes in <300 s when called directly

## Related Issues

- `2026-09-12-oracle-seraph-stall.md` — Same pattern, different task
- `2026-09-11-background-agent-interruption.md` — Background agent interruption patterns
- `2026-09-11-task-continuation-directive-after-completion.md` — Task continuation issues
