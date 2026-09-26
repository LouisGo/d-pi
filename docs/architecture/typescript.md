# TypeScript 范式与数据边界

日期：2026-09-26。状态：D-35 已确认；适用于 d-pi 应用自有 TypeScript，包括 Main、Host、preload、Renderer、共享合同和测试。用户要求 ts-pattern 尽用于应用业务分支、用好 Zod v4；本文件把方向落实为写法和验收依据。当前尚无产品源码，下面是接入标准，不是已经通过的工程检查。

## 1. 让正确性体现在类型里

- 产品工程建立时开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitReturns`、`noFallthroughCasesInSwitch`、`verbatimModuleSyntax`；各进程按实际构建目标配置，类型导入使用 `import type`。Biome 管 lint/格式，`tsc --noEmit` 独立查类型，不用打包成功替代类型检查。[TSConfig 说明](https://www.typescriptlang.org/tsconfig/)
- 数据按实际状态建模：使用判别联合，让成功分支拥有结果、失败分支拥有原因；避免一组可选字段或多个布尔值拼出不可能状态。区分缺失、显式清空和空值；不要把 `Partial<T>` 当作任意业务更新命令。
- 模块公开的操作/结果合同清楚稳定，导出函数标注有意义的返回类型；内部值让推导工作，配置映射用 `satisfies` 检查完整性并保留字面量信息。优先简单对象、纯函数和窄接口；泛型表达真实关联，不为了消灭几行重复造通用框架。
- `ThreadId`、`SubmissionId` 等易混淆身份按需要使用 branded type，通过受控构造/解析取得；跨进程序列化后重新验证。brand 不能证明资源归属或授予权限；`traceId` 也不能替代业务身份。
- 共享合同优先只读数据，状态转换返回明确新值；编辑器等第三方可变对象留在所属适配层。`readonly` 是类型约束，不自动产生深冻结或跨进程隔离。
- 未知数据和捕获的异常先用 `unknown`。禁止以 `any`、双重断言、非空断言或大面积忽略注释绕过缺口；不可避免的第三方类型问题在最窄适配点处理，写明依据并验证。不得为“全绿”降低严格选项；必要的编译期反例可用带原因的 `@ts-expect-error`。

## 2. ts-pattern 是业务分支的默认写法

对事件、命令、提交状态、错误结果、权限决策、视图状态映射和多条件业务转换，优先使用 `match`。不再等到 `switch` 写不下才把它当可选工具；新增相关代码按这一范式组织，触及旧代码时在本次行为范围内收敛。

- 对封闭判别联合逐项匹配，以 `.exhaustive()` 结束；必要时用 `.returnType<Result>()` 约束各分支输出。新增一种状态应让遗漏的消费位置在编译期暴露。[ts-pattern 官方用法](https://github.com/gvergnaud/ts-pattern#exhaustive-otherwise-and-run)
- 不用末尾 `P._`、`.otherwise()` 或 `.run()` 掩盖封闭业务集合的漏项。开放输入先在边界转换成已知类型或显式的“不支持”结果；真实开放集合确需默认行为时，写明默认分支的业务含义。
- 简单布尔判断、空值提前返回和循环退出继续直接表达；这是代码粒度选择，不能把复杂业务分发退回散落的 `if/else`。穷尽匹配只证明覆盖了类型分支，不证明状态转移合法、权限充分或副作用成功。
- 状态转换优先为纯函数；匹配分支返回有明确类型的结果或交接到窄副作用接口。保持处理归属清楚，不把 `match` 包装成另一套状态机框架，不引入 XState。
- `isMatching` 可帮助内部结构收窄，但不替代外部输入的 Zod 校验、规范化和错误报告。

## 3. 用好 Zod v4：在边界解析，内部传递可信类型

采用 Zod v4 标准版；实际接入锁定兼容的稳定版本。本项目使用 `zod` 作为统一入口，不并列维护 v3/v4 或为没有测量依据的体积目标另铺一套校验库。[Zod 包说明](https://zod.dev/packages/zod)

| 场景 | 约定 |
| --- | --- |
| IPC/MessagePort、OMP 输入、配置、版本化持久记录与外部文件数据 | 接收为 unknown，在消费方的信任边界解析；先限制消息/内容大小，再解析并按合同验证。格式正确后仍要检查来源、Thread/资源归属、代次和状态 |
| 可序列化业务合同 | schema 是类型的单一来源，使用 `z.infer` / `z.output`；发生转换时显式区分 `z.input` 与 `z.output`，不另写漂移的同构 interface |
| 内部规则与已校验值 | 直接使用 TypeScript 类型；纯内部模型无需为了“统一”制造 schema。跨越新的信任/持久化边界再校验，不在每个函数/hook 重复 parse |
| App 自有命令/持久记录 | 明确 schemaVersion 和未知字段策略，严格命令优先 `z.strictObject`；不要依赖默认去除字段来掩盖拼错的命令或不兼容版本 |
| 上游可扩展事件 | 校验使用的字段，明确处理未知类型/字段。需要保留扩展信息时限定在适配层；不把宽松对象直接授权为 App 命令，不把新事件静默扔掉 |
| 状态与失败 | schema 使用 `z.discriminatedUnion` 对应业务判别联合，内部用 ts-pattern 消费；新分支同时更新解析、规则与展示，不能只补 UI 文案 |

Zod 对象默认会去除未声明键；`z.strictObject` 与 `z.looseObject` 表达不同策略。按具体协议选择，不能把“所有边界严格拒绝”套到可向后兼容的上游事件。[对象与联合 API](https://zod.dev/api)

预期校验失败使用 `safeParse` / `safeParseAsync` 返回明确结果；包含异步校验/转换的 schema 要使用异步入口。业务可处理的失败使用判别结果并保留诊断合同的错误身份；第三方接口要求 reject 时由适配层转换，不能吞成空数组或默认成功。错误日志只保留必要的路径/错误码与关联信息，不记录原始秘密或整份输入。[解析与类型推导](https://zod.dev/basics)

规范化必须有明确业务含义。不要用宽泛 `coerce`、`.default()` 或 `.catch()` 把格式损坏、权限值或未知提交状态变成有效数据；可缺省偏好才按合同设置默认值。需要双向转换时可用 v4 codec 表达两侧 schema，并验证往返；没有双向需求的普通解析无需引入 codec。SQL/IPC DTO 保持可序列化，不传 ZodError、类实例或编辑器对象。[转换与 codec](https://zod.dev/codecs)

## 4. 一个完整的小例子

以下只演示“边界解析 → 判别联合 → 穷尽消费”，不是生产文件协议、路径授权或容量预算；接入时复用该功能的正式 schema。

```ts
import { match } from "ts-pattern";
import { z } from "zod";

const ReadSummarySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("available"), name: z.string() }),
  z.strictObject({ kind: z.literal("missing") }),
  z.strictObject({ kind: z.literal("denied") }),
]);

type ReadSummary = z.infer<typeof ReadSummarySchema>;
type LabelResult =
  | { readonly ok: true; readonly label: string }
  | { readonly ok: false; readonly reason: "invalid-payload" };

function labelFor(summary: ReadSummary): string {
  return match(summary)
    .returnType<string>()
    .with({ kind: "available" }, ({ name }) => name)
    .with({ kind: "missing" }, () => "文件不存在")
    .with({ kind: "denied" }, () => "无法访问")
    .exhaustive();
}

export function readLabel(payload: unknown): LabelResult {
  const parsed = ReadSummarySchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, reason: "invalid-payload" };
  }
  return { ok: true, label: labelFor(parsed.data) };
}
```

该例没有把 payload 强转为 ReadSummary，也没有用兜底分支隐藏未来新增状态。真实界面的名称仍按不可信文本呈现；schema 成功不等于可执行 HTML 或访问对应文件。

## 5. 各层职责与完成证据

类型、schema 与模式匹配帮助落实已有[基础契约](foundation-contracts.md)、[无头功能](headless-features.md)和[诊断合同](diagnostics.md)，不新建第二套状态/异常/持久化框架。Base UI/Tiptap 类型留在 Renderer 接入层，SQLite 行/驱动留在宿主存储适配层，共享 DTO 不依赖这些供应商类型。数据库约束与版本检查仍要执行，Zod 不是事务，事务也不是 OMP 已接受的证明。

建立产品工程后，改动按影响完成类型检查、Biome 与必要行为测试；边界变化覆盖合法值、非法值、未知版本/事件及授权失败，业务变化覆盖相应失败与恢复路径。有防错价值时加编译期反例，例如新增联合分支必须补处理、不同业务 ID 不能误传；不为每个类型制造快照或重复实现的测试。公开提交实际运行的命令和结果，不能把本规范或静态示例当作通过证据。

质量标准是：类型能指出遗漏，外部坏数据被明确处理，业务状态/副作用归属易读，修改一个合同能追到受影响位置。库使用数量、泛型层数和链式写法本身都不是质量指标。
