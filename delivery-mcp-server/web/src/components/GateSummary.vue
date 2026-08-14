<script setup lang="ts">
/**
 * 门禁摘要卡 — 与旧版 renderGateSummary (932-960 行) 完全对应。
 * gate_summary 每阶段最近检查 result/score/checked_at。
 */
import { computed } from 'vue';
import type { GateSummaryEntry } from '@/api/types';
import { stageDisplayName, statusBadgeClass } from '@/utils/helpers';
import { GATE_RESULT_MAP } from '@/utils/constants';
import { t } from '@/utils/i18n';

const props = defineProps<{
  gateSummary: Record<string, GateSummaryEntry> | null;
}>();

interface GateItem {
  stageName: string;
  badgeClass: string;
  label: string;
  scoreText: string;
}

const visible = computed(
  () =>
    props.gateSummary !== null &&
    Object.keys(props.gateSummary).length > 0,
);

const items = computed<GateItem[]>(() => {
  if (!props.gateSummary) return [];
  return Object.entries(props.gateSummary).map(([stageName, gate]) => {
    const result = gate.result || 'unknown';
    const badgeClass = statusBadgeClass(result);
    const label = GATE_RESULT_MAP[result] || result;
    const scoreText =
      gate.score != null ? t('gate.score', { score: gate.score }) : '-';
    return { stageName: stageDisplayName(stageName), badgeClass, label, scoreText };
  });
});
</script>

<template>
  <div v-if="visible" class="card">
    <div class="card-header">
      <h2 class="card-title">{{ t('gate.title') }}</h2>
    </div>
    <div class="card-body">
      <div class="gate-grid">
        <div v-for="(item, idx) in items" :key="idx" class="gate-item">
          <span class="gate-stage-name">{{ item.stageName }}</span>
          <span class="badge" :class="item.badgeClass">{{ item.label }}</span>
          <span class="gate-score">{{ item.scoreText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
