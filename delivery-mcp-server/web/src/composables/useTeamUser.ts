/**
 * 团队名册 + 当前用户配置的共享状态。
 * 壳（header/警告 banner）与详情页（阶段负责人重绘）共用：
 * 详情页 watch `loaded` 后根据团队成员补渲阶段负责人。
 */
import { ref } from 'vue';
import { api } from '@/api/api';
import type { TeamResponse, UserResponse } from '@/api/types';

const team = ref<TeamResponse | null>(null);
const user = ref<UserResponse | null>(null);
const loaded = ref(false);

let started = false;

export function useTeamUser() {
  if (!started) {
    started = true;
    // 任一失败不影响另一个（与旧版 loadTeamAndUser 的 allSettled 语义一致）
    void Promise.allSettled([api.getTeam(), api.getUser()]).then(([t, u]) => {
      if (t.status === 'fulfilled') team.value = t.value;
      if (u.status === 'fulfilled') user.value = u.value;
      loaded.value = true;
    });
  }
  return { team, user, loaded };
}
