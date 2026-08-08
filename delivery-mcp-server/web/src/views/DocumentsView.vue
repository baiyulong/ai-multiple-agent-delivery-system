<script setup lang="ts">
/**
 * 公共文档页 — 完整复刻旧版 app.js 703-840 行的所有行为。
 * 三态（加载 / 错误+重试 / 空），按 artifact_type 分组，导出按钮。
 */
import { ref, computed, onMounted } from 'vue';
import { api, exportUrl } from '@/api/client';
import { PUBLIC_DOCUMENT_TYPES } from '@/utils/constants';
import { artifactTypeName } from '@/utils/helpers';
import type { PublicDocEntry } from '@/api/types';
import DocumentCard from '@/components/DocumentCard.vue';

const loading = ref(true);
const errorMsg = ref('');
const docs = ref<PublicDocEntry[]>([]);

/** 按 artifact_type 分组，公共文档类型优先，其余排后 */
interface DocGroup {
  type: string;
  typeName: string;
  items: PublicDocEntry[];
}

const groups = computed<DocGroup[]>(() => {
  const map: Record<string, PublicDocEntry[]> = {};
  docs.value.forEach((d) => {
    const type = d.artifact_type || 'other';
    if (!map[type]) map[type] = [];
    map[type].push(d);
  });

  const typeOrder = Object.keys(map).sort((a, b) => {
    const ia = PUBLIC_DOCUMENT_TYPES.indexOf(a);
    const ib = PUBLIC_DOCUMENT_TYPES.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  return typeOrder.map((type) => {
    const items = [...map[type]].sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
    return {
      type,
      typeName: artifactTypeName(type),
      items,
    };
  });
});

const docCount = computed(() => docs.value.length);

async function fetchDocs() {
  loading.value = true;
  errorMsg.value = '';
  docs.value = [];
  try {
    const data = await api.listDocuments();
    docs.value = data.documents || [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errorMsg.value = '加载公共文档失败：' + msg;
  } finally {
    loading.value = false;
  }
}

function retry() {
  void fetchDocs();
}

onMounted(() => {
  void fetchDocs();
});
</script>

<template>
  <section class="view active">
    <!-- 视图头部 -->
    <div class="view-header">
      <div class="view-header-left">
        <h2 class="view-title">公共文档</h2>
        <span v-if="!loading && !errorMsg" class="task-count">
          {{ docCount }} 篇文档
        </span>
      </div>
      <a
        :href="exportUrl.documents"
        class="btn btn-sm"
        type="button"
        title="导出全部公共文档为 Markdown"
        download
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          width="14"
          height="14"
        >
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        导出 Markdown
      </a>
    </div>

    <!-- 加载态 -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>加载公共文档...</span>
    </div>

    <!-- 错误态 -->
    <div v-else-if="errorMsg" class="error-state">
      <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <p>{{ errorMsg }}</p>
      <button class="btn btn-sm" @click="retry">重试</button>
    </div>

    <!-- 空态 -->
    <div v-else-if="docs.length === 0" class="empty-state">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <p>暂无公共文档</p>
    </div>

    <!-- 文档列表 -->
    <div v-else class="documents-list">
      <div v-for="group in groups" :key="group.type" class="doc-group">
        <div class="doc-group-header">
          <h3 class="doc-group-title">{{ group.typeName }}</h3>
          <span class="doc-group-count">{{ group.items.length }} 篇</span>
        </div>
        <DocumentCard
          v-for="(doc, idx) in group.items"
          :key="doc.artifact_id || doc.title || idx"
          :doc="doc"
        />
      </div>
    </div>
  </section>
</template>
