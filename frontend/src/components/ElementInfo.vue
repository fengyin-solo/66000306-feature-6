<script setup lang="ts">
import { computed, watch } from 'vue';
import { useFEAStore } from '../store/fea';
import { validateDraft } from '../utils/element-validation';

const store = useFEAStore();

const selectedEl = computed(() => {
  if (store.selectedElement === null) return null;
  return store.model.elements.find((e) => e.id === store.selectedElement) || null;
});

// Seed a draft (committed values) whenever selection lands on an element.
// Existing drafts are kept, so deselecting and reselecting restores the draft.
watch(
  () => selectedEl.value?.id ?? null,
  (id) => {
    if (id !== null) store.draftFor(id);
  },
  { immediate: true }
);

// Draft lives in the store so it survives deselection.
const draft = computed(() =>
  store.selectedElement !== null
    ? store.drafts.get(store.selectedElement) ?? null
    : null
);

const dirty = computed(() =>
  selectedEl.value ? store.draftDirty(selectedEl.value.id) : false
);

const node1 = computed(() => {
  if (!selectedEl.value) return null;
  return store.model.nodes.find((n) => n.id === selectedEl.value!.nodeIds[0]) || null;
});

const node2 = computed(() => {
  if (!selectedEl.value) return null;
  return store.model.nodes.find((n) => n.id === selectedEl.value!.nodeIds[1]) || null;
});

const length = computed(() => {
  if (!node1.value || !node2.value) return 0;
  const dx = node2.value.x - node1.value.x;
  const dy = node2.value.y - node1.value.y;
  return Math.sqrt(dx * dx + dy * dy);
});

const angle = computed(() => {
  if (!node1.value || !node2.value) return 0;
  const dx = node2.value.x - node1.value.x;
  const dy = node2.value.y - node1.value.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
});

const color = computed(() => {
  if (store.selectedElement === null) return '#6b7280';
  return store.elementColors.get(store.selectedElement) || '#6b7280';
});

// ─── Utilization against allowable stress ──────────────────────────────────
const utilization = computed(() => {
  if (!selectedEl.value) return 0;
  const ratio = Math.abs(selectedEl.value.stress) / selectedEl.value.allowableStress;
  return Number.isFinite(ratio) ? ratio : 0;
});

const utilizationMeta = computed(() => {
  const r = utilization.value ?? 0;
  if (r >= 1) {
    return { bar: 'bg-red-500', text: 'text-red-400', label: '超限' };
  }
  if (r >= 0.7) {
    return { bar: 'bg-amber-500', text: 'text-amber-400', label: '接近许用' };
  }
  return { bar: 'bg-emerald-500', text: 'text-emerald-400', label: '安全' };
});

// ─── Draft editing ─────────────────────────────────────────────────────────
function onFieldInput(field: 'areaMm2' | 'youngsGpa' | 'allowableMpa', value: string) {
  const d = draft.value;
  if (!d) return;
  d[field] = value;
  // Clear the stale message for exactly the field being edited.
  d.errors[field === 'areaMm2' ? 'area' : field === 'youngsGpa' ? 'youngs' : 'allowable'] = undefined;
}

/** Blur validates to flag which field is illegal; the committed value is kept. */
function validate() {
  if (draft.value) validateDraft(draft.value);
}

function apply() {
  if (!selectedEl.value) return;
  store.applyDraft(selectedEl.value.id);
}

function revert() {
  if (!selectedEl.value) return;
  store.discardDraft(selectedEl.value.id);
}
</script>

<template>
  <div class="bg-slate-800 rounded-lg p-4">
    <h3 class="text-sm font-bold text-slate-200 border-b border-slate-700 pb-2 mb-3">
      单元属性
    </h3>

    <div v-if="!selectedEl" class="text-xs text-slate-500 text-center py-6">
      点击一个单元查看并调整属性
    </div>

    <div v-else-if="draft" class="space-y-2 text-xs">
      <!-- Color indicator -->
      <div class="flex items-center gap-2 mb-2">
        <div class="w-4 h-4 rounded" :style="{ backgroundColor: color }" />
        <span class="text-slate-300 font-medium">单元 #{{ selectedEl.id }}</span>
        <span
          v-if="dirty"
          class="ml-auto flex items-center gap-1 text-amber-400 text-[10px]"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400" />
          未应用
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">连接节点</div>
          <div class="text-sm font-mono text-slate-200">
            {{ selectedEl.nodeIds[0] }} → {{ selectedEl.nodeIds[1] }}
          </div>
        </div>
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">长度 / 角度</div>
          <div class="text-sm font-mono text-slate-200">
            {{ length.toFixed(3) }}m / {{ angle.toFixed(1) }}°
          </div>
        </div>
      </div>

      <!-- Editable properties -->
      <div class="space-y-2">
        <div>
          <label class="block text-slate-400 mb-1">截面积 (mm²)</label>
          <input
            type="number"
            step="any"
            class="w-full bg-slate-900 rounded px-2 py-1.5 text-sm font-mono border focus:outline-none transition"
            :class="draft.errors.area
              ? 'border-red-500 text-red-300'
              : 'border-slate-700 text-slate-200 focus:border-sky-500'"
            :value="draft.areaMm2"
            @input="onFieldInput('areaMm2', ($event.target as HTMLInputElement).value)"
            @blur="validate"
            @keyup.enter="apply"
          />
          <div v-if="draft.errors.area" class="text-[10px] text-red-400 mt-1">
            {{ draft.errors.area }}
          </div>
        </div>

        <div>
          <label class="block text-slate-400 mb-1">弹性模量 (GPa)</label>
          <input
            type="number"
            step="any"
            class="w-full bg-slate-900 rounded px-2 py-1.5 text-sm font-mono border focus:outline-none transition"
            :class="draft.errors.youngs
              ? 'border-red-500 text-red-300'
              : 'border-slate-700 text-slate-200 focus:border-sky-500'"
            :value="draft.youngsGpa"
            @input="onFieldInput('youngsGpa', ($event.target as HTMLInputElement).value)"
            @blur="validate"
            @keyup.enter="apply"
          />
          <div v-if="draft.errors.youngs" class="text-[10px] text-red-400 mt-1">
            {{ draft.errors.youngs }}
          </div>
        </div>

        <div>
          <label class="block text-slate-400 mb-1">许用应力 (MPa)</label>
          <input
            type="number"
            step="any"
            class="w-full bg-slate-900 rounded px-2 py-1.5 text-sm font-mono border focus:outline-none transition"
            :class="draft.errors.allowable
              ? 'border-red-500 text-red-300'
              : 'border-slate-700 text-slate-200 focus:border-sky-500'"
            :value="draft.allowableMpa"
            @input="onFieldInput('allowableMpa', ($event.target as HTMLInputElement).value)"
            @blur="validate"
            @keyup.enter="apply"
          />
          <div v-if="draft.errors.allowable" class="text-[10px] text-red-400 mt-1">
            {{ draft.errors.allowable }}
          </div>
        </div>
      </div>

      <div class="flex gap-2">
        <button
          @click="apply"
          :disabled="!dirty"
          class="flex-1 py-1.5 rounded text-[11px] font-bold transition"
          :class="dirty
            ? 'bg-green-700 text-white hover:bg-green-600'
            : 'bg-slate-700 text-slate-500 cursor-not-allowed'"
        >
          应用并重算
        </button>
        <button
          @click="revert"
          :disabled="!dirty"
          class="px-3 py-1.5 rounded text-[11px] font-medium transition"
          :class="dirty
            ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            : 'bg-slate-700 text-slate-600 cursor-not-allowed'"
        >
          撤销
        </button>
      </div>

      <!-- Utilization vs allowable stress -->
      <div class="bg-slate-900 rounded p-2">
        <div class="flex items-center justify-between mb-1">
          <span class="text-slate-400">应力利用率</span>
          <span class="font-mono font-bold" :class="utilizationMeta.text">
            {{ (utilization * 100).toFixed(1) }}%
            <span class="text-[10px] ml-1">{{ utilizationMeta.label }}</span>
          </span>
        </div>
        <div class="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            :class="utilizationMeta.bar"
            :style="{ width: Math.min(100, utilization * 100) + '%' }"
          />
        </div>
        <div class="flex justify-between text-[10px] text-slate-500 mt-1">
          <span>许用 {{ (selectedEl.allowableStress / 1e6).toFixed(0) }} MPa</span>
          <span
            :class="utilization >= 1 ? 'text-red-400' : 'text-slate-500'"
          >{{ utilization >= 1 ? `超出 ${((utilization - 1) * 100).toFixed(1)}%` : '70% 预警线' }}</span>
        </div>
      </div>

      <div class="border-t border-slate-700 pt-2">
        <div class="text-slate-400 mb-1">
          计算结果
          <span v-if="dirty" class="text-amber-400 text-[10px]">（应用前显示当前值）</span>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div class="bg-slate-900 rounded p-2">
            <div class="text-slate-500 text-[10px]">应力</div>
            <div class="text-sm font-bold" :style="{ color }">
              {{ (selectedEl.stress / 1e6).toFixed(2) }}
              <span class="text-[10px] text-slate-500">MPa</span>
            </div>
          </div>
          <div class="bg-slate-900 rounded p-2">
            <div class="text-slate-500 text-[10px]">应变</div>
            <div class="text-sm font-bold text-sky-400">
              {{ (selectedEl.strain * 100).toFixed(4) }}
              <span class="text-[10px] text-slate-500">%</span>
            </div>
          </div>
          <div class="bg-slate-900 rounded p-2">
            <div class="text-slate-500 text-[10px]">轴力</div>
            <div class="text-sm font-bold text-amber-400">
              {{ (selectedEl.force / 1000).toFixed(2) }}
              <span class="text-[10px] text-slate-500">kN</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
