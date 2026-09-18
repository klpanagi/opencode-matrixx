<script lang="ts">
  import { configStore } from "$lib/store/config-store"
  import FieldEditor from "$lib/components/config/FieldEditor.svelte"
  import StringEditor from "$lib/components/config/StringEditor.svelte"
  import BooleanEditor from "$lib/components/config/BooleanEditor.svelte"
  import EnumEditor from "$lib/components/config/EnumEditor.svelte"
  import NumberEditor from "$lib/components/config/NumberEditor.svelte"
  import ArrayEditor from "$lib/components/config/ArrayEditor.svelte"

  let config = $state(configStore.getSnapshot())
  configStore.subscribe((v) => (config = v))

  function bg(patch: Record<string, unknown>) {
    configStore.updateConfig((c) => ({ ...c, background_task: { ...c.background_task, ...patch } }))
  }

  function providers(): string[] {
    return (config.assembly?.providers ?? []).map((p) => `${p.providerID}/${p.modelID}`)
  }

  function setProviders(list: string[]) {
    const parsed = list
      .map((s) => {
        const i = s.indexOf("/")
        if (i < 0) return null
        return { providerID: s.slice(0, i).trim(), modelID: s.slice(i + 1).trim() }
      })
      .filter((x) => x && x.providerID && x.modelID) as Array<{ providerID: string; modelID: string }>
    configStore.updateConfig((c) => ({
      ...c,
      assembly: { ...c.assembly, providers: parsed.length > 0 ? parsed : undefined },
    }))
  }
</script>

<div class="section">
  <h2 class="section-title">Background & Assembly</h2>
  <p class="section-desc">Concurrency, timeouts, circuit breakers, and multi-model voting.</p>

  <h3 class="group">Background Tasks</h3>
  <FieldEditor label="Default Concurrency" advanced>
    <NumberEditor value={config.background_task?.defaultConcurrency ?? 4} onChange={(v) => bg({ defaultConcurrency: v })} label="Concurrency" min={1} max={32} step={1} />
  </FieldEditor>
  <FieldEditor label="Stale Timeout (ms)" description="Interrupt tasks idle longer than this (min 60000)">
    <NumberEditor value={config.background_task?.staleTimeoutMs ?? 180000} onChange={(v) => bg({ staleTimeoutMs: v })} label="Stale timeout" min={60000} max={3600000} step={60000} />
  </FieldEditor>
  <FieldEditor label="Message Staleness (ms)" advanced>
    <NumberEditor value={config.background_task?.messageStalenessTimeoutMs ?? 600000} onChange={(v) => bg({ messageStalenessTimeoutMs: v })} label="Staleness" min={60000} max={7200000} step={60000} />
  </FieldEditor>
  <FieldEditor label="Max Tool Calls" description="Shorthand for circuitBreaker.maxToolCalls">
    <NumberEditor value={config.background_task?.maxToolCalls ?? 100} onChange={(v) => bg({ maxToolCalls: v })} label="Max calls" min={10} max={10000} step={10} />
  </FieldEditor>
  <FieldEditor label="Circuit Breaker" advanced>
    <BooleanEditor value={config.background_task?.circuitBreaker?.enabled ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, background_task: { ...c.background_task, circuitBreaker: { ...c.background_task?.circuitBreaker, enabled: v } } }))} label="Breaker" />
  </FieldEditor>
  <FieldEditor label="Breaker Max Calls" advanced>
    <NumberEditor value={config.background_task?.circuitBreaker?.maxToolCalls ?? 100} onChange={(v) => configStore.updateConfig((c) => ({ ...c, background_task: { ...c.background_task, circuitBreaker: { ...c.background_task?.circuitBreaker, maxToolCalls: v } } }))} label="Calls" min={10} max={10000} step={10} />
  </FieldEditor>
  <FieldEditor label="Consecutive Threshold" advanced>
    <NumberEditor value={config.background_task?.circuitBreaker?.consecutiveThreshold ?? 5} onChange={(v) => configStore.updateConfig((c) => ({ ...c, background_task: { ...c.background_task, circuitBreaker: { ...c.background_task?.circuitBreaker, consecutiveThreshold: v } } }))} label="Threshold" min={5} max={100} step={1} />
  </FieldEditor>
  <FieldEditor label="Nested Admission" description="Prevents self-deadlock for managed children" advanced>
    <BooleanEditor value={config.background_task?.nestedAdmission?.enabled ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, background_task: { ...c.background_task, nestedAdmission: { ...c.background_task?.nestedAdmission, enabled: v } } }))} label="Nested" />
  </FieldEditor>
  <FieldEditor label="Nested Mode" advanced>
    <EnumEditor value={config.background_task?.nestedAdmission?.mode ?? ""} options={[{ value: "bypass", label: "Bypass" }, { value: "reserve", label: "Reserve" }]} onChange={(v) => configStore.updateConfig((c) => ({ ...c, background_task: { ...c.background_task, nestedAdmission: { ...c.background_task?.nestedAdmission, mode: (v || undefined) as "bypass" | "reserve" | undefined } } }))} label="Nested mode" placeholder="Default" />
  </FieldEditor>
  <FieldEditor label="Nested Max Depth (1-5)" advanced>
    <NumberEditor value={config.background_task?.nestedAdmission?.maxDepth ?? 2} onChange={(v) => configStore.updateConfig((c) => ({ ...c, background_task: { ...c.background_task, nestedAdmission: { ...c.background_task?.nestedAdmission, maxDepth: v } } }))} label="Depth" min={1} max={5} step={1} showSlider />
  </FieldEditor>
  <FieldEditor label="Wake Interval (ms)" advanced>
    <NumberEditor value={config.background_task?.wakeScheduler?.intervalMs ?? 300000} onChange={(v) => configStore.updateConfig((c) => ({ ...c, background_task: { ...c.background_task, wakeScheduler: { ...c.background_task?.wakeScheduler, intervalMs: v } } }))} label="Interval" min={60000} max={3600000} step={60000} />
  </FieldEditor>
  <FieldEditor label="Job Snapshots" description="Max retained job-board snapshots" advanced>
    <NumberEditor value={config.background_task?.jobBoard?.maxRetainedSnapshots ?? 20} onChange={(v) => configStore.updateConfig((c) => ({ ...c, background_task: { ...c.background_task, jobBoard: { ...c.background_task?.jobBoard, maxRetainedSnapshots: v } } }))} label="Snapshots" min={1} max={100} step={1} />
  </FieldEditor>
  <FieldEditor label="Job Strategy" advanced>
    <EnumEditor value={config.background_task?.jobBoard?.strategy ?? ""} options={[{ value: "latest", label: "Latest" }, { value: "checkpoint-compatible", label: "Checkpoint compatible" }]} onChange={(v) => configStore.updateConfig((c) => ({ ...c, background_task: { ...c.background_task, jobBoard: { ...c.background_task?.jobBoard, strategy: (v || undefined) as "latest" | "checkpoint-compatible" | undefined } } }))} label="Strategy" placeholder="Default (latest)" />
  </FieldEditor>
  <FieldEditor label="Admission Timeout (ms)" description="0 means unbounded" advanced>
    <NumberEditor value={config.background_task?.admissionTimeoutMs ?? 0} onChange={(v) => bg({ admissionTimeoutMs: v })} label="Admission" min={0} max={3600000} step={60000} />
  </FieldEditor>
  <FieldEditor label="Wall-Clock Timeout (ms)" description="0 means off" advanced>
    <NumberEditor value={config.background_task?.wallClockTimeoutMs ?? 0} onChange={(v) => bg({ wallClockTimeoutMs: v })} label="Wall clock" min={0} max={2147483647} step={60000} />
  </FieldEditor>
  <FieldEditor label="Abort Grace (ms)" advanced>
    <NumberEditor value={config.background_task?.wallClockAbortGraceMs ?? 5000} onChange={(v) => bg({ wallClockAbortGraceMs: v })} label="Grace" min={1000} max={60000} step={1000} />
  </FieldEditor>
  <FieldEditor label="Wake Scheduler" advanced>
    <BooleanEditor value={config.background_task?.wakeScheduler?.enabled ?? true} onChange={(v) => configStore.updateConfig((c) => ({ ...c, background_task: { ...c.background_task, wakeScheduler: { ...c.background_task?.wakeScheduler, enabled: v } } }))} label="Wake" />
  </FieldEditor>
  <FieldEditor label="Job Board" advanced>
    <BooleanEditor value={config.background_task?.jobBoard?.enabled ?? true} onChange={(v) => configStore.updateConfig((c) => ({ ...c, background_task: { ...c.background_task, jobBoard: { ...c.background_task?.jobBoard, enabled: v } } }))} label="Job board" />
  </FieldEditor>

  <FieldEditor label="Concurrency Maps (JSON)" description="Provider to concurrency count mapping" advanced>
    <StringEditor
      value={config.background_task?.providerConcurrency
        ? JSON.stringify(config.background_task.providerConcurrency, null, 2)
        : ""}
      onChange={(v) => {
        if (!v.trim()) {
          bg({ providerConcurrency: undefined })
          return
        }
        try {
          bg({ providerConcurrency: JSON.parse(v) })
        } catch { /* keep draft */ }
      }}
      label="Provider concurrency"
      multiline
      monospace
    />
  </FieldEditor>
  <FieldEditor label="Model Concurrency (JSON)" description="Model to concurrency count mapping" advanced>
    <StringEditor
      value={config.background_task?.modelConcurrency
        ? JSON.stringify(config.background_task.modelConcurrency, null, 2)
        : ""}
      onChange={(v) => {
        if (!v.trim()) {
          bg({ modelConcurrency: undefined })
          return
        }
        try {
          bg({ modelConcurrency: JSON.parse(v) })
        } catch { /* keep draft */ }
      }}
      label="Model concurrency"
      multiline
      monospace
    />
  </FieldEditor>

  <h3 class="group">Assembly (multi-model voting)</h3>
  <FieldEditor label="Enabled">
    <BooleanEditor value={config.assembly?.enabled ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, assembly: { ...c.assembly, enabled: v } }))} label="Assembly" />
  </FieldEditor>
  <FieldEditor label="Providers" description="Format: providerID/modelID">
    <ArrayEditor value={providers()} onChange={setProviders} label="Providers" placeholder="provider/model…" />
  </FieldEditor>
  <FieldEditor label="Default Voters (2-5)">
    <NumberEditor value={config.assembly?.default_voters ?? 3} onChange={(v) => configStore.updateConfig((c) => ({ ...c, assembly: { ...c.assembly, default_voters: v } }))} label="Voters" min={2} max={5} step={1} showSlider />
  </FieldEditor>
  <FieldEditor label="Default Rounds (1-3)">
    <NumberEditor value={config.assembly?.default_rounds ?? 2} onChange={(v) => configStore.updateConfig((c) => ({ ...c, assembly: { ...c.assembly, default_rounds: v } }))} label="Rounds" min={1} max={3} step={1} showSlider />
  </FieldEditor>
  <FieldEditor label="Timeout (ms)" advanced>
    <NumberEditor value={config.assembly?.timeout_ms ?? 120000} onChange={(v) => configStore.updateConfig((c) => ({ ...c, assembly: { ...c.assembly, timeout_ms: v } }))} label="Timeout" min={10000} max={300000} step={10000} />
  </FieldEditor>

  <h3 class="group">Runtime Fallback</h3>
  <FieldEditor label="Enabled">
    <BooleanEditor value={config.runtime_fallback?.enabled ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, runtime_fallback: { ...c.runtime_fallback, enabled: v } }))} label="Fallback" />
  </FieldEditor>
  <FieldEditor label="Retry On Errors" description="HTTP codes that trigger fallback (comma-separated)" advanced>
    <StringEditor
      value={(config.runtime_fallback?.retry_on_errors ?? []).join(", ")}
      onChange={(v) => {
        const nums = v.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
        configStore.updateConfig((c) => ({
          ...c,
          runtime_fallback: { ...c.runtime_fallback, retry_on_errors: nums.length > 0 ? nums : undefined },
        }))
      }}
      label="Retry codes"
      placeholder="429, 500, 502, 503, 504"
      monospace
    />
  </FieldEditor>
  <FieldEditor label="Max Attempts" advanced>
    <NumberEditor value={config.runtime_fallback?.max_fallback_attempts ?? 3} onChange={(v) => configStore.updateConfig((c) => ({ ...c, runtime_fallback: { ...c.runtime_fallback, max_fallback_attempts: v } }))} label="Attempts" min={1} max={10} step={1} />
  </FieldEditor>
  <FieldEditor label="Cooldown (s)" advanced>
    <NumberEditor value={config.runtime_fallback?.cooldown_seconds ?? 60} onChange={(v) => configStore.updateConfig((c) => ({ ...c, runtime_fallback: { ...c.runtime_fallback, cooldown_seconds: v } }))} label="Cooldown" min={1} max={3600} step={1} />
  </FieldEditor>
  <FieldEditor label="Timeout (s, 0=off)" advanced>
    <NumberEditor value={config.runtime_fallback?.timeout_seconds ?? 30} onChange={(v) => configStore.updateConfig((c) => ({ ...c, runtime_fallback: { ...c.runtime_fallback, timeout_seconds: v } }))} label="Timeout" min={0} max={600} step={5} />
  </FieldEditor>
  <FieldEditor label="Notify On Fallback" advanced>
    <BooleanEditor value={config.runtime_fallback?.notify_on_fallback ?? true} onChange={(v) => configStore.updateConfig((c) => ({ ...c, runtime_fallback: { ...c.runtime_fallback, notify_on_fallback: v } }))} label="Notify" />
  </FieldEditor>
</div>

<style>
  .section { max-width: 48rem; }
  .section-title { font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); margin: 0 0 0.25rem; }
  .section-desc { font-size: 0.875rem; color: var(--color-text-secondary); margin: 0 0 1rem; }
  .group { font-size: 0.9375rem; font-weight: 600; margin: 1.5rem 0 0.75rem; }
</style>
