# 多 Thread 提醒双轴独立评审

base/merge-base `7c9e1fee48ccb467db359a18401d8a30ca57a04e`，首次固定head `46121f1fcf5574724f2c023c8beda6374366dfee`；两个全新只读reviewer分别覆盖Spec与Standards，均不参与实现。独立checkout固定源、没有安装/构建或改源；review命令/覆盖与限制见原报告。

| 轴 | 确認的问题 | 核实与修复 |
| --- | --- | --- |
| Spec | P2：模型先切换但Router未显示目标，就经visible清未读 | 真React路由采样先红；移除AppModel提前visible，实际消费者仅前台且route匹配声明visible |
| Spec | P2：同trace保留Q1时新增Q2被kind+trace去重吞掉 | 同连接真实新增pending ID场景先红；新pending集合更新eventId/未读，重复集合仍稳定 |
| Standards | P2：同submission完成后实际迟到错误已改failed，提醒却仍completed | 既有Runtime completed→error调用链与真实类证明，root先红；允许终态失败纠正并保持failed，不重发 |
| Standards | P2：harness切回A后seen B，却期待成功 | 正确断言typed invalid-request，同trace独立读snapshot/答案文件/供应商调用保持；不放宽可信IPC |

修复 `61f1e24efacaf8e5eda4189b84149a2da15eddae`；38受影响行为通过，完整793行为/34架构/74工具通过，2既有opt-in跳过。结构报告第一次陈旧失败保留，生成后最终门禁通过。最后产品build source `1a557225c6d6904bdd23752f84d403378e971844`仅追加管理/检查证据；`git diff 61f1e24..1a55722 -- src validation architecture`为空，受评生产源相同。

两名reviewer分别独立复核受影响差异与原整体合同，原问题全部关闭、新增高价值Spec=0/Standards=0：[Spec原报](evidence/attention-review-spec-original.md)、[Standards原报](evidence/attention-review-standards-original.md)、[Spec复核](evidence/attention-review-spec-recheck.md)、[Standards复核](evidence/attention-review-standards-recheck.md)。TDD原始过程及fixture纠正见[证据](evidence/attention-tdd.md)。评审与自动门禁不替代macOS原生通知送达/点击、真实账户试用或用户认可。
