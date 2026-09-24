import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FEAModel, FEAResult, ElementResult } from '../types';
import {
  solve as feaSolve,
  presetCantileverBeam,
  presetBridgeTruss,
  presetSimpleFrame,
  jetColormap,
} from '../utils/fea-solver';
import {
  ALLOWABLE_STRESS,
  parseAreaMm2,
  parseModulusGpa,
  formatAreaMm2,
  formatModulusGpa,
  type ElementDraft,
  type PropertyField,
} from '../utils/element-props';

export interface ApplyResult {
  ok: boolean;
  areaError: string | null;
  modulusError: string | null;
}

export const useFEAStore = defineStore('fea', () => {
  const model = ref<FEAModel>({ nodes: [], elements: [], loads: [] });
  const result = ref<FEAResult | null>(null);
  const selectedPreset = ref<string>('cantilever');
  const showDeformed = ref(false);
  const deformationScale = ref(10);
  const selectedElement = ref<number | null>(null);
  const heatmapMode = ref<'stress' | 'strain' | 'force'>('stress');

  // Unconfirmed edits, keyed by element id. Survives deselection; cleared on preset switch.
  const drafts = ref(new Map<number, ElementDraft>());
  // Element the user tried to switch to while a dirty draft was open (drives confirm dialog).
  const pendingSelection = ref<number | null>(null);

  // ─── Actions ──────────────────────────────────────────────────────────────
  function loadPreset(name: string) {
    selectedPreset.value = name;
    result.value = null;
    selectedElement.value = null;
    drafts.value = new Map();
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
    // Keep detail and canvas in sync from the very first frame.
    solve();
  }

  function solve() {
    result.value = feaSolve(model.value);
  }

  function toggleDeformed() {
    showDeformed.value = !showDeformed.value;
  }

  function setHeatmapMode(mode: 'stress' | 'strain' | 'force') {
    heatmapMode.value = mode;
  }

  // ─── Selection with dirty-draft guard ─────────────────────────────────────
  /**
   * Request selecting (or deselecting) an element.
   * Deselecting is always allowed (drafts are kept). Switching to a different
   * element while any draft is unconfirmed is intercepted via pendingSelection.
   */
  function requestSelect(id: number | null) {
    if (id === selectedElement.value) return;
    if (id !== null) {
      const owner = dirtyDraftOwner();
      // Only intercept when the unconfirmed edits belong to another element;
      // returning to (or deselecting from) the draft's owner is always allowed.
      if (owner !== null && owner !== id) {
        pendingSelection.value = id;
        return;
      }
    }
    selectedElement.value = id;
  }

  function cancelPendingSwitch() {
    pendingSelection.value = null;
  }

  /** After a successful apply, move the selection to the pending element. */
  function finishPendingSwitch() {
    if (pendingSelection.value !== null) {
      selectedElement.value = pendingSelection.value;
    }
    pendingSelection.value = null;
  }

  // ─── Element property drafts ──────────────────────────────────────────────
  function seedDraft(id: number): ElementDraft | null {
    const el = model.value.elements.find((e) => e.id === id);
    if (!el) return null;
    const draft: ElementDraft = {
      areaText: formatAreaMm2(el.area),
      modulusText: formatModulusGpa(el.youngsModulus),
    };
    drafts.value.set(id, draft);
    return draft;
  }

  function ensureDraft(id: number): ElementDraft | null {
    return drafts.value.get(id) ?? seedDraft(id);
  }

  function setDraftField(id: number, field: PropertyField, text: string) {
    const draft = drafts.value.get(id);
    if (!draft) return;
    drafts.value.set(id, {
      ...draft,
      ...(field === 'area' ? { areaText: text } : { modulusText: text }),
    });
  }

  function isDraftDirty(id: number): boolean {
    const el = model.value.elements.find((e) => e.id === id);
    const draft = drafts.value.get(id);
    if (!el || !draft) return false;
    const a = parseAreaMm2(draft.areaText);
    const m = parseModulusGpa(draft.modulusText);
    return (a.ok && a.value !== el.area) || (m.ok && m.value !== el.youngsModulus);
  }

  /** Id of the element whose draft differs from its committed props, if any. */
  function dirtyDraftOwner(): number | null {
    for (const [id, draft] of drafts.value) {
      if (!draft) continue;
      const el = model.value.elements.find((e) => e.id === id);
      if (!el) continue;
      const a = parseAreaMm2(draft.areaText);
      const m = parseModulusGpa(draft.modulusText);
      if ((a.ok && a.value !== el.area) || (m.ok && m.value !== el.youngsModulus)) {
        return id;
      }
    }
    return null;
  }

  /**
   * Validate both fields, name the offending one(s), and keep the previous
   * values when invalid. On success the model is updated and the whole model
   * is re-solved synchronously so details and canvas share the same result.
   */
  function applyDraft(id: number): ApplyResult {
    const el = model.value.elements.find((e) => e.id === id);
    const draft = drafts.value.get(id);
    if (!el || !draft) return { ok: true, areaError: null, modulusError: null };

    const areaCheck = parseAreaMm2(draft.areaText);
    const modCheck = parseModulusGpa(draft.modulusText);

    if (!areaCheck.ok || !modCheck.ok) {
      // Keep the original values: revert each invalid input to its committed value.
      drafts.value.set(id, {
        areaText: areaCheck.ok ? draft.areaText : formatAreaMm2(el.area),
        modulusText: modCheck.ok ? draft.modulusText : formatModulusGpa(el.youngsModulus),
      });
      return { ok: false, areaError: areaCheck.error, modulusError: modCheck.error };
    }

    el.area = areaCheck.value;
    el.youngsModulus = modCheck.value;
    drafts.value.set(id, {
      areaText: formatAreaMm2(el.area),
      modulusText: formatModulusGpa(el.youngsModulus),
    });
    solve();
    return { ok: true, areaError: null, modulusError: null };
  }

  function discardDraft(id: number) {
    seedDraft(id);
  }

  function addLoad(nodeId: number, fx: number, fy: number) {
    model.value.loads.push({ nodeId, fx, fy });
  }

  function toggleFixed(nodeId: number) {
    const node = model.value.nodes.find((n) => n.id === nodeId);
    if (node) node.fixed = !node.fixed;
  }

  // ─── Result access (single source shared by detail panel and canvas) ──────
  /** Per-element results keyed by element id; built from the latest solve(). */
  const elementResults = computed(() => {
    const map = new Map<number, ElementResult>();
    const r = result.value;
    model.value.elements.forEach((el, i) => {
      map.set(el.id, {
        stress: r ? r.stresses[i] : 0,
        strain: r ? r.strains[i] : 0,
        force: r ? r.forces[i] : 0,
      });
    });
    return map;
  });

  /** Per-node displacements keyed by node id; built from the latest solve(). */
  const nodeDisplacements = computed(() => {
    const map = new Map<number, { x: number; y: number }>();
    const r = result.value;
    model.value.nodes.forEach((n, i) => {
      map.set(n.id, {
        x: r ? r.displacements[i * 2] : 0,
        y: r ? r.displacements[i * 2 + 1] : 0,
      });
    });
    return map;
  });

  // ─── Computed ─────────────────────────────────────────────────────────────
  const maxStress = computed(() => result.value?.maxStress ?? 0);
  const maxDisplacement = computed(() => result.value?.maxDisplacement ?? 0);

  const elementColors = computed(() => {
    const colors = new Map<number, string>();
    if (!result.value || model.value.elements.length === 0) {
      for (const el of model.value.elements) colors.set(el.id, '#6b7280');
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
        values = result.value.forces.map(Math.abs);
        break;
      default:
        values = result.value.stresses.map(Math.abs);
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    for (let i = 0; i < model.value.elements.length; i++) {
      colors.set(model.value.elements[i].id, jetColormap(values[i], min, max));
    }
    return colors;
  });

  return {
    // constants
    ALLOWABLE_STRESS,
    // state
    model,
    result,
    selectedPreset,
    showDeformed,
    deformationScale,
    selectedElement,
    heatmapMode,
    drafts,
    pendingSelection,
    // computed
    maxStress,
    maxDisplacement,
    elementResults,
    nodeDisplacements,
    elementColors,
    // actions
    loadPreset,
    solve,
    toggleDeformed,
    setHeatmapMode,
    requestSelect,
    cancelPendingSwitch,
    finishPendingSwitch,
    ensureDraft,
    setDraftField,
    isDraftDirty,
    applyDraft,
    discardDraft,
    addLoad,
    toggleFixed,
  };
});
