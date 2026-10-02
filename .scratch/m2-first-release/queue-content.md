# M2 队列附件内容增量

2026-10-02。承接 [04](issues/04-input-attachments.md)、[05](issues/05-queue-subagent.md) 与 [05a](issues/05a-native-queue-management.md)。本文维护原生适配、schema 与专用验证；正式 Main/Renderer 整合、macOS 候选、独立 review 和用户认可由主 Agent 的 spec/交接记录维护。

## 用户行为与原生所有权

当前待处理 user 内容是一段文字加图片时，用户可进入编辑、改文字、明确移除指定图片、保存或取消，也能删除/同种类移动完整条目。正文可为空，但保存后至少保留一张图片；文字与图片均空则拒绝且继续保留编辑稿。图片独立身份不按字节内容合并，同图附加两次仍是两个可选择项。取消恢复完整原生内容，不把尚未保存的图片选择应用到原队列。

所有正文/图片仍归 OMP 原生消息；App 仅镜像有界元信息和发送明确意图。原生对象 WeakMap 持有条目/图片 UUID，保存沿原始 content 顺序替换唯一文字段并保留选中图片对象，图片编码字节和元字段不改。未修改原冻结提交，不维护第二个 App 消费队列，不自动重发 unknown，也不改变冷旧 Thread 只读。

`queue.ts` 的 `item.images?` 为最多 64 个 `{id,mimeType}`，`imageCount?` 为真实完整计数，不包含 base64、外部 URL 或路径。`editing.retainedImageIds?` 是已确认原生编辑稿的图片选择；`update-edit`/`save-edit` 的可选同名字段省略时沿用现编辑稿，空数组显式移除全部。外国或重复图片身份原子拒绝，既有编辑稿/原队列均不变化。没有图片的纯文字 DTO 保持原形状。

原生 custom、隐藏 companion 前缀、跨图多文字段、未知 content 类型继续不可编辑，避免丢失变换语义；它们仍可按完整原生 group 删除/重排。超过 64 张图不可编辑并明确投影受限；文本预算 256 KiB、快照 512 KiB/128 条不变，预算不足时省略缩略元信息但保留图片完整计数、身份及受限状态，不截断原生图片。未新增图片预览二进制服务，此切片显示附件计数/格式及精确移除。

## 固定源码依据与消费竞争

官方固定 18.4.6 `pi-agent-core/src/agent.ts` 的 `#prepareQueuedMessageBatch` 建立 claim，peek 包含 claim 原始对象；准备前后均核对 abort signal 与原生 claim，同步 commit。`replaceQueue` 单队列原子替换并取消旧 preparation/delivery，避免替换后幸存前缀重复消费。适配继续包裹原有 `prepareQueuedMessages` 前后等待同一编辑对象，one-at-a-time 前项可执行，原生 all 批次包含编辑项则整批暂缓，不改用户模式。

官方 `session/queued-messages.ts` 的 queueChipText 对图片专用文字返回 `[Image]`，多 text 只取第一段；适配对真实 user 自行读取正文，图片专用条目正文为空，绝不把显示占位写进原消息。官方 `AgentSession.#normalizeImagesForModel` 可合法预处理/转码图片；这里保存的是队列已存在的原生图片，provider 图像 MIME 由原生适配决定，不把转码误判为丢图。

## TDD 与定向结果

- 真正红灯：新增混合内容可编辑、图片专用内容、外国/重复图片选择及大集合元信息四项先失败，见 [初始红灯](evidence/queue-content-red.txt)。补充 text/image 原序测试也曾明确失败，之后保留原序的最小实现转绿。unsupported/group 用例补的是原实现正确行为，不制造红灯。
- `node scripts/testing/test.mjs node tests/tooling/native-queue.test.mjs`：**13/13 通过**，包含既有 7 项和新增 6 项。`pnpm typecheck:core` 与改动文件 Biome 通过。
- 真实 `validation/s3/sdk-queue.mjs`：资源复制到临时隔离 SDK，仅替换本次 `native-queue.mjs`；独立临时 HOME/config/project/session，localhost 零费用 Provider。**10 次请求通过**，沿用原 one-at-a-time/all、独立 stop/save/continue 和 companion 历史断言，新增两张同 byte 图片不同 UUID、带图移动/删除、claim 阶段编辑等待、保存只保留指定图片、provider 真正收到一张 `image_url` 和新正文、按当前 revision 的已消费身份明确拒绝且零额外请求。[原始固定 SDK 帧](evidence/queue-content-sdk-frames.jsonl)。
- 首次新增 SDK 样本在 PNG-only MIME 断言处失败，原因是合法原生转码；改为检查受支持 data image MIME 和真实 image_url 数量后通过。这是 fixture 假设修正，未改产品或把它冒称产品缺陷红灯。

未覆盖个人凭据/付费 Provider、真实 macOS 视觉/系统关窗和完整附件/PDF/子 Agent 生命周期；不得仅据本记录判完整 04/05 或 M2 用户验收完成。
