import { writable, derived, type Readable } from "svelte/store";
import type { SectionId } from "$lib/types";

export const SECTIONS: Array<{ id: SectionId; label: string; icon: string }> = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { id: "core", label: "Core", icon: "settings" },
  { id: "models", label: "Models & Presets", icon: "layers" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "categories", label: "Categories", icon: "tags" },
  { id: "tasks", label: "Tasks", icon: "check-square" },
  { id: "features", label: "Features", icon: "toggle" },
  { id: "background", label: "Background", icon: "activity" },
  { id: "security", label: "Security", icon: "shield" },
  { id: "dcp", label: "DCP", icon: "zap" },
  { id: "knowledge", label: "Knowledge & Skills", icon: "wrench" },
  { id: "advanced", label: "Advanced", icon: "sliders" },
];

function createUiStore() {
  const _activeSection = writable<SectionId>("dashboard");
  const _searchQuery = writable("");
  const _sidebarOpen = writable(true);

  const filteredSections: Readable<typeof SECTIONS> = derived(
    _searchQuery,
    ($query) => {
      if (!$query.trim()) return SECTIONS;
      const q = $query.toLowerCase();
      return SECTIONS.filter(
        (s) =>
          s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
      );
    },
  );

  function navigate(section: SectionId): void {
    _activeSection.set(section);
    _searchQuery.set("");
  }

  function search(query: string): void {
    _searchQuery.set(query);
  }

  return {
    activeSection: _activeSection,
    searchQuery: _searchQuery,
    sidebarOpen: _sidebarOpen,
    filteredSections,
    navigate,
    search,
    toggleSidebar: () => _sidebarOpen.update((v) => !v),
    subscribe: _activeSection.subscribe,
  };
}

export const uiStore = createUiStore();
