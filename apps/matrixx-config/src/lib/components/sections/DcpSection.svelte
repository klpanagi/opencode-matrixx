<script lang="ts">
  import { configStore } from "$lib/store/config-store"
  import type { DcpProfileDefinition } from "$lib/types"
  import FieldEditor from "$lib/components/config/FieldEditor.svelte"
  import StringEditor from "$lib/components/config/StringEditor.svelte"
  import BooleanEditor from "$lib/components/config/BooleanEditor.svelte"
  import EnumEditor from "$lib/components/config/EnumEditor.svelte"
  import NumberEditor from "$lib/components/config/NumberEditor.svelte"
  import ArrayEditor from "$lib/components/config/ArrayEditor.svelte"

  let config = $state(configStore.getSnapshot())
  configStore.subscribe((v) => (config = v))

  let expanded = $state<Set<string>>(new Set(["balanced"]))
  let newProfile = $state("")

  const PRUNE_OPTIONS = [
    { value: "off", label: "Off" },
    { value: "minimal", label: "Minimal" },
    { value: "detailed", label: "Detailed" },
  ]
  const FORCE_OPTIONS = [
    { value: "strong", label: "Strong" },
    { value: "soft", label: "Soft" },
  ]

  function profiles(): Record<string, DcpProfileDefinition> {
    return config.dcp?.profiles ?? {}
  }

  function setProfiles(p: Record<string, DcpProfileDefinition>) {
    configStore.updateConfig((c) => ({ ...c, dcp: { ...c.dcp, profiles: p } }))
  }

  function toggle(n: string) {
    const next = new Set(expanded)
    if (next.has(n)) next.delete(n)
    else next.add(n)
    expanded = next
  }

  function addProfile() {
    const n = newProfile.trim()
    if (!n || profiles()[n]) return
    setProfiles({ ...profiles(), [n]: {} })
    newProfile = ""
    toggle(n)
  }
</script>

<div class="section">
  <h2 class="section-title">DCP</h2>
  <p class="section-desc">Dynamic Context Pruning profiles, handoff compression, and base config.</p>

  <FieldEditor label="Enabled">
    <BooleanEditor value={config.dcp?.enabled ?? true} onChange={(v) => configStore.updateConfig((c) => ({ ...c, dcp: { ...c.dcp, enabled: v } }))} label="DCP enabled" />
  </FieldEditor>

  <FieldEditor label="Default Profile" description="Activated when the command runs without arguments">
    <StringEditor value={config.dcp?.default_profile ?? ""} onChange={(v) => configStore.updateConfig((c) => ({ ...c, dcp: { ...c.dcp, default_profile: v || undefined } }))} label="Default profile" placeholder="balanced" monospace />
  </FieldEditor>

  <FieldEditor label="Handoff Compression" description="Compress background results at the handoff boundary">
    <BooleanEditor value={config.dcp?.handoffCompression?.enabled ?? true} onChange={(v) => configStore.updateConfig((c) => ({ ...c, dcp: { ...c.dcp, handoffCompression: { ...c.dcp?.handoffCompression, enabled: v } } }))} label="Handoff" />
  </FieldEditor>
  <FieldEditor label="Max Messages" advanced>
    <NumberEditor value={config.dcp?.handoffCompression?.maxMessages ?? 6} onChange={(v) => configStore.updateConfig((c) => ({ ...c, dcp: { ...c.dcp, handoffCompression: { ...c.dcp?.handoffCompression, maxMessages: v } } }))} label="Max" min={1} max={100} step={1} />
  </FieldEditor>
  <FieldEditor label="Keep First / Last" advanced>
    <div class="split">
      <NumberEditor value={config.dcp?.handoffCompression?.keepFirst ?? 2} onChange={(v) => configStore.updateConfig((c) => ({ ...c, dcp: { ...c.dcp, handoffCompression: { ...c.dcp?.handoffCompression, keepFirst: v } } }))} label="First" min={0} max={20} step={1} />
      <NumberEditor value={config.dcp?.handoffCompression?.keepLast ?? 3} onChange={(v) => configStore.updateConfig((c) => ({ ...c, dcp: { ...c.dcp, handoffCompression: { ...c.dcp?.handoffCompression, keepLast: v } } }))} label="Last" min={0} max={20} step={1} />
    </div>
  </FieldEditor>

  <FieldEditor label="Profiles" description="Per-profile overrides; builtins apply when unset">
    <div class="preset-add">
      <StringEditor value={newProfile} onChange={(v) => (newProfile = v)} label="New profile" placeholder="Profile name…" monospace />
      <button class="add-btn" type="button" onclick={addProfile} disabled={!newProfile.trim()}>Add</button>
    </div>
    {#each Object.entries(profiles()) as [pname, p]}
      <div class="preset-card">
        <button class="preset-header" type="button" onclick={() => toggle(pname)}>
          <span class="preset-name">{pname}</span>
          <span class="preset-chevron">{expanded.has(pname) ? "▲" : "▼"}</span>
        </button>
        {#if expanded.has(pname)}
          <div class="preset-body">
            <FieldEditor label="Prune Notification">
              <EnumEditor value={p.pruneNotification ?? ""} options={PRUNE_OPTIONS} onChange={(v) => setProfiles({ ...profiles(), [pname]: { ...p, pruneNotification: (v || undefined) as typeof p.pruneNotification } })} label="Notify" placeholder="Inherit" />
            </FieldEditor>
            <FieldEditor label="Max Context" description="Number or percent like 60%" advanced>
              <StringEditor value={String(p.compress?.maxContextLimit ?? "")} onChange={(v) => setProfiles({ ...profiles(), [pname]: { ...p, compress: { ...p.compress, maxContextLimit: v || undefined } } })} label="Max" monospace placeholder="60%" />
            </FieldEditor>
            <FieldEditor label="Min Context" advanced>
              <StringEditor value={String(p.compress?.minContextLimit ?? "")} onChange={(v) => setProfiles({ ...profiles(), [pname]: { ...p, compress: { ...p.compress, minContextLimit: v || undefined } } })} label="Min" monospace placeholder="30%" />
            </FieldEditor>
            <FieldEditor label="Nudge Frequency" advanced>
              <NumberEditor value={p.compress?.nudgeFrequency ?? 3} onChange={(v) => setProfiles({ ...profiles(), [pname]: { ...p, compress: { ...p.compress, nudgeFrequency: v } } })} label="Nudge" min={1} max={20} step={1} />
            </FieldEditor>
            <FieldEditor label="Nudge Force" advanced>
              <EnumEditor value={p.compress?.nudgeForce ?? ""} options={FORCE_OPTIONS} onChange={(v) => setProfiles({ ...profiles(), [pname]: { ...p, compress: { ...p.compress, nudgeForce: (v || undefined) as "strong" | "soft" | undefined } } })} label="Force" placeholder="Inherit" />
            </FieldEditor>
            <FieldEditor label="Iteration Threshold" advanced>
              <NumberEditor value={p.compress?.iterationNudgeThreshold ?? 10} onChange={(v) => setProfiles({ ...profiles(), [pname]: { ...p, compress: { ...p.compress, iterationNudgeThreshold: v } } })} label="Threshold" min={1} max={50} step={1} />
            </FieldEditor>
            <FieldEditor label="Protect Tags" advanced>
              <BooleanEditor value={p.compress?.protectTags ?? false} onChange={(v) => setProfiles({ ...profiles(), [pname]: { ...p, compress: { ...p.compress, protectTags: v || undefined } } })} label="Tags" />
            </FieldEditor>
            <FieldEditor label="Protect User Messages" advanced>
              <BooleanEditor value={p.compress?.protectUserMessages ?? false} onChange={(v) => setProfiles({ ...profiles(), [pname]: { ...p, compress: { ...p.compress, protectUserMessages: v || undefined } } })} label="User msgs" />
            </FieldEditor>
            <FieldEditor label="Protected Tools" advanced>
              <ArrayEditor value={p.compress?.protectedTools ?? []} onChange={(v) => setProfiles({ ...profiles(), [pname]: { ...p, compress: { ...p.compress, protectedTools: v.length > 0 ? v : undefined } } })} label="Protected" placeholder="tool…" />
            </FieldEditor>
            <FieldEditor label="Turn Protection" advanced>
              <BooleanEditor value={p.turnProtection?.enabled ?? false} onChange={(v) => setProfiles({ ...profiles(), [pname]: { ...p, turnProtection: { ...p.turnProtection, enabled: v } } })} label="Protect" />
            </FieldEditor>
            <FieldEditor label="Protected Turns" advanced>
              <NumberEditor value={p.turnProtection?.turns ?? 2} onChange={(v) => setProfiles({ ...profiles(), [pname]: { ...p, turnProtection: { ...p.turnProtection, turns: v } } })} label="Turns" min={1} max={20} step={1} />
            </FieldEditor>
            <FieldEditor label="Error Purge Turns" advanced>
              <NumberEditor value={p.strategies?.purgeErrors?.turns ?? 2} onChange={(v) => setProfiles({ ...profiles(), [pname]: { ...p, strategies: { ...p.strategies, purgeErrors: { turns: v } } } })} label="Purge" min={1} max={20} step={1} />
            </FieldEditor>
            <FieldEditor label="Allow Sub-Agents" advanced>
              <BooleanEditor value={p.experimental?.allowSubAgents ?? false} onChange={(v) => setProfiles({ ...profiles(), [pname]: { ...p, experimental: { ...p.experimental, allowSubAgents: v } } })} label="Sub-agents" />
            </FieldEditor>
          </div>
        {/if}
      </div>
    {/each}
  </FieldEditor>

  <FieldEditor label="Base Config (JSON)" description="Shared base config across profiles" advanced>
    <StringEditor
      value={config.dcp?.base ? JSON.stringify(config.dcp.base, null, 2) : ""}
      onChange={(v) => {
        if (!v.trim()) {
          configStore.updateConfig((c) => ({ ...c, dcp: { ...c.dcp, base: undefined } }))
          return
        }
        try {
          const parsed = JSON.parse(v)
          configStore.updateConfig((c) => ({ ...c, dcp: { ...c.dcp, base: parsed } }))
        } catch { /* keep draft */ }
      }}
      label="Base JSON"
      multiline
      monospace
    />
  </FieldEditor>
</div>

<style>
  .section { max-width: 48rem; }
  .section-title { font-size: 1.25rem; font-weight: 700; margin: 0 0 0.25rem; }
  .section-desc { font-size: 0.875rem; color: var(--color-text-secondary); margin: 0 0 1.5rem; }
  .split { display: flex; gap: 0.75rem; }
  .preset-add { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
  .add-btn { font-size: 0.75rem; padding: 0.375rem 0.625rem; border: 1px solid var(--color-border); border-radius: 0.375rem; color: var(--color-accent); background: transparent; cursor: pointer; }
  .preset-card { border: 1px solid var(--color-border); border-radius: 0.5rem; margin-bottom: 0.5rem; overflow: hidden; }
  .preset-header { display: flex; justify-content: space-between; width: 100%; padding: 0.625rem 0.875rem; border: none; background: none; cursor: pointer; font-family: inherit; }
  .preset-name { font-weight: 600; font-family: monospace; font-size: 0.875rem; }
  .preset-chevron { font-size: 0.6875rem; color: var(--color-text-secondary); }
  .preset-body { padding: 0 0.875rem 0.75rem; border-top: 1px solid var(--color-border); padding-top: 0.75rem; }
</style>
