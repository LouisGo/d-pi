# 源码目录与依赖边界

状态：2026-09-29，P0–P4 原交付经独立 review 补齐环境、生命周期、事务端口和工具扫描边界。机器配置见 [`architecture/modules.json`](../../architecture/modules.json)，临时过渡边见 [`architecture/exceptions.json`](../../architecture/exceptions.json)。本页只说明稳定规则，不复制各模块的业务合同。

## 目录

生产领域使用 `src/modules/<domain>/<environment>/`：

- `contracts`：可序列化 DTO、Zod schema 和窄接口，不依赖 Node/Electron/React/Monaco/OMP 运行时；`app/contracts` 只描述桌面组合合同。
- `core`：平台无关规则、控制器和投影；不拥有数据库、Electron 或 OMP 实例。
- `main` / `host` / `renderer`：对应环境实现；不存在该实现时不创建空目录或入口。
- `src/app`：跨领域的应用用例与 UI 组合，不复制领域状态。
- `src/platform`：只有明确的纯技术设施才进入；“两个模块都使用”本身不是迁入理由。
- `src/shared`：稳定的跨域值对象或基础合同；新增 shared 必须说明唯一事实和消费者。
- `runtime`：随包 OMP/SDK 的薄宿主入口（`runtime/host.mjs`）；由领域清单登记为独立模块，`public` 即该入口文件，不放应用业务代码。

## 依赖

模块之间只能通过目标模块同环境的公开入口（通常是 `public.ts`；平台消费门控等已有单文件入口由清单明确登记）。环境方向由门禁检查：无头层不能接平台/界面运行时，Renderer 不能接 Node/Electron；生产代码不能引用测试、fixture 或 validation。模块内部使用相对路径，不绕回自己的公开入口。

模块清单只登记模块根、公开面、环境和跨模块依赖。普通内部移动不需要同步 JSON；公开面或依赖变化才改清单。临时例外必须有精确来源/目标/规则、原因及清除波次，不用宽泛路径放行。

## 验证

```text
pnpm check:architecture
pnpm test:architecture
pnpm report:structure
```

`check:architecture` 是失败即阻断的边界检查；`test:architecture` 运行真实 CLI 的正/负例；`report:structure` 只提示覆盖和规模热点，不以行数制造抽象或失败。行为、事务、恢复顺序、OMP 所有权仍由领域测试和切片验收负责。

当前源码扫描范围为 `src` 与 `runtime`：`src/modules`、`src/app`、`src/platform`、`src/shared` 与 `runtime` 均由领域清单登记；结构报告应保持生产源码 `unowned=0`，例外清单为空。Renderer 的 i18n、设计 lint 和 Tailwind source 扫描均显式覆盖 `src/modules/*/renderer`。新增模块、环境或跨模块依赖必须同步更新机器清单及对应模块 AI 规则，不得通过扩大路径例外绕过门禁。

## 职责分组与工程脚本（2026-10-01）

环境内存在独立职责时再分组，采用实际功能名（例如 execution 的 runtime / submission / transport，input 的 editor / clipboard / references），公开入口保持原环境 `public.ts`。Main 和 Renderer 的具体落点见 [`src/app/AGENTS.md`](../../src/app/AGENTS.md)。测试与实现就近；涉及应用仓储与领域运行的组合测试放 `tests/integration/`。小而单一的目录不增加空层级，共同生命周期状态不按行数拆分。

`scripts/checks/` 管环境、依赖、文档、设计与文案检查，`scripts/runtime/` 管 OMP/SDK 资源准备，`scripts/tasks/` 管本地任务及总看板，`scripts/testing/` 管受控测试运行环境；既有 `scripts/architecture/` 保持边界扫描与报告，`git-hooks.mjs` 保持单独入口。统一从仓库根执行现有 pnpm 命令；不依赖调用者的用户数据和认证环境。脚本及 fixture 的相对路径随迁移收齐，历史验证的已记录命令和哈希保留。
