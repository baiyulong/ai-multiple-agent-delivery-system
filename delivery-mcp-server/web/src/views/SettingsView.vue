<script setup lang="ts">
/**
 * 个人设置页：编辑基本信息（姓名/邮箱）与邮件通知配置（SMTP）。
 * 打开时回显当前值（loading 态），保存后提示成功。
 */
import { ref, reactive, computed, onMounted } from 'vue';
import { Card, Form, Input, InputNumber, Select, Switch, Button, Space, message } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';
import type { SelectValue } from 'ant-design-vue/es/select';
import { api } from '@/api/api';
import { t } from '@/utils/i18n';
import type { SmtpProvider, SmtpRequestBody } from '@/api/types';

const loading = ref(true);
const saving = ref(false);

// ── 基本信息 ──
const formState = reactive({
  name: '',
  email: '',
});

// ── SMTP ──
let originalSmtpConfigured = false;
const smtpProviders = ref<SmtpProvider[]>([]);
const smtpState = reactive({
  provider: undefined as string | undefined,
  host: '',
  port: undefined as number | undefined,
  secure: false,
  user: '',
  pass: '',
  from: '',
});

const smtpConfigured = ref(false);

const passPlaceholder = computed(() =>
  smtpConfigured.value ? t('settings.passPlaceholderConfigured') : t('settings.passPlaceholder'),
);

// ── 校验规则 ──
// smtp 字段的规则内联到 Form.Item（name 用数组路径，Form 级 rules 不支持嵌套结构）
const rules: Record<string, Rule[]> = {
  name: [{ required: true, message: t('settings.nameRequired'), trigger: 'blur' }],
  email: [
    { required: true, message: t('settings.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('settings.emailInvalid'), trigger: 'blur' },
  ],
};

/** smtp.user 必填校验（内联在 Form.Item） */
const smtpUserRules: Rule[] = [{ required: true, message: t('settings.accountRequired'), trigger: 'blur' }];

/** 动态 pass 校验：未配置时必填 */
function passRules(): Rule[] {
  if (smtpConfigured.value) return [];
  return [{ required: true, message: t('settings.passRequired'), trigger: 'blur' }];
}

// ── 服务商选择 → 自动回填 host/port/secure ──
function onProviderChange(value: SelectValue) {
  const key = value ? String(value) : undefined;
  if (!key) return;
  const p = smtpProviders.value.find((v) => v.key === key);
  if (p) {
    smtpState.host = p.host;
    smtpState.port = p.port;
    smtpState.secure = p.secure;
  }
}

// ── 加载数据 ──
async function fetchUser() {
  loading.value = true;
  try {
    const data = await api.getUser();
    if (data.user) {
      formState.name = data.user.name;
      formState.email = data.user.email;
    }
    // SMTP 回显
    smtpProviders.value = data.smtp_providers ?? [];
    smtpConfigured.value = data.smtp_configured;
    originalSmtpConfigured = data.smtp_configured;
    if (data.smtp) {
      smtpState.provider = data.smtp.provider ?? undefined;
      smtpState.host = data.smtp.host;
      smtpState.port = data.smtp.port ?? undefined;
      smtpState.secure = data.smtp.secure;
      smtpState.user = data.smtp.user;
      smtpState.from = data.smtp.from;
    }
    // pass 永不回显
    smtpState.pass = '';
  } catch (err: unknown) {
    message.error(t('settings.loadFailed') + (err instanceof Error ? err.message : String(err)));
  } finally {
    loading.value = false;
  }
}

// ── 构建 SMTP body ──
function buildSmtpBody(): SmtpRequestBody | null {
  const { provider, host, port, secure, user, pass, from } = smtpState;
  const hasContent =
    provider !== undefined ||
    (host && host.trim() !== '') ||
    port !== undefined ||
    secure ||
    (user && user.trim() !== '') ||
    (from && from.trim() !== '');

  // 无任何内容且原始无配置 → null（不触发后端校验）
  if (!hasContent && !originalSmtpConfigured) {
    return null;
  }

  // 已配置时 pass 留空 = 不修改（传空串，后端据此判断）
  return {
    provider: provider ?? null,
    host: host || undefined,
    port: port ?? null,
    secure: secure || undefined,
    user: user || '',
    pass: smtpConfigured.value ? (pass || '') : pass,
    from: from || undefined,
  };
}

// ── 保存 ──
async function handleSave() {
  saving.value = true;
  try {
    const smtp = buildSmtpBody();
    const res = await api.updateUser({ name: formState.name, email: formState.email, smtp });
    if (res.ok) {
      smtpConfigured.value = res.smtp !== null;
      originalSmtpConfigured = res.smtp !== null;
      smtpState.pass = '';
      message.success(t('settings.saved'));
    } else {
      message.error(res.error || t('settings.saveFailed'));
    }
  } catch (err: unknown) {
    message.error(t('settings.saveFailedDetail', { msg: err instanceof Error ? err.message : String(err) }));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void fetchUser();
});
</script>

<template>
  <div v-if="loading" style="text-align: center; padding: 40px">{{ t('settings.loading') }}</div>

  <template v-else>
    <Form
      :model="{ ...formState, smtp: smtpState }"
      :rules="rules"
      layout="vertical"
      style="max-width: 480px"
      @finish="handleSave"
    >
      <!-- 基本信息 -->
      <Card :title="t('settings.basic')" :bordered="false" style="margin-bottom: 16px">
        <Form.Item :label="t('settings.name')" name="name">
          <Input v-model:value="formState.name" :placeholder="t('settings.namePlaceholder')" />
        </Form.Item>

        <Form.Item :label="t('settings.email')" name="email">
          <Input v-model:value="formState.email" :placeholder="t('settings.emailPlaceholder')" />
        </Form.Item>
      </Card>

      <!-- 邮件通知配置 -->
      <Card :title="t('settings.smtp')" :bordered="false" style="margin-bottom: 16px">
        <Form.Item :label="t('settings.provider')" :name="['smtp', 'provider']">
          <Select
            v-model:value="smtpState.provider"
            :placeholder="t('settings.providerPlaceholder')"
            allow-clear
            :options="smtpProviders.map((p) => ({ value: p.key, label: p.name }))"
            @change="onProviderChange"
          />
        </Form.Item>

        <Form.Item :label="t('settings.host')" :name="['smtp', 'host']">
          <Input v-model:value="smtpState.host" placeholder="smtp.example.com" />
        </Form.Item>

        <Form.Item :label="t('settings.port')" :name="['smtp', 'port']">
          <InputNumber
            v-model:value="smtpState.port"
            :min="1"
            :max="65535"
            placeholder="465"
            style="width: 100%"
          />
        </Form.Item>

        <Form.Item :label="t('settings.secure')" :name="['smtp', 'secure']">
          <Space>
            <Switch v-model:checked="smtpState.secure" />
            <span style="color: #999; font-size: 12px">
              {{ smtpState.secure ? t('settings.secureTls') : t('settings.secureStarttls') }}
            </span>
          </Space>
        </Form.Item>

        <Form.Item :label="t('settings.account')" :name="['smtp', 'user']" :rules="smtpUserRules">
          <Input v-model:value="smtpState.user" :placeholder="t('settings.accountPlaceholder')" />
        </Form.Item>

        <Form.Item :label="t('settings.pass')" :name="['smtp', 'pass']" :rules="passRules()">
          <Input.Password v-model:value="smtpState.pass" :placeholder="passPlaceholder" />
        </Form.Item>

        <Form.Item :label="t('settings.from')" :name="['smtp', 'from']">
          <Input v-model:value="smtpState.from" :placeholder="t('settings.fromPlaceholder')" />
        </Form.Item>

        <div style="color: #999; font-size: 12px; margin-top: -8px">
          {{ t('settings.passHint') }}
        </div>
      </Card>

      <Form.Item>
        <Button type="primary" html-type="submit" :loading="saving">{{ t('settings.save') }}</Button>
      </Form.Item>
    </Form>
  </template>
</template>
