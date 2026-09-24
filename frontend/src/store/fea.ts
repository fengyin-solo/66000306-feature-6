import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FEAModel, FEAResult, ElementDraft } from '../types';
import {
  solve as feaSolve,
  presetCantileverBeam,
  presetBridgeTruss,
  presetSimpleFrame,
  jetColormap,
} from '../utils/fea-solver';
import {
  validateDraft,
  formatAreaMm2,
  formatYoungsGpa,
  formatAllowableMpa,
} from '../utils/element-validation';

export const useFEAStore = defineStore('fea', () => {
  const model = ref<FEAModel>({ nodes: [], elements: [], loads: [] });
  const result = ref<FEAResult | null>(null);
  const selectedPreset = ref<string>('cantilever');
  const showDeformed = ref(false);
  const deformationScale = ref(10);
  const selectedElement = ref<number | null>(null);
  const heatmapMode = ref<'stress' | 'strain' | 'force'>('stress');

  // Unconfirmed panel edits keyed by element id — survive deselection.
  const drafts = ref(new Map<number, ElementDraft>());
  // Element the user tried to switch to while the current draft is unconfirmed.
  const pendingSelection = ref<number | null>(null);

  // ─── Actions ──────────────────────────────────────────────────────────────
  function loadPreset(name: string) {
    selectedPreset.value = name;
    result.value = null;
    selectedElement.value = null;
    drafts.value.clear();
    pendingSelection.value = null;
    switch (name) {
      case 'cantilever':
        model.value = presetCantileverBeam();
        break;
      case 'bridge':
        model.value = presetBridgeTruss();
        break;
      case 'frame':
        model.value = presetSimpleFrame();
        break;
      default:
        model.value = presetCantileverBeam();
    }
    solve();
  }

  function solve() {
    // Single synchronous solve writes per-element results AND result.value,
    // so the detail panel and canvas always reflect the same run.
    result.value = feaSolve(model.value);
  }

  function toggleDeformed() {
    showDeformed.value = !showDeformed.value;
  }

  function selectElement(id: number | null) {
    selectedElement.value = id;
  }

  /** Click-driven selection: intercept switches away from a dirty draft. */
  function requestSelect(id: number | null) {
    const current = selectedElement.value;
    if (id === current) return;
    if (current !== null && id !== null && draftDirty(current)) {
      pendingSelection.value = id;
      return;
    }
    selectedElement.value = id;
  }

  function setHeatmapMode(mode: 'stress' | 'strain' | 'force') {
    heatmapMode.value = mode;
  }

  function addLoad(nodeId: number, fx: number, fy: number) {
    model.value.loads.push({ nodeId, fx, fy });
  }

  function toggleFixed(nodeId: number) {
    const node = model.value.nodes.find((n) => n.id === nodeId);
    if (node) node.fixed = !node.fixed;
  }

  // ─── Property drafts ──────────────────────────────────────────────────────
  /** Create / reset the draft for an element from the committed model. */
  function seedDraft(id: number): ElementDraft {
    const el = model.value.elements.find((e) => e.id === id);
    if (!el) throw new Error(`element ${id} not found`);

    const draft: ElementDraft = {
      areaMm2: formatAreaMm2(el.area),
      youngsGpa: formatYoungsGpa(el.youngsModulus),
      allowableMpa: formatAllowableMpa(el.allowableStress),
      errors: {},
    };
    drafts.value.set(id, draft);
    return draft;
  }

  /** Lazily create the draft for an element, seeded from the committed model. */
  function draftFor(id: number): ElementDraft {
    return drafts.value.get(id) ?? seedDraft(id);
  }

  function draftDirty(id: number): boolean {
    const el = model.value.elements.find((e) => e.id === id);
    const draft = drafts.value.get(id);
    if (!el || !draft) return false;
    return (
      draft.areaMm2.trim() !== formatAreaMm2(el.area) ||
      draft.youngsGpa.trim() !== formatYoungsGpa(el.youngsModulus) ||
      draft.allowableMpa.trim() !== formatAllowableMpa(el.allowableStress)
    );
  }

  /**
   * Validate the draft and commit it when legal. Illegal fields are flagged
   * and keep their previous (model) value; no recompute happens.
   */
  function applyDraft(id: number): boolean {
    const el = model.value.elements.find((e) => e.id === id);
    const draft = drafts.value.get(id);
    if (!el || !draft) return false;

    const parsed = validateDraft(draft);
    if (!parsed.ok) return false;

    el.area = parsed.area;
    el.youngsModulus = parsed.youngsModulus;
    el.allowableStress = parsed.allowableStress;
    solve();
    // Re-seed from the freshly committed values (applied, not dirty).
    seedDraft(id);
    return true;
  }

  /** Revert the panel draft back to the committed values. */
  function discardDraft(id: number) {
    seedDraft(id);
  }

  // ─── Pending-selection dialog ─────────────────────────────────────────────
  function confirmPendingSelection(): boolean {
    const target = pendingSelection.value;
    const current = selectedElement.value;
    pendingSelection.value = null;
    if (target === null || current === null || target === current) return true;
    if (applyDraft(current)) {
      selectedElement.value = target;
      return true;
    }
    return false; // validation failed — stay on the current element
  }

  function discardPendingSelection() {
    const target = pendingSelection.value;
    const current = selectedElement.value;
    pendingSelection.value = null;
    if (current !== null) seedDraft(current);
    if (target !== null) selectedElement.value = target;
  }

  function cancelPendingSelection() {
    pendingSelection.value = null;
  }

  // ─── Computed ─────────────────────────────────────────────────────────────
  const maxStress = computed(() => {
    if (!result.value) return 0;
    return result.value.maxStress;
  });

  const maxDisplacement = computed(() => {
    if (!result.value) return 0;
    return result.value.maxDisplacement;
  });

  const elementColors = computed(() => {
    const colors = new Map<number, string>();
    if (!result.value || model.value.elements.length === 0) {
      for (const el of model.value.elements) {
        colors.set(el.id, '#6b7280');
      }
      return colors;
    }

    let values: number[];
    switch (heatmapMode.value) {
      case 'stress':
        values = result.value.stresses.map(Math.abs);
        break;
      case 'strain':
        values = result.value.strains.map(Math.abs);
        break;
      case 'force':
        values = model.value.elements.map((e) => Math.abs(e.force));
        break;
      default:
        values = result.value.stresses.map(Math.abs);
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    for (let i = 0; i < model.value.elements.length; i++) {
      colors.set(
        model.value.elements[i].id,
        jetColormap(values[i], min, max)
      );
    }
    return colors;
  });

  return {
    model,
    result,
    selectedPreset,
    showDeformed,
    deformationScale,
    selectedElement,
    heatmapMode,
    drafts,
    pendingSelection,
    maxStress,
    maxDisplacement,
    elementColors,
    loadPreset,
    solve,
    toggleDeformed,
    selectElement,
    requestSelect,
    setHeatmapMode,
    addLoad,
    toggleFixed,
    draftFor,
    draftDirty,
    applyDraft,
    discardDraft,
    confirmPendingSelection,
    discardPendingSelection,
    cancelPendingSelection,
  };
});
