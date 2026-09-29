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
