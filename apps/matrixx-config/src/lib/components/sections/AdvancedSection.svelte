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

  const TRIGGER_OPTIONS = [
    { value: "compacting", label: "Compacting" },
    { value: "idle", label: "Idle" },
    { value: "both", label: "Both" },
  ]
  const PROVIDER_OPTIONS = [
    { value: "llm", label: "LLM" },
    { value: "dspy-gepa", label: "DSPy GEPA" },
  ]

  function evo(path: string, v: string | number | boolean | string[] | undefined) {
    const keys = path.split(".")
    const head = keys[0] ?? ""
    const tail = keys[1] ?? ""
    configStore.updateConfig((c) => {
      const prev = c.evolution ?? {}
      const group: Record<string, unknown> = { ...((prev as Record<string, unknown>)[head] as Record<string, unknown> | undefined ?? {}) }
      if (v === undefined) delete group[tail]
      else group[tail] = v
      return { ...c, evolution: { ...prev, [head]: group } }
    })
  }
</script>

<div class="section">
  <h2 class="section-title">Advanced</h2>
  <p class="section-desc">Power-user integrations, self-evolution, and migration history.</p>

  <h3 class="group">Context Mode</h3>
  <FieldEditor label="Enabled">
    <BooleanEditor value={config.context_mode?.enabled ?? true} onChange={(v) => configStore.updateConfig((c) => ({ ...c, context_mode: { ...c.context_mode, enabled: v } }))} label="Context mode" />
  </FieldEditor>
  <FieldEditor label="Enforce" advanced>
    <BooleanEditor value={config.context_mode?.enforce ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, context_mode: { ...c.context_mode, enforce: v } }))} label="Enforce" />
  </FieldEditor>
  <FieldEditor label="Blocked Tools" advanced>
    <ArrayEditor value={config.context_mode?.blocked_tools ?? []} onChange={(v) => configStore.updateConfig((c) => ({ ...c, context_mode: { ...c.context_mode, blocked_tools: v } }))} label="Blocked" placeholder="tool…" />
  </FieldEditor>

  <h3 class="group">RTK Rewriter</h3>
  <FieldEditor label="Enabled">
    <BooleanEditor value={config.rtk?.enabled ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, rtk: { ...c.rtk, enabled: v } }))} label="RTK" />
  </FieldEditor>
  <FieldEditor label="Binary Path" advanced>
    <StringEditor value={config.rtk?.binary_path ?? ""} onChange={(v) => configStore.updateConfig((c) => ({ ...c, rtk: { ...c.rtk, binary_path: v || undefined } }))} label="Binary" monospace />
  </FieldEditor>
  <FieldEditor label="Timeout (ms)" advanced>
    <NumberEditor value={config.rtk?.timeout_ms ?? 5000} onChange={(v) => configStore.updateConfig((c) => ({ ...c, rtk: { ...c.rtk, timeout_ms: v } }))} label="Timeout" min={1000} max={30000} step={500} />
  </FieldEditor>

  <h3 class="group">Headroom Proxy</h3>
  <FieldEditor label="Enabled">
    <BooleanEditor value={config.headroom?.enabled ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, headroom: { ...c.headroom, enabled: v } }))} label="Headroom" />
  </FieldEditor>
  <FieldEditor label="Proxy URL" advanced>
    <StringEditor value={config.headroom?.proxyUrl ?? ""} onChange={(v) => configStore.updateConfig((c) => ({ ...c, headroom: { ...c.headroom, proxyUrl: v || undefined } }))} label="Proxy URL" placeholder="http://localhost:8080" monospace />
  </FieldEditor>
  <FieldEditor label="Project" advanced>
    <StringEditor value={config.headroom?.project ?? ""} onChange={(v) => configStore.updateConfig((c) => ({ ...c, headroom: { ...c.headroom, project: v || undefined } }))} label="Project" monospace />
  </FieldEditor>
  <FieldEditor label="Backend" advanced>
    <StringEditor value={config.headroom?.backend ?? ""} onChange={(v) => configStore.updateConfig((c) => ({ ...c, headroom: { ...c.headroom, backend: v || undefined } }))} label="Backend" monospace />
  </FieldEditor>

  <h3 class="group">Self Config Skill</h3>
  <FieldEditor label="Enabled">
    <BooleanEditor value={config.matrixx_self_config?.enabled ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, matrixx_self_config: { ...c.matrixx_self_config, enabled: v } }))} label="Self config" />
  </FieldEditor>
  <FieldEditor label="Proactive" advanced>
    <BooleanEditor value={config.matrixx_self_config?.proactive ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, matrixx_self_config: { ...c.matrixx_self_config, proactive: v } }))} label="Proactive" />
  </FieldEditor>

  <h3 class="group">Evolution Loop</h3>
  <FieldEditor label="Enabled">
    <BooleanEditor value={config.evolution?.enabled ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, evolution: { ...c.evolution, enabled: v } }))} label="Evolution" />
  </FieldEditor>
  <FieldEditor label="Max Arg Chars" advanced>
    <NumberEditor value={config.evolution?.watcher?.maxArgChars ?? 4000} onChange={(v) => evo("watcher.maxArgChars", v)} label="Arg chars" min={1} max={100000} step={500} />
  </FieldEditor>
  <FieldEditor label="Max Output Chars" advanced>
    <NumberEditor value={config.evolution?.watcher?.maxOutputChars ?? 8000} onChange={(v) => evo("watcher.maxOutputChars", v)} label="Output chars" min={1} max={200000} step={500} />
  </FieldEditor>
  <FieldEditor label="Skip Tools" description="Tools excluded from trace capture" advanced>
    <ArrayEditor value={config.evolution?.watcher?.skipTools ?? []} onChange={(v) => evo("watcher.skipTools", v.length > 0 ? v : undefined)} label="Skip" placeholder="tool…" />
  </FieldEditor>
  <FieldEditor label="Compressor Provider" advanced>
    <EnumEditor value={config.evolution?.compressor?.provider ?? ""} options={PROVIDER_OPTIONS} onChange={(v) => evo("compressor.provider", v || undefined)} label="Provider" placeholder="Default (llm)" />
  </FieldEditor>
  <FieldEditor label="Compressor Model" advanced>
    <StringEditor value={config.evolution?.compressor?.model ?? ""} onChange={(v) => evo("compressor.model", v || undefined)} label="Model" monospace placeholder="provider/model" />
  </FieldEditor>
  <FieldEditor label="Trigger" advanced>
    <EnumEditor value={config.evolution?.compressor?.trigger ?? ""} options={TRIGGER_OPTIONS} onChange={(v) => evo("compressor.trigger", v || undefined)} label="Trigger" placeholder="Default (both)" />
  </FieldEditor>
  <FieldEditor label="Min Traces" advanced>
    <NumberEditor value={config.evolution?.compressor?.minTraces ?? 5} onChange={(v) => evo("compressor.minTraces", v)} label="Traces" min={1} max={100} step={1} />
  </FieldEditor>
  <FieldEditor label="Max Input Tokens" advanced>
    <NumberEditor value={config.evolution?.compressor?.maxInputTokens ?? 32000} onChange={(v) => evo("compressor.maxInputTokens", v)} label="Tokens" min={1000} max={200000} step={1000} />
  </FieldEditor>
  <FieldEditor label="Output Dir" advanced>
    <StringEditor value={config.evolution?.writer?.outputDir ?? ""} onChange={(v) => evo("writer.outputDir", v || undefined)} label="Output" monospace placeholder=".matrixx/evolution/skills" />
  </FieldEditor>
  <FieldEditor label="Global Skills" advanced>
    <BooleanEditor value={config.evolution?.writer?.globalSkills ?? false} onChange={(v) => evo("writer.globalSkills", v)} label="Global" />
  </FieldEditor>
  <FieldEditor label="Allow Tool Generation" advanced>
    <BooleanEditor value={config.evolution?.writer?.allowToolGeneration ?? false} onChange={(v) => evo("writer.allowToolGeneration", v)} label="Tools" />
  </FieldEditor>
  <FieldEditor label="Allow Agent Generation" advanced>
    <BooleanEditor value={config.evolution?.writer?.allowAgentGeneration ?? false} onChange={(v) => evo("writer.allowAgentGeneration", v)} label="Agents" />
  </FieldEditor>
  <FieldEditor label="Require Approval" advanced>
    <BooleanEditor value={config.evolution?.governance?.requireApproval ?? true} onChange={(v) => evo("governance.requireApproval", v)} label="Approval" />
  </FieldEditor>
  <FieldEditor label="Auto Promote" advanced>
    <BooleanEditor value={config.evolution?.governance?.autoPromote ?? false} onChange={(v) => evo("governance.autoPromote", v)} label="Auto promote" />
  </FieldEditor>
  <FieldEditor label="Auto-Promote Threshold" advanced>
    <NumberEditor value={config.evolution?.governance?.autoPromoteThreshold ?? 0.85} onChange={(v) => evo("governance.autoPromoteThreshold", v)} label="Threshold" min={0} max={1} step={0.01} showSlider />
  </FieldEditor>
  <FieldEditor label="Min Confidence" advanced>
    <NumberEditor value={config.evolution?.governance?.minConfidence ?? 0.7} onChange={(v) => evo("governance.minConfidence", v)} label="Confidence" min={0} max={1} step={0.01} showSlider />
  </FieldEditor>
  <FieldEditor label="Trace Days" advanced>
    <NumberEditor value={config.evolution?.retention?.traceDays ?? 30} onChange={(v) => evo("retention.traceDays", v)} label="Days" min={1} max={365} step={1} />
  </FieldEditor>
  <FieldEditor label="Max Pending" advanced>
    <NumberEditor value={config.evolution?.retention?.maxPending ?? 50} onChange={(v) => evo("retention.maxPending", v)} label="Pending" min={1} max={500} step={1} />
  </FieldEditor>
  <FieldEditor label="Max Compressions / Hour" advanced>
    <NumberEditor value={config.evolution?.budget?.maxCompressionsPerHour ?? 10} onChange={(v) => evo("budget.maxCompressionsPerHour", v)} label="Compressions" min={1} max={100} step={1} />
  </FieldEditor>
  <FieldEditor label="Max Cost Cents / Day" advanced>
    <NumberEditor value={config.evolution?.budget?.maxCostCentsPerDay ?? 100} onChange={(v) => evo("budget.maxCostCentsPerDay", v)} label="Cost" min={0} max={100000} step={10} />
  </FieldEditor>

  <h3 class="group">Migrations</h3>
  <FieldEditor label="Applied Migrations" description="Prevents re-applying migrations" advanced>
    <ArrayEditor value={config._migrations ?? []} onChange={(v) => configStore.updateConfig((c) => ({ ...c, _migrations: v.length > 0 ? v : undefined }))} label="Migrations" placeholder="migration-id…" />
  </FieldEditor>
</div>

<style>
  .section { max-width: 48rem; }
  .section-title { font-size: 1.25rem; font-weight: 700; margin: 0 0 0.25rem; }
  .section-desc { font-size: 0.875rem; color: var(--color-text-secondary); margin: 0 0 1rem; }
  .group { font-size: 0.9375rem; font-weight: 600; margin: 1.5rem 0 0.75rem; }
</style>
