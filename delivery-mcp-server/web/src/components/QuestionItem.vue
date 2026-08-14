<script setup lang="ts">
/**
 * 单条待确认问题 — 与旧版 renderQuestions (1026-1059 行) 完全对应。
 */
import type { Question } from '@/api/types';
import { statusBadgeClass, stageDisplayName, roleName } from '@/utils/helpers';
import { formatTime } from '@/utils/helpers';
import { t } from '@/utils/i18n';

const props = defineProps<{ question: Question }>();
const q = props.question;

const badgeClass = statusBadgeClass(q.status);
const blocksText = q.blocks_stage
  ? t('question.blocksStage', { stage: stageDisplayName(q.blocks_stage) })
  : '';
</script>

<template>
  <div class="question-item">
    <div class="question-text">{{ q.question }}</div>
    <div class="question-meta">
      <span class="badge" :class="badgeClass">{{ q.status }}</span>
      <span>{{ t('question.raisedBy', { name: q.raised_by }) }}</span>
      <span>{{ t('question.assignedTo', { role: roleName(q.assigned_to_role) }) }}</span>
      <span v-if="blocksText">{{ blocksText }}</span>
      <span>{{ formatTime(q.created_at) }}</span>
    </div>
    <div v-if="q.answer" class="question-answer">
      <strong>{{ t('question.answer') }}</strong>{{ q.answer }}
      <span v-if="q.resolved_by" style="color: var(--color-text-muted)">
        — {{ q.resolved_by }}
      </span>
    </div>
  </div>
</template>
