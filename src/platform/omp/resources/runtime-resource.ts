import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import release from "../../../../resources/omp/manifest.json";
export class RuntimeResourceError extends Error {
  constructor(
    readonly code:
      | "resource-missing"
      | "resource-unreadable"
      | "resource-incompatible",
    message: string,
  ) {
    super(message);
  }
}
export async function managedRuntime(resourcesRoot: string): Promise<string> {
  if (`${process.platform}-${process.arch}` !== release.platform)
    throw new RuntimeResourceError(
      "resource-incompatible",
      "当前平台没有已验证的官方 Runtime 资源。",
    );
  const binary = join(resourcesRoot, "omp", "omp");
  try {
    const hash = createHash("sha256");
    for await (const bytes of createReadStream(binary)) hash.update(bytes);
    if (hash.digest("hex") !== release.sha256)
      throw new RuntimeResourceError(
        "resource-incompatible",
        "官方 Runtime 校验不匹配，请重新获取受管理资源。",
      );
    await access(binary, constants.X_OK);
    return binary;
  } catch (error) {
    if (error instanceof RuntimeResourceError) throw error;
    const parsed = z.object({ code: z.string() }).safeParse(error);
    if (parsed.success && parsed.data.code === "ENOENT")
      throw new RuntimeResourceError(
        "resource-missing",
        "缺少官方 Runtime 资源。开发环境请运行 pnpm runtime:fetch；随包版本请重新获取完整应用。",
      );
    throw new RuntimeResourceError(
      "resource-unreadable",
      "无法读取或执行官方 Runtime，请检查应用资源的文件权限。",
    );
  }
}
