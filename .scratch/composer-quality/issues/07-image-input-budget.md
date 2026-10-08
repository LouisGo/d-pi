# 07 普通带图提问与公共图片压缩

Status: resolved
Blocked by: none

2026-10-08 用户授权本地实现与 commit，基点 `25e8c58`，仅既有隔离树 `/Users/lou/.codex/worktrees/composer-quality/d-pi`。不运行 GUI/Dev/E2E/真实 Host 或 provider，不 push。

## 缺陷与最终方向

只读 App 草稿对应单个 908202-byte PNG 和短问题；Main prepare 因 Base64 膨胀超过应用旧 1MiB 门槛而拒绝，未提交 OMP。固定 SDK 18.4.6 的 1MiB 常量属于 stdout frame，stdin 没有同一限制。用户要求检查 T3 后，采用二进制私有存储、不可变资源引用、临近 OMP 编码；不采用单纯扩大所有 App RPC 的方案。依据见[复核证据](../evidence/image-input/t3-transfer-analysis.md)。

用户随后明确授权自动压缩和公共工具，取代本票早期“不压缩”候选限定。小图验证后保留原字节，超过单图 10MiB 才生成有界派生物，原件及来源身份保留，预览与压缩标记可见。GIF/APNG/动态 WebP 超限时拒绝，不静默扁平化。源上限仍 25MiB/总 100MiB，发送图片总量 40MiB，最终内部 JSONL 64MiB 是应用预算。独立二进制 worker、并发/队列/像素/时间与编码次数均有界。

## 验收

- 普通约 887KiB PNG 不因提前编码拒绝；新收据与 App 管道只存摘要/长度/MIME，旧内嵌收据继续可读。
- 宿主从 Main 给定的规范私有目录读取，校验路径、文件种类、长度、摘要、MIME 与预算。缺失/损坏/暂停得到已证明拒绝，保留草稿，不能 ACK 或变成 unknown 重发。
- 异步读取后再次检查暂停 epoch，队列保持原顺序；ACK 和消费草稿事务保持。
- 公共压缩工具可复用，无 Base64 worker IPC，无新增依赖；派生资源纳入 lease/清理和固定 SDK 打包/hash。
- 真实压缩 worker、资源水合、Main/SQLite 冻结与宿主拒绝回归、类型/门禁/build、两轴独立评审。实机与 provider 验收仍 pending。

工程验证与两轴独立复核完成，见[验证](../validation.md#2026-10-08-普通带图输入与公共压缩07)和[评审](../review.md)。用户实机认可仍pending。
