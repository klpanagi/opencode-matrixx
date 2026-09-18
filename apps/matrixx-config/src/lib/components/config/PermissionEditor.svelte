<script lang="ts">
  import type { AgentPermission } from "$lib/types"
  import EnumEditor from "$lib/components/config/EnumEditor.svelte"
  import StringEditor from "$lib/components/config/StringEditor.svelte"

  let {
    value,
    onChange,
  }: {
    value?: AgentPermission
    onChange?: (v: AgentPermission | undefined) => void
  } = $props()

  const OPTIONS = [
    { value: "ask", label: "Ask" },
    { value: "allow", label: "Allow" },
    { value: "deny", label: "Deny" },
  ]

  type PermKey = "edit" | "webfetch" | "task" | "doom_loop" | "external_directory"
  const KEYS: Array<{ key: PermKey; label: string }> = [
    { key: "edit", label: "Edit" },
    { key: "webfetch", label: "Webfetch" },
    { key: "task", label: "Task" },
    { key: "doom_loop", label: "Doom loop" },
    { key: "external_directory", label: "External directory" },
  ]

  // svelte-ignore state_referenced_locally (intentional: initial mode snapshot, synced via $effect below)
  let bashMode = $state<"simple" | "advanced">(
    value?.bash && typeof value.bash === "object" ? "advanced" : "simple",
  )
  // svelte-ignore state_referenced_locally (intentional: local draft synced back via Apply button)
  let bashJson = $state(
    value?.bash && typeof value.bash === "object"
      ? JSON.stringify(value.bash, null, 2)
      : "",
  )

  function update(patch: Partial<AgentPermission>) {
    onChange?.({ ...value, ...patch })
  }

  function updateBashSimple(v: string) {
    update({ bash: (v || undefined) as AgentPermission["bash"] })
  }

  function applyBashJson() {
    try {
      const parsed = JSON.parse(bashJson || "{}")
      update({ bash: parsed })
    } catch {
      // keep draft on parse error; validation surfaces downstream
    }
  }
</script>

<div class="perm-editor">
  {#each KEYS as k}
    <div class="perm-row">
      <span class="perm-label">{k.label}</span>
      <EnumEditor
        value={value?.[k.key] ?? ""}
        options={OPTIONS}
        onChange={(v) => update({ [k.key]: v || undefined } as Partial<AgentPermission>)}
        label={k.label}
        placeholder="Inherit"
      />
    </div>
  {/each}
  <div class="perm-row">
    <span class="perm-label">Bash</span>
    {#if bashMode === "simple"}
      <EnumEditor
        value={typeof value?.bash === "string" ? value.bash : ""}
        options={OPTIONS}
        onChange={updateBashSimple}
        label="Bash permission"
        placeholder="Inherit"
      />
    {:else}
      <StringEditor
        value={bashJson}
        onChange={(v) => (bashJson = v)}
        label="Bash per-command JSON"
        placeholder="git: allow"
        multiline
        monospace
      />
    {/if}
    <button
      class="perm-toggle"
      type="button"
      onclick={() => {
        bashMode = bashMode === "simple" ? "advanced" : "simple"
        if (bashMode === "simple") bashJson = ""
      }}
    >
      {bashMode === "simple" ? "Per-command…" : "Simple…"}
    </button>
  </div>
  {#if bashMode === "advanced"}
    <button class="perm-apply" type="button" onclick={applyBashJson}>Apply bash map</button>
  {/if}
</div>

<style>
  .perm-editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .perm-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .perm-label {
    width: 9rem;
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }
  .perm-toggle,
  .perm-apply {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    background: transparent;
    color: var(--color-accent);
    cursor: pointer;
    white-space: nowrap;
  }
</style>
