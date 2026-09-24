<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useFEAStore } from '../store/fea';
import {
  ALLOWABLE_STRESS,
  checkField,
  type PropertyField,
} from '../utils/element-props';

const store = useFEAStore();

const selectedEl = computed(() => {
  if (store.selectedElement === null) return null;
  return store.model.elements.find((e) => e.id === store.selectedElement) || null;
});

// Make sure the selected element has a draft whenever it is (re)selected.
watch(
  () => store.selectedElement,
  (id) => {
    if (id !== null) store.ensureDraft(id);
  },
  { immediate: true }
);

const draft = computed(() =>
  store.selectedElement === null ? null : store.drafts.get(store.selectedElement) ?? null
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

// ── Results come from the same FEAResult the canvas colors are built from ──
const elResult = computed(() =>
  store.selectedElement === null
    ? null
    : store.elementResults.get(store.selectedElement) ?? null
);

const color = computed(() => {
  if (store.selectedElement === null) return '#6b7280';
  return store.elementColors.get(store.selectedElement) || '#6b7280';
});

// ── Draft / validation state ───────────────────────────────────────────────
const dirty = computed(() =>
  store.selectedElement === null ? false : store.isDraftDirty(store.selectedElement)
);

const liveAreaError = computed(() =>
  draft.value ? checkField('area', draft.value.areaText).error : null
);
const liveModulusError = computed(() =>
  draft.value ? checkField('youngsModulus', draft.value.modulusText).error : null
);

// Errors reported by the last failed apply; naming the offending field(s).
const submittedAreaError = ref<string | null>(null);
const submittedModulusError = ref<string | null>(null);

// Reset stale submitted errors whenever selection moves to another element.
watch(
  () => store.selectedElement,
  () => {
    submittedAreaError.value = null;
    submittedModulusError.value = null;
  }
);

function onInput(field: PropertyField, event: Event) {
  if (store.selectedElement === null) return;
  const text = (event.target as HTMLInputElement).value;
  if (field === 'area') submittedAreaError.value = null;
  else submittedModulusError.value = null;
  store.setDraftField(store.selectedElement, field, text);
}

function apply() {
  if (store.selectedElement === null) return;
  const res = store.applyDraft(store.selectedElement);
  submittedAreaError.value = res.areaError;
  submittedModulusError.value = res.modulusError;
  if (res.ok && store.pendingSelection !== null) {
    store.finishPendingSwitch();
  }
}

function discard() {
  if (store.selectedElement === null) return;
  store.discardDraft(store.selectedElement);
  submittedAreaError.value = null;
  submittedModulusError.value = null;
}

// ── Utilization against the allowable stress ───────────────────────────────
const utilization = computed(() => {
  if (!elResult.value) return null;
  return Math.abs(elResult.value.stress) / ALLOWABLE_STRESS;
});

const utilPctText = computed(() =>
  utilization.value === null ? '—' : (utilization.value * 100).toFixed(1) + '%'
);

const utilBarWidth = computed(() =>
  utilization.value === null ? '0%' : `${Math.min(utilization.value, 1) * 100}%`
);

const utilStatus = computed(() => {
  const u = utilization.value;
  if (u === null) return { text: '—', cls: 'text-slate-500', bar: 'bg-slate-600' };
  if (u > 1) return { text: '超限', cls: 'text-red-400', bar: 'bg-red-500' };
  if (u > 0.6) return { text: '偏高', cls: 'text-amber-400', bar: 'bg-amber-400' };
  return { text: '安全', cls: 'text-emerald-400', bar: 'bg-emerald-500' };
});

// ── Pending-switch confirmation ────────────────────────────────────────────
const pendingEl = computed(() =>
  store.pendingSelection === null
    ? null
    : store.model.elements.find((e) => e.id === store.pendingSelection) || null
);

function confirmSaveAndSwitch() {
  if (store.selectedElement === null) {
    store.finishPendingSwitch();
    return;
  }
  const res = store.applyDraft(store.selectedElement);
  submittedAreaError.value = res.areaError;
  submittedModulusError.value = res.modulusError;
  if (res.ok) store.finishPendingSwitch();
  // On failure the dialog stays open with the invalid fields named.
}

function confirmDiscardAndSwitch() {
  if (store.selectedElement !== null) store.discardDraft(store.selectedElement);
  store.finishPendingSwitch();
}
</script>

<template>
  <div class="bg-slate-800 rounded-lg p-4">
    <h3 class="text-sm font-bold text-slate-200 border-b border-slate-700 pb-2 mb-3 flex items-center gap-2">
      单元属性
      <span
        v-if="dirty"
        class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium"
      >
        未保存
      </span>
    </h3>

    <div v-if="!selectedEl" class="text-xs text-slate-500 text-center py-6">
      点击一个单元查看并编辑属性
    </div>

    <div v-else class="space-y-2 text-xs">
      <!-- Color indicator -->
      <div class="flex items-center gap-2 mb-3">
        <div class="w-4 h-4 rounded" :style="{ backgroundColor: color }" />
        <span class="text-slate-300 font-medium">单元 #{{ selectedEl.id }}</span>
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

      <!-- Editable cross-section area -->
      <div class="bg-slate-900 rounded p-2">
        <label class="text-slate-400 flex items-center justify-between">
          <span>截面积 (mm²)</span>
          <span v-if="dirty" class="w-1.5 h-1.5 rounded-full bg-amber-400" />
        </label>
        <input
          type="number"
          class="mt-1 w-full bg-slate-800 border rounded px-2 py-1 text-sm font-mono text-slate-100 focus:outline-none focus:ring-1"
          :class="
            submittedAreaError || liveAreaError
              ? 'border-red-500 focus:ring-red-500'
              : 'border-slate-700 focus:ring-sky-500'
          "
          :value="draft?.areaText ?? ''"
          @input="onInput('area', $event)"
          @keydown.enter="apply"
        />
        <div v-if="submittedAreaError || liveAreaError" class="text-[10px] text-red-400 mt-1">
          {{ submittedAreaError || liveAreaError }}
        </div>
      </div>

      <!-- Editable Young's modulus -->
      <div class="bg-slate-900 rounded p-2">
        <label class="text-slate-400 flex items-center justify-between">
          <span>弹性模量 (GPa)</span>
          <span v-if="dirty" class="w-1.5 h-1.5 rounded-full bg-amber-400" />
        </label>
        <input
          type="number"
          class="mt-1 w-full bg-slate-800 border rounded px-2 py-1 text-sm font-mono text-slate-100 focus:outline-none focus:ring-1"
          :class="
            submittedModulusError || liveModulusError
              ? 'border-red-500 focus:ring-red-500'
              : 'border-slate-700 focus:ring-sky-500'
          "
          :value="draft?.modulusText ?? ''"
          @input="onInput('youngsModulus', $event)"
          @keydown.enter="apply"
        />
        <div v-if="submittedModulusError || liveModulusError" class="text-[10px] text-red-400 mt-1">
          {{ submittedModulusError || liveModulusError }}
        </div>
      </div>

      <!-- Draft actions -->
      <div class="flex gap-2 pt-1">
        <button
          class="flex-1 py-1.5 rounded text-[11px] font-bold transition disabled:opacity-40 disabled:cursor-not-allowed"
          :class="dirty
            ? 'bg-sky-700 text-white hover:bg-sky-600'
            : 'bg-slate-700 text-slate-400'"
          :disabled="!dirty"
          @click="apply"
        >
          应用并重算
        </button>
        <button
          class="flex-1 py-1.5 rounded text-[11px] font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!dirty"
          @click="discard"
        >
          还原
        </button>
      </div>

      <!-- Computed results (same FEAResult as the canvas) -->
      <div class="border-t border-slate-700 pt-2 mt-1">
        <div class="text-slate-400 mb-1">计算结果</div>
        <div class="grid grid-cols-3 gap-2">
          <div class="bg-slate-900 rounded p-2">
            <div class="text-slate-500 text-[10px]">应力</div>
            <div class="text-sm font-bold" :style="{ color }">
              {{ ((elResult?.stress ?? 0) / 1e6).toFixed(2) }}
              <span class="text-[10px] text-slate-500">MPa</span>
            </div>
          </div>
          <div class="bg-slate-900 rounded p-2">
            <div class="text-slate-500 text-[10px]">应变</div>
            <div class="text-sm font-bold text-sky-400">
              {{ ((elResult?.strain ?? 0) * 100).toFixed(4) }}
              <span class="text-[10px] text-slate-500">%</span>
            </div>
          </div>
          <div class="bg-slate-900 rounded p-2">
            <div class="text-slate-500 text-[10px]">轴力</div>
            <div class="text-sm font-bold text-amber-400">
              {{ ((elResult?.force ?? 0) / 1000).toFixed(2) }}
              <span class="text-[10px] text-slate-500">kN</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Utilization vs allowable stress -->
      <div class="bg-slate-900 rounded p-2">
        <div class="flex items-center justify-between mb-1">
          <span class="text-slate-400">应力利用率</span>
          <span class="text-[10px] text-slate-500">
            许用 {{ (ALLOWABLE_STRESS / 1e6).toFixed(0) }} MPa
          </span>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="utilStatus.bar"
              :style="{ width: utilBarWidth }"
            />
          </div>
          <span class="font-mono font-bold w-14 text-right" :class="utilStatus.cls">
            {{ utilPctText }}
          </span>
        </div>
        <div class="text-[10px] mt-1" :class="utilStatus.cls">
          {{ utilStatus.text }}<template v-if="utilization !== null && utilization > 1">
            ：应力超过许用值 {{ ((utilization! - 1) * 100).toFixed(1) }}%
          </template>
        </div>
      </div>
    </div>

    <!-- Confirm switching away with unconfirmed edits -->
    <div
      v-if="pendingEl"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      @click.self="store.cancelPendingSwitch()"
    >
      <div class="bg-slate-800 border border-slate-600 rounded-lg p-4 w-72 shadow-xl">
        <div class="text-sm font-bold text-slate-100 mb-1">未确认的改动</div>
        <p class="text-xs text-slate-400 mb-3">
          单元 #{{ selectedEl?.id }} 的截面积/弹性模量已修改但尚未应用。
          切换到单元 #{{ pendingEl.id }} 前如何处理？
        </p>
        <div
          v-if="submittedAreaError || submittedModulusError"
          class="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3 space-y-0.5"
        >
          <div v-if="submittedAreaError">截面积：{{ submittedAreaError }}</div>
          <div v-if="submittedModulusError">弹性模量：{{ submittedModulusError }}</div>
        </div>
        <div class="flex flex-col gap-2">
          <button
            class="w-full py-1.5 rounded text-xs font-bold bg-sky-700 text-white hover:bg-sky-600 transition"
            @click="confirmSaveAndSwitch"
          >
            保存并重算后切换
          </button>
          <button
            class="w-full py-1.5 rounded text-xs font-medium bg-slate-700 text-slate-200 hover:bg-slate-600 transition"
            @click="confirmDiscardAndSwitch"
          >
            放弃改动并切换
          </button>
          <button
            class="w-full py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 transition"
            @click="store.cancelPendingSwitch()"
          >
            取消（留在 #{{ selectedEl?.id }}）
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
