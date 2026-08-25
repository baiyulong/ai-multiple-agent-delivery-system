<script setup lang="ts">
/**
 * 阶段进度卡 — 与旧版 renderStageProgress (895-929 行) 完全对应。
 * 团队成员数据到达后补渲负责人。
 */
import { computed } from 'vue';
import type { StageRecord, TeamResponse, UserResponse } from '@/api/types';
import {
  stageDisplayName,
  roleName,
  stageAssignees,
  currentUserOwnsRole,
} from '@/utils/helpers';
import { STAGE_STATUS_MAP } from '@/utils/constants';
import { t } from '@/utils/i18n';

const props = defineProps<{
  stages: StageRecord[];
  currentStage: string | null;
  team: TeamResponse | null;
  user: UserResponse | null;
  taskAssignees?: Record<string, string> | null;
}>();

interface StepInfo {
  stepClass: string;
  icon: string;
  stageName: string;
  roleLabel: string;
  assigneesHtml: string;
  statusLabel: string;
}

const steps = computed<StepInfo[]>(() =>
  props.stages.map((s, idx) => {
    const isCurrent = s.stage === props.currentStage;
    let stepClass = '';
    if (s.status === 'completed') stepClass = 'completed';
    else if (isCurrent) stepClass = 'current';
    else if (s.status === 'blocked') stepClass = 'blocked';
    else if (s.status === 'in_progress') stepClass = 'in_progress';

    const statusLabel = STAGE_STATUS_MAP[s.status] || s.status;
    const icon = s.status === 'completed' ? '✓' : String(idx + 1);

    // 负责人渲染逻辑（本任务固化的唯一负责人；未固化显示"未指派"）
    const assignees = stageAssignees(s.role, props.team, props.taskAssignees);
    let assigneesHtml = '';
    if (assignees.length === 0) {
      if (
        currentUserOwnsRole(s.role, props.user) &&
        props.user &&
        props.user.configured &&
        props.user.user
      ) {
        const me = props.user.user;
        assigneesHtml = `stage-assignee-me|${t('stage.me')}|${me.name || me.email}`;
      } else {
        assigneesHtml = `empty|${t('stage.unassigned')}`;
      }
    } else {
      const currentUserEmail =
        props.user && props.user.configured && props.user.user
          ? props.user.user.email
          : null;
      assigneesHtml = assignees
        .map((m) => {
          const isMe =
            currentUserEmail &&
            m.email &&
            m.email.toLowerCase() === String(currentUserEmail).toLowerCase();
          return `${isMe ? 'stage-assignee-me' : ''}|${isMe ? `${t('stage.me')}|` : ''}${m.name || m.email}`;
        })
        .join(';');
    }

    return {
      stepClass,
      icon,
      stageName: stageDisplayName(s.stage),
      roleLabel: roleName(s.role),
      assigneesHtml,
      statusLabel,
    };
  }),
);

function parseAssignees(raw: string) {
  if (raw === `empty|${t('stage.unassigned')}`)
    return [{ isMe: false, badge: '', name: t('stage.unassigned'), empty: true }];
  return raw.split(';').map((item) => {
    const [classes, badge, name] = item.split('|');
    return {
      isMe: classes.includes('stage-assignee-me'),
      badge,
      name,
      empty: false,
    };
  });
}
</script>

<template>
  <div v-if="steps.length === 0" style="color: var(--color-text-muted)">
    {{ t('stage.noData') }}
  </div>
  <div v-else class="stage-progress">
    <div
      v-for="(step, idx) in steps"
      :key="idx"
      class="stage-step"
      :class="step.stepClass"
    >
      <div class="stage-dot" v-html="step.icon"></div>
      <div class="stage-info">
        <div class="stage-name">{{ step.stageName }}</div>
        <div class="stage-role">{{ step.roleLabel }}</div>
        <div class="stage-assignee-row">
          <template
            v-for="(a, ai) in parseAssignees(step.assigneesHtml)"
            :key="ai"
          >
            <span
              v-if="a.empty"
              class="stage-assignee stage-assignee-empty"
            >{{ a.name }}</span>
            <span
              v-else
              class="stage-assignee"
              :class="{ 'stage-assignee-me': a.isMe }"
            >
              <span v-if="a.isMe" class="stage-assignee-badge">{{ t('stage.me') }}</span>
              {{ a.name }}
            </span>
          </template>
        </div>
        <div class="stage-status-label">{{ step.statusLabel }}</div>
      </div>
    </div>
  </div>
</template>
