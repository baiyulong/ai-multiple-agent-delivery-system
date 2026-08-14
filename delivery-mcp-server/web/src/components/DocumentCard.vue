<script setup lang="ts">
/**
 * 文档内容展示组件：显示加载状态、错误信息或 Markdown 正文。
 * 由 DocumentsView 在 Collapse.Panel 中使用。
 */
import MarkdownView from './MarkdownView.vue';
import { t } from '@/utils/i18n';

defineProps<{
  content: string;
  loading: boolean;
  error: string;
}>();
</script>

<template>
  <div class="doc-card-content">
    <div v-if="loading" class="doc-loading">
      <span class="spinner" style="width: 18px; height: 18px; border-width: 2px"></span>
      {{ t('loading') }}
    </div>
    <div v-else-if="error" class="doc-loading" style="color: var(--color-danger)">
      {{ error }}
    </div>
    <MarkdownView v-else-if="content" :source="content" />
    <div v-else class="doc-loading">{{ t('noContent') }}</div>
  </div>
</template>
