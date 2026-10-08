# 图片传输复核

2026-10-08。用户质疑 Base64 与大图性能，要求检查本地 T3。此次仅源码复核；没有启动 GUI、真实 Host 或 provider，没有修改传输实现与限额。

## 当前事实

- 本地 T3 `/Users/lou/Learn/t3code` 固定 HEAD `30cc788975500a8c00d32a50f348174d1ce578d1`。
- `apps/web/src/lib/attachmentUploadQueue.ts:151-177` 用 XHR POST `File`，非图片 Base64 JSON。成功后保存 attachmentId。
- `apps/server/src/assets/AttachmentUpload.ts:150-224` 有界流写临时文件，检查实际长度后 rename。
- `apps/web/src/components/chat/ChatComposer.tsx:5872-5895` 调用 prepareImageForAttachment，再用 Object URL 预览；10MiB 以内原图不重编码，超过预算才尝试缩放和重编码。阈值见 `packages/contracts/src/chatAttachment.ts:15`，具体逻辑见 `apps/web/src/lib/imageCompression.ts:433-490`。
- T3 并非不用 Base64：CodexAdapterV2.ts:3123-3142 在 provider adapter 中读文件并生成 data URL；ClaudeAdapterV2.ts:1364-1391 在同一末端生成 Base64 image source。适合借鉴的是二进制保存、附件 ID 引用、延后编码。
- d-pi 的 attachment-store.ts 在 prepareContent 阶段编码；PreparedContentSchema.images 包含完整 Base64，SubmissionRepository 将整个 receipt JSON 持久化，状态更新再次序列化整份 receipt。这会使图片体积影响收据存储和状态处理。
- 固定 OMP 18.4.6 的 pi-ai/src/types.ts:871-897 中 ImageContent.data 是 Base64；还有 providerFile/HTTPS url 扩展，但都不是通用本地路径输入合同。RPC prompt 的 images 使用 ImageContent[]，直接转交 session。不能仅把 data 换成本地路径。
- SDK 的 1MiB 常量用于输出帧编码；rpc-input.ts 的 readRpcInputFrames 本身没有 1MiB 输入检查。App 自设四处输入门槛，不能把它描述成实测原生上限。

## 判断与验证限制

908202-byte 图片的 Base64 是 1210936 字节，未含 JSON 开销已超过 App 的 1048576-byte 门槛。该算术解释当前拒绝；不证明大容量的真实 provider 支持或性能。

Base64 约增加三分之一体积，编码和序列化随内容大小增长。额外数据库/进程复制成本有源码依据，尚无相同场景的时间或峰值内存测量，不能断言具体卡顿或内存爆炸。

仅放宽门槛不是性能完整解法。后续修复应评估在冻结提交中保存不可变私有内容引用，沿用 digest/version/lease，临近 OMP 边界才编码；校验缺失/腐败/替换、旧收据兼容与 unknown 不重发。将转换移动到 SessionHost 还涉及受控资源读取接口，不能直接信任 Renderer 提供的文件路径。超过预算的有损压缩属于另外的表示选择，不能默默照搬 T3。

三层新回归目前为 red：Main preparation、SubmissionCoordinator integration、NativeSession fixture。它们证明现有门槛拒绝普通图，不构成最终传输方案或已修复证据。
