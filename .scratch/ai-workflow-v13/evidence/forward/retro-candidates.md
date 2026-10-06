# 2026-10-06 forward 执行候选

只记录本次实际经历，不改 workflow skill 或原始 session。

## 候选：将“无个人配置”的 CLI 隔离落实在命令层

首次按 README 调用 `npm test`，npm 输出 `Unknown user config "home"`，说明默认命令仍会读取个人配置；测试 4/4 完成后进程延迟关闭。原始证据：[02a integration](evidence/02a-integration.log)。这是本次执行者未隔离配置的错误，不是应用行为缺陷，也不作为目标 TDD 红灯。

随后 user/global 同指 `/dev/null` 的尝试在配置解析前被 npm 拒绝，真实原因是 double-loading：[失败日志](evidence/02a-integration-isolated.log)。最终用不同的 fixture 内路径指定 `NPM_CONFIG_USERCONFIG`、`NPM_CONFIG_GLOBALCONFIG`、`NPM_CONFIG_CACHE` 并关闭 update notifier，两个最终命令 exit 0：[test](evidence/final-test.log)、[check](evidence/final-check.log)。

可复用改进候选：对明确禁止个人配置的隔离试跑，在环境准备中提供不同路径的 user/global 配置和 fixture 内 cache；或直接运行 package.json 的 Node 入口。不要将两个配置都指向同一个 `/dev/null`。本次不将候选自动写入 skill 或全局配置。

## 执行模式证据与覆盖缺口

首次并发槽库存：`/root`、`/root/forward_test`、`/root/review_spec`、`/root/review_standards` 均 running。按 skill 的可用性规则降级为串行独立 worktree，02a/03 固定 base，04 从最新集成 SHA 启动，见 [spec](spec.md)。该路径完成了隔离与 fan-in，但不证明两个 implementer 同时写入；父 Agent 后续另行授权的 mini slice 用于补这项实际覆盖。

原实现 skill 的串行 fallback、claim/hold 区分与动态 frontier 在本次可执行，没有遇到必须暂停工程或修改目标的 skill 障碍。收尾 review 使用后续释放的槽位；结论见 [review](review.md)。这一观察只描述本次材料和路径，不评价 skill 整体质量。
