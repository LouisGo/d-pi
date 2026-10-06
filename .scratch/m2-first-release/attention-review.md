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

最终clean产品source9a8c2eea41196b5584a46fcc575ed589a7cfe392与受评d272bd6生产/validation源相同；新候选16项实际包内检查通过，强化祖先裁切交集显示状态段落284–309.5落在193–728有效区域，截图实看失败详情可读。包/ZIP身份见[交接](attention.md)，原生显示/点击/窗口保持独立待验。

## macOS继续发现的预算与迟到状态定位

旧m2.18实际多提醒阅读0的P2：[Spec原报](evidence/attention-review-spec-budget-original.md)。仅cap修正的63a578f仍出现9提醒center64/reading0；迟到首次inspect可达P2：[原报](evidence/attention-review-spec-focus-original.md)。产品48cd01cc补阅读4lh下限并等待实际Runtime首样本/transition结束，只有成功focus才记录意图，后续状态不夺焦。新真实React回归先红/19相关green；完整796行为/34架构/74工具通过。

两轴固定增量独立复核分别覆盖预算cap、产品48cd01cc及validation-only 78b8631/adcd4d3：[预算Spec](evidence/attention-review-spec-budget-final.md)、[预算Standards](evidence/attention-review-standards-budget-final.md)、[最终Spec](evidence/attention-review-spec-reserve-final.md)、[最终Standards](evidence/attention-review-standards-reserve-final.md)。均未发现新增可触发高价值问题；原报告当时明确新包待验，保留原文不事后改为reviewer亲测。

主Agent随后在同产品48cd01cc clean包、外部harness adcd4d3上补齐实际18项green；五组9–10提醒几何、原焦点恢复/最后项内部滚动/阅读与Composer可见及草稿保留通过，截图实看。真实Cmd+W/Finder同Main重开无重发、冷偏好持久化完成：[结果](evidence/attention-macos-m2.19/m2-result.json)。这是报告后的实包证据补齐，非静态review替代。01b resolved；系统failed且实际显示/点击未验，01c claimed。

过程失败分开保留：早期两个待答focus timeout根因unknown，不作预算红灯；首次无center来自正常已读场景，后用4个正式GUI/SDK后台completion产生明确unread负载。焦点probe原helper恢复未核实可污染下一样本，修正为last.blur/恢复并断言真实prior；旧日志未记录prior，唯一实机根因不倒推。新Thread null editor race以实际current UUID+可编辑非inert+runtime ready等待修正。全部是验证可信度修补，未放宽实际几何/焦点断言或注入事件。[过程](evidence/attention-reminder-continuation-tdd.md)与各失败现场仍在。
