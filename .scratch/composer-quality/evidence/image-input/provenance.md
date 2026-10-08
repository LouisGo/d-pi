# 图片传输修复证据

2026-10-08，基点 `25e8c58`；仅 composer-quality 隔离树，本地实现与 commit。Node 24.21.0 / pnpm 12.8.1 / Bun 1.3.14 / OMP 18.4.6，无新增依赖。

## 红绿与范围

- 初始 Main/提交/原生写入三个失败见 [摘录](initial-red-excerpt.md)。原始输出含很长的测试 fixture Base64，留在本地忽略文件 red.log，摘录明确省略该值。不是实际用户图片正文。
- 资源表示先失败见 [resource-red](resource-red.txt)；缺水合与异步暂停 helper 的真实红灯见 [hydration-red](hydration-red.txt)、[stop-red](input-stop-red.txt)。
- 两轴评审发现压缩 @ 引用通用收尾丢失派生摘要。新回归先 [red](reference-red.txt)，修复后连续准备、派生预览、源变化重新准备及真实 worker [26 green](reference-green.txt)。两轴最新固定差异 SHA-256 `c2849931de474435bc2918fb953c3785f561a8ebf1c6de4ecbada1d957d1138c`，源码清单见 [manifest](review-source-manifest.json)。后续仅治理文档、测试缩进、input/main→shared依赖登记和报告新鲜度更新，行为源不变。Standards另行只读复核清单增量并独立通过架构/结构检查；无例外或放松门禁。
- 最终 [受影响回归](regression.txt)：34 文件、299 项通过，涵盖完整 input、真实 Bun image worker、SQLite冻结/资源生命周期、SessionHost拒绝、compact NativeSession fixture 与旧收据。不是实际 provider 发送。
- [tooling](tooling.txt) 111 项、[design/i18n/architecture](ui-lint.txt) 中 35 architecture tests 通过；[完整类型](typecheck.txt)、[构建](build.txt)、[SDK准备](sdk-prepare.txt)、[完整环境门禁](environment.txt) 通过。最终 fast 输出见 [check-fast](check-fast.txt)。SDK 同步前用户明确退出占用的 d-pi；资源拷贝/hash成功。

## 准备错误与限制

早期直接 Vitest 的 codec 6 项成功，正规隔离 runner 改 cwd 后相对路径找不到 Bun，6项 image-compression-unavailable；这是测试资源定位错误，改为 import.meta.url 后正规 runner成功，不当作产品红灯。一次误用 `pnpm test -- run` 被 runner明确拒绝，测试未执行；之后使用合法过滤。旧 Base64 收据断言、@PDF预览分类和fixture非规范根目录按当前合同纠正，源码红灯与测试准备错误分别表达。Vitest并发设4，未修改测试超时。

实际默认阈值的随机透明 PNG 2560×1280、约12.5MiB，在真实 worker生成2048×1024且小于10MiB的PNG；另有低字节预算 WebP透明度、畸形/像素炸弹、GIF拒绝、并发队列和thumbnail不放大测试。小图返回原 Uint8Array 实例。没有完整视觉质量、峰值RSS或30min性能测量，不承诺对所有图片最快。

[大小对照](payload-size.txt)仅受控序列化fixture：原件908202B、Base64 1210936B；同字段旧JSONL 1211061B、新引用JSONL224B。证明 App 管道大小及收据重复编码已消除，不能替代吞吐/内存基准。

没有运行GUI/Dev/E2E、真实Host或provider。用户实机验收继续pending。完整check未重跑；先前SDK PDF/CLI fixture失败及根因unknown继续保留，不冒称全库全绿。构建保留既有chunk警告，不是签名/包内验收。
