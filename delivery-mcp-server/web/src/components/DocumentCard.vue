<script setup lang="ts">
/**
 * 文档条目 — 公共文档页中每条文档的可展开卡片。
 * 与旧版 app.js 758-805 行 + loadPublicDocumentContent 813-839 行对应。
 */
import { ref } from 'vue';
import { api } from '@/api/api';
import { statusBadgeClass, formatTime } from '@/utils/helpers';
import MarkdownView from './MarkdownView.vue';
import type { PublicDocEntry } from '@/api/types';

const props = defineProps<{ doc: PublicDocEntry }>();

const expanded = ref(false);
const loading = ref(false);
const error = ref('');
const content = ref('');
const loaded = ref(false);

const isPreset = props.doc.source === 'preset';

// 预设条目自带 content：直接缓存
if (isPreset && props.doc.content) {
  content.value = props.doc.content;
  loaded.value = true;
}

const badgeClass = isPreset
  ? 'badge-preset'
  : statusBadgeClass(props.doc.status || '');

async function toggle() {
  expanded.value = !expanded.value;
  if (expanded.value && !loaded.value && !loading.value) {
    await loadContent();
  }
}

async function loadContent() {
  // 预设条目无 task_id，不请求接口
  if (!props.doc.task_id) {
    if (!content.value) {
      error.value = '暂无内容';
    }
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const data = await api.getArtifact(
      props.doc.task_id,
      props.doc.artifact_id!,
    );
    content.value = data.content || '';
    loaded.value = true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error.value = '加载失败：' + msg;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="doc-card" :class="{ expanded }">
    <div
      class="doc-card-header"
      role="button"
      tabindex="0"
      @click="toggle"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    >
      <svg
        class="doc-expand-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
      <div class="doc-card-main">
        <div class="doc-card-title-row">
          <span class="doc-card-title">{{
            props.doc.title || '无标题'
          }}</span>
          <span class="badge" :class="badgeClass">
            {{ isPreset ? '预设' : props.doc.status || '' }}
          </span>
        </div>
        <div class="doc-card-meta">
          <span v-if="isPreset" class="doc-card-task">
            任务类型：{{ props.doc.task_type || '-' }}
          </span>
          <span
            v-else
            class="doc-card-task"
            :title="props.doc.task_id || ''"
          >
            所属任务：{{ props.doc.task_title || props.doc.task_id }}
          </span>
          <span v-if="!isPreset && props.doc.version">
            版本：<span class="mono">v{{ props.doc.version }}</span>
          </span>
          <span>更新：{{ formatTime(props.doc.updated_at) }}</span>
        </div>
      </div>
    </div>
    <!-- body 始终在 DOM 中，由 CSS .expanded 控制显隐 -->
    <div class="doc-body">
      <template v-if="expanded">
        <div v-if="loading" class="doc-loading">
          <div
            class="spinner"
            style="width: 20px; height: 20px; border-width: 2px"
          ></div>
          加载中...
        </div>
        <div
          v-else-if="error"
          class="doc-loading"
          style="color: var(--color-danger)"
        >
          {{ error }}
        </div>
        <template v-else-if="content">
          <MarkdownView :source="content" />
        </template>
        <div
          v-else
          class="doc-loading"
          style="color: var(--color-text-muted)"
        >
          暂无内容
        </div>
      </template>
      <template v-else>
        <div class="doc-loading">点击展开查看正文</div>
      </template>
    </div>
  </div>
</template>
