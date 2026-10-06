# Parallel isolation mini slice

## 推进与交接

2026-10-06：父 Agent 在原 flow 交付后追加授权，只补实际两个 worker 同时在独立 worktree 实现、主 Agent 单写状态并串行 fan-in 的证据。此 mini 位于独立 `codex/parallel-mini` worktree，原 flow 分支与05/06/07状态不变。不重复 PR/retro/完整矩阵，不访问账号或个人全局配置，不执行原始 session。

行为：两个独立纯函数 `leftTag(id) → L(id)`、`rightTag(id) → R(id)`；汇合 `pairTag(id) → L(id)|R(id)` 消费两个函数。只使用 plain node:test；不安装依赖、不用 npm 或外部服务。每个 worker 仅写对应 module/test/evidence，不写状态、不追移动 tip、不合入。

```implementation-plan
[{"id":"parallel-mini","tickets":["01","02","03"]}]
```

主 Agent `/root/forward_test` 单写管理。两叶先 claimed，统一 fixed integration SHA 后建两个分支/worktree，同时派发；worker 先发 ready，收到共同 go 后开始各自 red→green 和 commit。记录各自阶段时间，不伪造同时写入证据。主 Agent 固定一次只合入一叶，完成验收后 resolved，再从最新 SHA 启动03。

| 票 | Worker | 绝对 cwd | 分支 | fixed integration SHA |
| --- | --- | --- | --- | --- |
| 01 | `/root/forward_test/mini_left` | `/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-workflow-forward-w8bbc4q1-mini-left` | `codex/parallel-mini-left` | `ba096ffc120a7b59f8bb383f3398fec8bfa8ddea` |
| 02 | `/root/forward_test/mini_right` | `/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-workflow-forward-w8bbc4q1-mini-right` | `codex/parallel-mini-right` | `ba096ffc120a7b59f8bb383f3398fec8bfa8ddea` |
| 03 | `/root/forward_test` / 小票串行 | `/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-workflow-forward-w8bbc4q1-mini` | `codex/parallel-mini` | `b60881bbb46f68c93fcf63c7f9023adc10fbbc1d` |

01 已由真实 worker 提供固定基点提交，主 Agent 核实仅独占写集后单独 merge，集成3/3通过并 resolved；02尚待串行合入，03仍阻塞。原 flow 的05/06/07不动。

02 已随后单独合入，叶集成6/6、exit0。两叶 resolved 后重算 frontier，仅03 ready，主 Agent 从最新 integration SHA 做小汇合票；不重复已足够的PR/retro/评审矩阵。

### 最终结果

两位真实 worker 在同一派发期运行，各自固定同基点、独立绝对 cwd、代码/测试/证据写集独占。工作提交保留在各branch并已按01→02串行合入。阶段原始时间和协调等待分别记录；微小模块写入没有同毫秒重叠声明。主 Agent 在两个目录并发启动实际目标 node:test 的进程区间完全重叠，均3/3、exit0，原始证据见 [orchestrator](evidence/orchestrator.md)。

汇合从最新 `b60881bbb46f68c93fcf63c7f9023adc10fbbc1d` 推进：`pairTag("02a")` 返回 `L(02a)|R(02a)`，保留空格输入；实现source `2d6f55a8e71bc704948ce4385664208a8bbc06e9`，8/8通过。03 resolved，mini frontier三票均resolved，无ready/claimed/held。仅覆盖纯Node并发调度、真实worker隔离、串行集成、fan-in；不重复PR/retro、外部CI、App/SDK/GUI矩阵。原flow05/06/07仍与baseline相同。
