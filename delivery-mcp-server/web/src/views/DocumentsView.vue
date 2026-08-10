<script setup lang="ts">
/**
 * 公共文档页：使用 Ant Design Vue Card/Collapse 组件。
 * 按 artifact_type 分组，可展开查看内容，支持导出。
 */
import { ref, computed, onMounted } from 'vue';
import { Card, Collapse, Tag, Button, Space, message } from 'ant-design-vue';
import { api, exportUrl } from '@/api/api';
import { PUBLIC_DOCUMENT_TYPES } from '@/utils/constants';
import { artifactTypeName } from '@/utils/helpers';
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

async function fetchDocs() {
  loading.value = true;
  errorMsg.value = '';
  docs.value = [];
  try {
    const data = await api.listDocuments();
    docs.value = data.documents || [];
  } catch (err: unknown) {
    errorMsg.value = '加载公共文档失败：' + (err instanceof Error ? err.message : String(err));
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
  <Card title="公共文档" :bordered="false">
    <template #extra>
      <Space>
        <span style="color: rgba(0,0,0,0.45)">{{ docCount }} 篇文档</span>
        <a :href="exportUrl.documents" download>
          <Button>导出 Markdown</Button>
        </a>
      </Space>
    </template>

    <div v-if="loading" style="text-align: center; padding: 40px">加载公共文档...</div>

    <div v-else-if="errorMsg" style="color: #ff4d4f">{{ errorMsg }}</div>

    <div v-else-if="docs.length === 0" style="text-align: center; padding: 40px; color: rgba(0,0,0,0.45)">
      暂无公共文档
    </div>

    <div v-else>
      <Card v-for="group in groups" :key="group.type" style="margin-bottom: 16px" size="small">
        <template #title>
          <Space>
            <span>{{ group.typeName }}</span>
            <Tag color="blue">{{ group.items.length }} 篇</Tag>
          </Space>
        </template>
        <Collapse>
          <Collapse.Panel v-for="(doc, idx) in group.items" :key="doc.artifact_id || doc.title || idx">
            <template #header>
              <Space>
                <span>{{ doc.title || '无标题' }}</span>
                <Tag v-if="doc.status">{{ doc.status }}</Tag>
                <span v-if="doc.version" style="color: rgba(0,0,0,0.45)">v{{ doc.version }}</span>
              </Space>
            </template>
            <DocumentCard :doc="doc" />
          </Collapse.Panel>
        </Collapse>
      </Card>
    </div>
  </Card>
</template>
