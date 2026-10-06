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

最终收尾发现既有诊断读取器将 Main 自有码 `notification-unavailable` 脱敏为 unknown。真实 Reader 失败测试后，仅加入该精确白名单码，未知码和秘密/路径/业务内容剔除保持；12 Reader 测试通过。另将原生核验脚本预期短 ID 对齐生产六位值，不制造通知或点击。两个独立 reviewer 在固定 `e651e34f2ce21ef49e50fe57322ac10532521436` 增量复核均无新增高价值发现：[Spec最终复核](evidence/attention-review-spec-final.md)、[Standards最终复核](evidence/attention-review-standards-final.md)。最终完整检查为794行为/34架构/74工具通过、2既有opt-in跳过，见[原始结果](evidence/attention-final-engineering-check.txt)。

诊断码修复后的产品 build source 为 `672afdc675f835ecde2a000088020cf75da2b9d3`；`git diff e651e34..672afdc -- src validation` 为空；另有已生成结构报告的输入hash/行数刷新及管理/已保存证据追加。候选和实际验证的精确身份见[交接](attention.md)。Mac 锁定导致原生显示/点击及关窗重开未完成，01c保持claimed，不将自动包内检查或静态review当作该部分验收。

## 实际失败详情裁切与增量复核

主Agent复看672afdc包截图，独立Spec审查确认新增P2：失败收据虽focus/details open，仍被狭窄reading容器裁切；旧harness仅检查window rectangle漏检。修复d272bd6bfb9a4a7f4d54e0a20b69940c514ede82仅匹配failed收据时进入既有阅读专注，Editor保留、可恢复controls，needs-answer/缺收据runtime回退保持可見。实际React红灯后10项相关green，原候选16项与截图保留于attention-macos-pre-layout。

两个独立reviewer在固定d272bd6复核均无新增高价值问题，源码P2关闭；新版实际几何须候选验证。原harness已加强为状态段落完整落在window与所有overflow祖先有效可见交集内，不要求长正文全部在屏内：[原报](evidence/attention-review-spec-layout-original.md)、[Spec复核](evidence/attention-review-spec-layout-final.md)、[Standards复核](evidence/attention-review-standards-layout-final.md)。最终候选身份/实际几何结果见交接，不能以静态复核代替。

布局修复后完整检查795行为/34架构/74工具通过、2既有opt-in跳过：[原始结果](evidence/attention-layout-engineering-check.txt)。
