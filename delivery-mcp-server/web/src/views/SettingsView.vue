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
  smtpConfigured.value ? '已配置，留空则保持不变' : '请输入 SMTP 授权码',
);

// ── 校验规则 ──
// smtp 字段的规则内联到 Form.Item（name 用数组路径，Form 级 rules 不支持嵌套结构）
const rules: Record<string, Rule[]> = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' },
  ],
};

/** smtp.user 必填校验（内联在 Form.Item） */
const smtpUserRules: Rule[] = [{ required: true, message: '请输入 SMTP 账号', trigger: 'blur' }];

/** 动态 pass 校验：未配置时必填 */
function passRules(): Rule[] {
  if (smtpConfigured.value) return [];
  return [{ required: true, message: '请输入 SMTP 授权码', trigger: 'blur' }];
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
    message.error('加载用户信息失败：' + (err instanceof Error ? err.message : String(err)));
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
      message.success('保存成功');
    } else {
      message.error(res.error || '保存失败');
    }
  } catch (err: unknown) {
    message.error('保存失败：' + (err instanceof Error ? err.message : String(err)));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void fetchUser();
});
</script>

<template>
  <div v-if="loading" style="text-align: center; padding: 40px">加载用户信息...</div>

  <template v-else>
    <Form
      :model="{ ...formState, smtp: smtpState }"
      :rules="rules"
      layout="vertical"
      style="max-width: 480px"
      @finish="handleSave"
    >
      <!-- 基本信息 -->
      <Card title="基本信息" :bordered="false" style="margin-bottom: 16px">
        <Form.Item label="姓名" name="name">
          <Input v-model:value="formState.name" placeholder="请输入姓名" />
        </Form.Item>

        <Form.Item label="邮箱" name="email">
          <Input v-model:value="formState.email" placeholder="请输入邮箱" />
        </Form.Item>
      </Card>

      <!-- 邮件通知配置 -->
      <Card title="邮件通知配置（SMTP）" :bordered="false" style="margin-bottom: 16px">
        <Form.Item label="服务商" :name="['smtp', 'provider']">
          <Select
            v-model:value="smtpState.provider"
            placeholder="选择服务商（可留空手动填写）"
            allow-clear
            :options="smtpProviders.map((p) => ({ value: p.key, label: p.name }))"
            @change="onProviderChange"
          />
        </Form.Item>

        <Form.Item label="SMTP 服务器" :name="['smtp', 'host']">
          <Input v-model:value="smtpState.host" placeholder="smtp.example.com" />
        </Form.Item>

        <Form.Item label="端口" :name="['smtp', 'port']">
          <InputNumber
            v-model:value="smtpState.port"
            :min="1"
            :max="65535"
            placeholder="465"
            style="width: 100%"
          />
        </Form.Item>

        <Form.Item label="加密连接" :name="['smtp', 'secure']">
          <Space>
            <Switch v-model:checked="smtpState.secure" />
            <span style="color: #999; font-size: 12px">
              {{ smtpState.secure ? 'SSL/TLS（如 465 端口）' : 'STARTTLS（如 587 端口）' }}
            </span>
          </Space>
        </Form.Item>

        <Form.Item label="SMTP 账号" :name="['smtp', 'user']" :rules="smtpUserRules">
          <Input v-model:value="smtpState.user" placeholder="发件邮箱地址" />
        </Form.Item>

        <Form.Item label="授权码" :name="['smtp', 'pass']" :rules="passRules()">
          <Input.Password v-model:value="smtpState.pass" :placeholder="passPlaceholder" />
        </Form.Item>

        <Form.Item label="发件人名称" :name="['smtp', 'from']">
          <Input v-model:value="smtpState.from" placeholder="留空则默认使用 SMTP 账号" />
        </Form.Item>

        <div style="color: #999; font-size: 12px; margin-top: -8px">
          授权码是邮箱服务商提供的 SMTP 授权码（非登录密码）；出于安全不回显，留空表示不修改。
        </div>
      </Card>

      <Form.Item>
        <Button type="primary" html-type="submit" :loading="saving">保存</Button>
      </Form.Item>
    </Form>
  </template>
</template>
