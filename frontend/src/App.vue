<script setup lang="ts">
import { computed, onMounted } from 'vue';
import FEACanvas from './components/FEACanvas.vue';
import ElementInfo from './components/ElementInfo.vue';
import MeshControls from './components/MeshControls.vue';
import { useFEAStore } from './store/fea';

const store = useFEAStore();

onMounted(() => {
  store.loadPreset('cantilever');
});

const pendingElId = computed(() => store.selectedElement);
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
    <!-- Header -->
    <header class="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
      <h1 class="text-lg font-bold text-purple-400">
        🔬 有限元应力热力图可视化
      </h1>
      <div class="text-xs text-slate-500">
        节点: {{ store.model.nodes.length }} |
        单元: {{ store.model.elements.length }}
      </div>
    </header>

    <!-- Main content -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Canvas area -->
      <div class="flex-1 p-3" style="width: 75%">
        <FEACanvas />
      </div>

      <!-- Right sidebar -->
      <div class="w-[25%] min-w-[260px] bg-slate-900 border-l border-slate-800 p-3 flex flex-col gap-3 overflow-y-auto">
        <MeshControls />
        <ElementInfo />
      </div>
    </div>

    <!-- Bottom status bar -->
    <footer class="bg-slate-900 border-t border-slate-800 px-6 py-2 flex items-center gap-6 text-xs text-slate-400">
      <span>
        最大应力:
        <span class="text-red-400 font-bold">
          {{ store.result ? (store.maxStress / 1e6).toFixed(2) + ' MPa' : '—' }}
        </span>
      </span>
      <span>
        最大位移:
        <span class="text-amber-400 font-bold">
          {{ store.result ? (store.maxDisplacement * 1000).toFixed(3) + ' mm' : '—' }}
        </span>
      </span>
      <span>
        节点数: <span class="text-slate-200">{{ store.model.nodes.length }}</span>
      </span>
      <span>
        单元数: <span class="text-slate-200">{{ store.model.elements.length }}</span>
      </span>
      <span class="ml-auto text-slate-600">
        热力图: {{ store.heatmapMode }}
      </span>
    </footer>

    <!-- Unconfirmed draft confirmation when switching elements -->
    <div
      v-if="store.pendingSelection !== null"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      @click.self="store.cancelPendingSelection()"
    >
      <div class="bg-slate-800 rounded-lg border border-slate-700 p-5 w-[340px] shadow-xl">
        <h3 class="text-sm font-bold text-slate-100 mb-2">属性改动尚未应用</h3>
        <p class="text-xs text-slate-400 mb-4">
          单元 #{{ pendingElId }} 有未确认的截面积 / 弹性模量 / 许用应力改动。
          切换到另一根单元前要如何处理？
        </p>
        <div class="flex flex-col gap-2">
          <button
            @click="store.confirmPendingSelection()"
            class="w-full py-2 rounded text-xs font-bold bg-green-700 text-white hover:bg-green-600 transition"
          >
            应用并重算，然后切换
          </button>
          <button
            @click="store.discardPendingSelection()"
            class="w-full py-2 rounded text-xs font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition"
          >
            放弃改动并切换
          </button>
          <button
            @click="store.cancelPendingSelection()"
            class="w-full py-2 rounded text-xs font-medium bg-slate-900 text-slate-400 hover:bg-slate-800 transition"
          >
            取消，继续编辑当前单元
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
