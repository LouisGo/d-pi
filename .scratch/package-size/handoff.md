# 打包体积收敛交接

2026-10-08，基点 `a0367becdf015a4b7fa7a31aa23050c74a275849`，实现提交 `c0d93ea`，本地 `codex/package-size` 已通过 merge commit `a8a8663e0a90dfde903fff004016adfc82160d1c` 合入 `main`。用户明确授权 commit 并本地 PR 到 main；没有 push、创建远端 PR 或公开发布。所属[规格](spec.md)、[本地 PR](pr.md)与[工程票](issues/01-package-size.md)。

## 结果与原因

用相同 `out/`、Electron44.4.5、Bun1.3.14、OMP18.4.6和冻结安装依赖，分别按原 `prepare-sdk.mjs`/builder配置与新规则构建实际macOS arm64目录包。两份ASAR SHA-256相同；对照只改变SDK资源策略，原准备脚本在临时目录中仅把源码导入与pnpm store根指向同一checkout，避免软链目录别名改变复制语义。不是拿不同版本候选比较，也不是根据 `du` 估算收益。

| 内容 | 原规则实测 | 新规则实测 | 变化 |
| --- | --- | --- | --- |
| 完整App逻辑字节 | 1,276,070,280（1216.96MiB） | 892,737,411（851.38MiB） | 减少383,332,869 bytes，30.04% |
| SDK逻辑字节 | 958,387,005（914.0MiB） | 575,054,136（548.41MiB） | 减少约40.0% |
| 普通文件数量 | 21,355 | 11,108 | 去除10,247个分发冗余文件 |
| 当前ZIP | 无同规则旧ZIP对照 | 296,768,447（283.02MiB） | 下载/复制体积与App解压体积分别记录 |

完整分项见[比较JSON](comparison.json)、[ZIP身份](distribution.json)。逻辑字节不跟随软链、不重复统计目标，不等同APFS物理回收或运行内存。

主要减少项：ONNX外平台/架构二进制约201.8MiB，source map约56.1MiB，非源码类型声明约38.4MiB，未使用CLI bundle约26.8MiB，字节相同的ONNX dylib别名约42.5MiB。Native本机原库约166.7MiB、Bun约60.2MiB、Electron框架、浏览器WASM及现有optional依赖仍保留；没有为追求数字strip/rebuild native或删除OMP功能。

## 实现与保持的边界

- 从受管理store逐包复制声明的运行依赖/peer/可用optional，不复制整个store单元和不相关链接；按os/cpu过滤外平台optional，必需依赖缺失则失败。
- ONNX只保留当前平台架构；同版本两份dylib的大小与SHA-256均相同才以相对链接共享文件，dyld `.1.dylib` 路径与原始字节保留。
- 保留源TS、JSON、模板、原始许可、Worker、Bun、WASM。实际SDK控制发现browser `declarations.d.ts`是运行文本资产，已保留所有源码目录声明并补回归。
- Transformers4.3.0 bundle实际引用未声明的hoisted `onnxruntime-common`。原包也在隔离导入时失败；新规则只补其固定已安装解析链接，不把hoisted开发树带入包，并用独立Node子进程校验惰性optional入口。不下载模型、不请求供应商。
- SDK资源预算650MiB，完整App1000MiB；准备和afterPack按实际字节拒绝超限。afterPack还核对目标平台、启动哈希、必要App入口、ASAR无重复node_modules、链接无断裂或资源根逃逸，输出 `package-size.json`。配置语义参照[electron-builder官方内容文档](https://www.electron.build/v26/docs/contents/)。
- 原有资源锁、固定sdk.ts import修正哈希、staging import、失败保留旧资源与原子替换不变。不改执行/收据/数据库/恢复/权限/供应商。

## 验证与限制

- TDD：旧准备规则保留外平台文件的反例先失败→新规则通过；重复dylib别名、固定Transformers缺失链接各有失败→通过。源声明文件被误裁剪的真实SDK控制失败得到修正并加入回归。
- `node --test tests/tooling/{sdk-preparation,sdk-packaging,packaged-size,environment-gate,engineering-entrypoints,license-notices}.test.mjs`：20/20通过，包含必需依赖缺失、循环/peer、超限、断链、逃逸、篡改、平台、ASAR重复及准备失败保留旧资源。
- `electron-vite build`通过；Main/preload/Renderer均构建。架构441源码、结构报告、交互策略、Biome、文档/任务状态检查通过；没有改应用TS，不重跑不相关业务矩阵。
- 环境检查：Node24.21.0 / pnpm12.8.1 / Electron44.4.5内嵌Node24.21.0 / Bun1.3.14 / OMP18.4.6，48/48精确依赖，0issues。冻结安装补齐react-resizable-panels，锁文件未变。
- SDK控制四项通过：stop/continue原会话队列、同ID ACK后失败、completed/steer/followUp/abort/settled/压缩竞争、原生run与background关联。全部为隔离配置/本地fixture，不是实际供应商。
- 最终App移至含空格目录，包内共享Main资源校验、Bun/SDK factory、ONNX native/dyld别名与Transformers ESM导入通过；移位包内SDK stop/continue通过。入口 `node .scratch/package-size/verify-resources.mjs <app路径> <新JSON路径>`，[机器结果](runtime-verification.json)记录准确限制。Shared Main校验在隔离Node中运行，不冒称实际Electron GUI启动。
- 保留的112个包与已安装锁定源码逐项核对149份license/copying/notice文件，15,567,708 bytes完全相同，[许可文件结果](license-verification.json)。这是文件保留，不是公开分发合规结论。
- 全量tooling另跑一次100项：98通过、2失败。`development-launch.test.mjs:70`因本机`/var`与`/private/var`路径别名；`git-hooks.test.mjs:282`假设pnpm缺失，但本机Node工具目录存在旧Corepack shim，返回1而不是missing的2。两测试及对应实现均未在本次修改，没有关闭断言或顺手扩scope。
- 本机Corepack仍把pnpm12当旧 `bin/pnpm.cjs` 启动而失败；使用同版本官方 `bin/pnpm.mjs` 下载的12.8.1原生CLI，临时PATH入口供builder使用，并显式`--pnpm-cli`完成环境校验。没有升级/修改用户全局Corepack；标准pnpm shim需后续工具环境对齐，不是包内Runtime依赖。
- 提交 `c0d93ea` 的实际pre-commit hook执行 `check:fast` 全部通过（环境、620文件Biome、交互、文档、441源码架构、结构与状态）。隔离环境会优先使用Node所在工具目录，故提交时在临时目录复制当前Node24.21.0原始可执行文件，配合同版本缓存pnpm12.8.1入口；未关闭hook或更改全局工具，临时目录在finally清理。本地合并未改实现文件，不重复打包；现有ZIP仍保留原先WIP构建身份。
- 未重跑完整check、GUI组合、系统通知、真实认证/供应商、语音/模型推理、长稳、签名/公证或远端CI。独立Spec/Standards结论见[复核](review.md)。

## 本地交付与回退

候选 `dist/package-size/mac-arm64/d-pi.app`，ZIP `dist/package-size/d-pi-mac-arm64.zip`，未签名。版本 `0.1.0-workbench.3`，build ID `a0367bec-dirty-fa25a054`，基点SHA与dirty字段真实保留；SDK manifest与ASAR哈希见比较JSON。当前App仍约0.89GB（十进制），ZIP约0.30GB，不宣称删去了所有可讨论的能力。

预算是明确门禁，依赖升级导致超限时复核资源与功能需求，再调整所属规则/证据；不能关闭检查让包默默回到1.2G。旧规则对照App与临时SDK在记录后清理，只保留本轮新候选及ZIP；不清用户App数据、原生会话或已有其他产物。

回退打包配置/脚本并重新准备SDK与构建即可恢复旧资源布局；没有数据库/权限/配置迁移，现有SDK原子发布规则仍有效。重准备前关闭使用相同SDK根的d-pi。用户试用与认可独立于工程resolved。
