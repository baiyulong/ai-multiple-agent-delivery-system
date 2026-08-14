import { join } from 'node:path';
import { ensureDir, readJson, readText, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { generateArtifactId } from '../ids.js';
import { artifactFile, artifactHistoryFile, assertInside, taskDir } from '../paths.js';
import { nowIso } from '../time.js';
import { t } from '../i18n.js';
import type { ArtifactMeta, ArtifactStatus } from '../types.js';

/**
 * 交付物存储（PRD 8.5 / 14.4）：
 * - 文件：tasks/{taskId}/artifacts/{stage}/{type}.md
 * - 元数据：tasks/{taskId}/artifacts/index.json
 * - 更新保留历史版本：artifacts/{stage}/history/{type}.v{n}.md
 */

export interface SubmitArtifactInput {
  taskId: string;
  stage: string;
  role: string;
  artifactType: string;
  content: string;
  title?: string;
  summary?: string;
}

function indexFile(root: string, taskId: string): string {
  return assertInside(root, join(taskDir(root, taskId), 'artifacts', 'index.json'));
}

async function readIndex(root: string, taskId: string): Promise<ArtifactMeta[]> {
  return (await readJson<ArtifactMeta[]>(indexFile(root, taskId))) ?? [];
}

async function writeIndex(root: string, taskId: string, index: ArtifactMeta[]): Promise<void> {
  await writeJsonAtomic(indexFile(root, taskId), index);
}

/** 按 ID 找交付物 metadata */
export async function findArtifact(root: string, taskId: string, artifactId: string): Promise<ArtifactMeta | null> {
  const index = await readIndex(root, taskId);
  return index.find((a) => a.artifact_id === artifactId) ?? null;
}

/** 按阶段+类型找最新交付物 */
export async function findArtifactByType(
  root: string,
  taskId: string,
  stage: string,
  artifactType: string,
): Promise<ArtifactMeta | null> {
  const index = await readIndex(root, taskId);
  const matches = index.filter((a) => a.stage === stage && a.artifact_type === artifactType);
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (a.version >= b.version ? a : b));
}

/** 提交交付物：写 md + 追加 metadata（PRD 7.5 / 9.7） */
export async function submitArtifact(root: string, input: SubmitArtifactInput): Promise<ArtifactMeta> {
  const dir = join(taskDir(root, input.taskId), 'artifacts');
  await ensureDir(dir);

  const now = nowIso();
  const path = `artifacts/${input.stage}/${input.artifactType}.md`;
  const meta: ArtifactMeta = {
    artifact_id: await generateArtifactId(root),
    task_id: input.taskId,
    stage: input.stage,
    role: input.role,
    artifact_type: input.artifactType,
    title: input.title,
    summary: input.summary,
    status: 'submitted',
    version: 1,
    path,
    created_at: now,
    updated_at: now,
  };

  await writeTextAtomic(artifactFile(root, input.taskId, input.stage, input.artifactType), input.content);

  const index = await readIndex(root, input.taskId);
  index.push(meta);
  await writeIndex(root, input.taskId, index);
  return meta;
}

/** 读取交付物内容 */
export async function getArtifact(
  root: string,
  taskId: string,
  artifactId: string,
): Promise<{ metadata: ArtifactMeta; content: string } | null> {
  const meta = await findArtifact(root, taskId, artifactId);
  if (!meta) return null;
  const content = await readText(assertInside(root, join(taskDir(root, taskId), meta.path)));
  if (content === null) return null;
  return { metadata: meta, content };
}

/** 列出任务交付物，可选按阶段过滤 */
export async function listArtifacts(root: string, taskId: string, stage?: string): Promise<ArtifactMeta[]> {
  const index = await readIndex(root, taskId);
  return stage ? index.filter((a) => a.stage === stage) : index;
}

/** 更新交付物：旧版存档 + 版本递增 + 状态回到 submitted（PRD 12.3 返工） */
export async function updateArtifact(
  root: string,
  taskId: string,
  artifactId: string,
  newContent: string,
  opts?: { summary?: string; status?: ArtifactStatus },
): Promise<ArtifactMeta> {
  const meta = await findArtifact(root, taskId, artifactId);
  if (!meta) throw new Error(`${t('tool.artifact.get.not_found', { id: artifactId })}`);
  if (meta.status === 'deprecated') throw new Error(`${t('artifact.deprecated_not_update', { id: artifactId })}`);

  // 旧版存档：先读当前文件内容写入历史，再覆盖新内容
  await ensureDir(join(taskDir(root, taskId), 'artifacts', meta.stage, 'history'));
  const oldContent = await readText(artifactFile(root, taskId, meta.stage, meta.artifact_type));
  if (oldContent !== null) {
    await writeTextAtomic(
      artifactHistoryFile(root, taskId, meta.stage, meta.artifact_type, meta.version),
      oldContent,
    );
  }

  const now = nowIso();
  const updated: ArtifactMeta = {
    ...meta,
    summary: opts?.summary ?? meta.summary,
    status: opts?.status ?? 'submitted',
    version: meta.version + 1,
    updated_at: now,
  };

  await writeTextAtomic(artifactFile(root, taskId, meta.stage, meta.artifact_type), newContent);

  const index = await readIndex(root, taskId);
  const i = index.findIndex((a) => a.artifact_id === artifactId);
  if (i >= 0) index[i] = updated;
  await writeIndex(root, taskId, index);
  return updated;
}

/** 标记状态（供 gate/其他联动） */
export async function setArtifactStatus(
  root: string,
  taskId: string,
  artifactId: string,
  status: ArtifactStatus,
): Promise<ArtifactMeta | null> {
  const meta = await findArtifact(root, taskId, artifactId);
  if (!meta) return null;
  const updated: ArtifactMeta = { ...meta, status, updated_at: nowIso() };
  const index = await readIndex(root, taskId);
  const i = index.findIndex((a) => a.artifact_id === artifactId);
  if (i >= 0) index[i] = updated;
  await writeIndex(root, taskId, index);
  return updated;
}
