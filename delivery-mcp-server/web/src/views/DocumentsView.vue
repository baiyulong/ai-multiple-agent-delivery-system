<script setup lang="ts">
/**
 * 公共文档页：按 artifact_type 分组，可展开查看 Markdown 内容，支持导出。
 * 展开 Collapse.Panel 时按需加载内容，一次性显示 Markdown。
 */
import { ref, computed, onMounted, reactive } from 'vue';
import { Card, Collapse, Tag, Button, Space, message } from 'ant-design-vue';
import { DownloadOutlined } from '@ant-design/icons-vue';
import { api } from '@/api/api';
import { PUBLIC_DOCUMENT_TYPES } from '@/utils/constants';
import { artifactTypeName, formatTime } from '@/utils/helpers';
import { t } from '@/utils/i18n';
import type { PublicDocEntry } from '@/api/types';
import DocumentCard from '@/components/DocumentCard.vue';

const loading = ref(true);
const errorMsg = ref('');
const docs = ref<PublicDocEntry[]>([]);

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
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
    return {
      type,
      typeName: artifactTypeName(type),
      items,
    };
  });
});

const docCount = computed(() => docs.value.length);

// ── Content lazy-loading ──
interface DocContentState {
  content: string;
  loading: boolean;
  error: string;
  loaded: boolean;
}

const contentStore = reactive<Record<string, DocContentState>>({});

function getContent(groupType: string, idx: number): DocContentState {
  const key = `${groupType}::${idx}`;
  if (!contentStore[key]) {
    contentStore[key] = { content: '', loading: false, error: '', loaded: false };
  }
  return contentStore[key];
}

async function loadDocContent(groupType: string, idx: number) {
  const key = `${groupType}::${idx}`;
  const state = contentStore[key];
  if (!state || state.loaded || state.loading) return;

  const group = groups.value.find((g) => g.type === groupType);
  if (!group || !group.items[idx]) return;
  const doc = group.items[idx];

  // Preset docs carry content inline
  if (doc.source === 'preset' && doc.content) {
    state.content = doc.content;
    state.loaded = true;
    return;
  }

  // Non-preset docs without task/artifact ids have no content
  if (!doc.task_id || !doc.artifact_id) {
    state.error = t('noContent');
    state.loaded = true;
    return;
  }

  state.loading = true;
  try {
    const data = await api.getArtifact(doc.task_id, doc.artifact_id);
    state.content = data.content || '';
    state.loaded = true;
  } catch (err: unknown) {
    state.error = t('loadFailed') + (err instanceof Error ? err.message : String(err));
    state.loaded = true;
  } finally {
    state.loading = false;
  }
}

/** Collapse @change callback — triggers content load for newly expanded panels */
function onGroupExpand(groupType: string, activeKeys: unknown) {
  const keys = Array.isArray(activeKeys) ? activeKeys : [activeKeys];
  keys.forEach((key) => {
    const idx = parseInt(String(key), 10);
    if (!isNaN(idx)) {
      // Ensure contentStore entry exists before loading
      void getContent(groupType, idx);
      void loadDocContent(groupType, idx);
    }
  });
}

// ── Per-doc export ──

/** Sanitize a string for use as a filename (replace filesystem-unsafe chars). */
function sanitizeFilename(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || 'document';
}

/** Trigger a browser download of a markdown string as a .md file. */
function downloadMarkdown(content: string, groupType: string, idx: number) {
  const group = groups.value.find((g) => g.type === groupType);
  const doc = group?.items[idx];
  const name = doc?.title || doc?.task_id || 'document';
  const filename = sanitizeFilename(name) + '.md';

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Export a single document: load content on demand if needed, then download. */
async function exportDoc(groupType: string, idx: number) {
  const state = getContent(groupType, idx);

  // Already loaded — export immediately
  if (state.loaded && state.content) {
    downloadMarkdown(state.content, groupType, idx);
    return;
  }

  // Loading in progress — ask user to wait
  if (state.loading) {
    message.info(t('doc.loadingHint'));
    return;
  }

  // Previous load errored — ask user to expand first
  if (state.error) {
    message.warning(t('doc.expandFirst'));
    return;
  }

  // Not loaded yet — fetch content first
  await loadDocContent(groupType, idx);
  const after = getContent(groupType, idx);

  if (after.error || !after.content) {
    message.warning(t('doc.noExport'));
    return;
  }

  downloadMarkdown(after.content, groupType, idx);
}

// ── Fetch docs list ──
async function fetchDocs() {
  loading.value = true;
  errorMsg.value = '';
  docs.value = [];
  try {
    const data = await api.listDocuments();
    docs.value = data.documents || [];
  } catch (err: unknown) {
    errorMsg.value = t('doc.loadFailed') + (err instanceof Error ? err.message : String(err));
    message.error(errorMsg.value);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void fetchDocs();
});
</script>

<template>
  <Card :title="t('doc.title')" :bordered="false">
    <template #extra>
      <span style="color: var(--color-text-muted)">{{ t('doc.count', { count: docCount }) }}</span>
    </template>

    <div v-if="loading" style="text-align: center; padding: 40px">{{ t('doc.loading') }}</div>

    <div v-else-if="errorMsg" style="color: #ff4d4f">{{ errorMsg }}</div>

    <div
      v-else-if="docs.length === 0"
      style="text-align: center; padding: 40px; color: var(--color-text-muted)"
    >
      {{ t('doc.empty') }}
    </div>

    <div v-else>
      <Card
        v-for="group in groups"
        :key="group.type"
        style="margin-bottom: 16px"
        size="small"
      >
        <template #title>
          <Space>
            <span>{{ group.typeName }}</span>
            <Tag color="blue">{{ t('doc.pieces', { count: group.items.length }) }}</Tag>
          </Space>
        </template>
        <Collapse @change="(keys) => onGroupExpand(group.type, keys)">
          <Collapse.Panel
            v-for="(doc, idx) in group.items"
            :key="String(idx)"
          >
            <template #header>
              <div class="doc-header-row">
                <Space class="doc-header-info">
                  <span>{{ doc.title || t('doc.noTitle') }}</span>
                  <Tag v-if="doc.status">{{ doc.status }}</Tag>
                  <span v-if="doc.version" style="color: var(--color-text-muted)">
                    v{{ doc.version }}
                  </span>
                  <span style="color: var(--color-text-muted); font-size: 0.85em">
                    {{ formatTime(doc.updated_at) }}
                  </span>
                </Space>
                <Button
                  type="text"
                  size="small"
                  class="doc-export-btn"
                  :disabled="getContent(group.type, idx).loading"
                  @click.stop="exportDoc(group.type, idx)"
                >
                  <DownloadOutlined />
                </Button>
              </div>
            </template>
            <DocumentCard
              :content="getContent(group.type, idx).content"
              :loading="getContent(group.type, idx).loading"
              :error="getContent(group.type, idx).error"
            />
          </Collapse.Panel>
        </Collapse>
      </Card>
    </div>
  </Card>
</template>

<style scoped>
.doc-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
  gap: 8px;
}

.doc-header-info {
  min-width: 0;
  flex: 1;
}

.doc-export-btn {
  flex-shrink: 0;
  color: var(--color-text-muted);
  padding: 0 6px;
  height: 24px;
}

.doc-export-btn:hover {
  color: #93c5fd;
}
</style>
