import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 交付根目录初始化（PRD 10.1 / 14.1，用户目录安装模型）：
 * - 只创建数据目录（tasks/ 与 config/ 子目录），不再把内置模板拷贝进 .delivery/config。
 * - 读取链：项目 <root>/config/*（用户放即覆盖）> 用户安装默认（packageRoot()/config）> 包内置兜底。
 * - 这样全局安装只需一份，各项目仅保留自己的数据与覆盖文件，更新只动全局安装。
 */

export async function initDeliveryRoot(root: string): Promise<void> {
  await mkdir(join(root, 'tasks'), { recursive: true });
  await mkdir(join(root, 'config', 'flows'), { recursive: true });
  await mkdir(join(root, 'config', 'gates'), { recursive: true });
  await mkdir(join(root, 'config', 'architectures'), { recursive: true });
}
