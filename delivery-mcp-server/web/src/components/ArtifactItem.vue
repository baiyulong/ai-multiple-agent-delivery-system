<script setup lang="ts">
/**
 * 单条交付物 — 与旧版 renderArtifacts (963-1000) + loadArtifactContent (1002-1023) 对应。
 * 可展开/收起，展开时懒加载拉 api.getArtifact。
 */
import { ref } from 'vue';
import { api } from '@/api/api';
import { statusBadgeClass, artifactTypeName } from '@/utils/helpers';
import MarkdownView from './MarkdownView.vue';
import type { ArtifactMeta } from '@/api/types';

const props = defineProps<{
  artifact: ArtifactMeta;
  taskId: string;
}>();

const expanded = ref(false);
const loading = ref(false);
const error = ref('');
const content = ref('');
const loaded = ref(false);

async function toggle() {
  expanded.value = !expanded.value;
  if (expanded.value && !loaded.value && !loading.value) {
    loading.value = true;
    error.value = '';
    try {
      const data = await api.getArtifact(props.taskId, props.artifact.artifact_id);
      content.value = data.content || '';
      loaded.value = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      error.value = '加载失败：' + msg;
    } finally {
      loading.value = false;
    }
  }
}

const typeName = artifactTypeName(props.artifact.artifact_type);
const badgeClass = statusBadgeClass(props.artifact.status);
</script>

<template>
  <div class="artifact-item" :class="{ expanded }">
    <div class="artifact-header" @click="toggle" role="button" tabindex="0"
      @keydown.enter.prevent="toggle" @keydown.space.prevent="toggle">
      <svg
        class="artifact-expand-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
      <span class="artifact-type">{{ typeName }}</span>
      <div class="artifact-meta-right">
        <span class="badge" :class="badgeClass">{{ props.artifact.status }}</span>
        <span class="artifact-version">v{{ props.artifact.version }}</span>
        <span>{{ (props.artifact as unknown as Record<string, unknown>).submitted_by || props.artifact.role || '' }}</span>
      </div>
    </div>
    <div v-if="expanded" class="artifact-body">
      <div v-if="loading" class="artifact-loading">
        <div class="spinner" style="width: 20px; height: 20px; border-width: 2px"></div>
        加载中...
      </div>
      <div v-else-if="error" class="artifact-loading" style="color: var(--color-danger)">
        {{ error }}
      </div>
      <MarkdownView v-else :source="content" />
    </div>
  </div>
</template>
