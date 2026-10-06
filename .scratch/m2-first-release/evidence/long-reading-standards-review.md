# 06c/06d 独立 Standards 增量复核

日期：2026-10-06。先复现/关闭 c2fd0b3 tooling ownership缺陷，再覆盖实际Copy拒绝后的Main权限修复。最终validation固定3fdb25f、产品source c531558；Main权限边界、旧集成fixture及实际SDK截断证据已增量复核，无新增未关闭的产品边界高价值问题。完整工程gate与最终21项包内machine结果已读取核实通过；实际asar/native artifact也已交叉验证。无未关闭的高价值Standards发现。最新9twqGK工具gap截图已独立查看，第6/6段和SDK原生elision/artifact提示可见，旧取景限制已关闭。真实供应商、全集性能和用户认可仍未验证。

## 固定输入与覆盖

- checkout：`/Users/louistation/.codex/worktrees/m2-long-reading-candidate/d-pi`
- 本次最终 validation head：`3fdb25f5c96f8b126d9b75fcbb1eaa7e8198dd6e`
- 一行选择器修复固定点：`218392527b16d4a14936cc95b2c7da3201f6de5f`
- CDP等待修复固定点：`17da39f9bd5c9fe1777f29522c8ff64c9e792b78`
- SDK artifact断言固定点：`84055cfad4b5d1def68051c662b16b5db32b3449`
- 产品source：`c531558406e3c3b7da4544be8df55fe92d40530f`，两者 `src/runtime/package.json` diff为空。
- Main权限产品source：`15a1440853414e8312c46555c667924324afdbc2`；到c531558仅integration fixture调整。
- clipboard helper最终 head：`b575bea8f1d27f8d5a8c5c73cdef26a9807a5c69`
- 初次增量 head：`c2fd0b3e5726ea1402e225918fd112ebc0fef5b4`；期间根切换到 b575bea8，已刷新全部受影响差异。
- 初审 head：`6757270527d3126208483d72ee1e6c5cf450c9c4`
- base / merge-base 延续：`df41925401d6f64cfe4ea73432ca00523f7a5a94`
- 初次增量：`git diff 6757270...c2fd0b3`，7 files，388 additions /13 deletions；追加复核 `git diff c2fd0b3...b575bea8`，clipboard mjs/swift 与 long-reading harness 三个文件。最终累计增量7 files，391 additions /15 deletions。
- 初末 `git status --short` 均空；reviewer 未编辑源/管理/版本/提交。
- b575bea8时产品 app 源码与 `67cb147` 一致：`git diff --quiet 67cb147...b575bea8 -- src runtime package.json` exit 0；新增 validation helper 未打包。类型修正仅补合法 SubagentView fixture 必填字段、精确 HTMLButtonElement querySelector 类型，未改变产品行为。原分段主体结论延续 `standards-initial.md`。

## 发现

### 已关闭 [P2][Standards] 未标记复制仅凭文本相等恢复，会覆盖新的同文用户复制

路径：`validation/m2/clipboard.swift:130-132`，调用 `validation/m2/long-reading.mjs:222-223` finally 的 `clipboard.restore(expectedText)`。

触发：捕获旧多格式内容、beforeCopy 检查后，本次按钮复制开始但等待/断言/mark 尚未完成；期间用户独立复制与 fixture 完全相同的文本，finally 进入无 owned.json 分支。该分支仅根据 expectedHash 和当前 snapshot 未变化把当前复制认定为本次拥有，随后恢复旧快照。

依据：该工具承诺 skips newer user copies，已有 mark 后 changeCount 所有权核对与原/owned 快照；字符串相等没有来源或变更代次证据，不能证明新复制仍属于本次动作。same-text 新复制是不同变更，应保留。

独立复现：只用唯一 `d-pi-validation-*` named pasteboard，实际固定 Swift helper。original→captureClipboard→beforeCopy→fixture owned（模拟本次 Copy）→再次 fixture owned（模拟后来的独立同文 Copy）→未 mark 的 restore(expected)。结果：`kind=restored`，changeCount `3→4`；预期 `preserved-new-content`。该探针没有写 general pasteboard；privateSnapshotResidual=0；finally releaseGlobally 且删除/tmp目录。

影响：harness 异常路径会用旧快照覆盖用户的后续复制；生产 app 代码未涉及。现有 `identicalNewCopyPreserved` 测试先 markOwnedCopy 再新复制，只覆盖已拥有快照分支，不能排除此分支。

修复与独立复核：b575bea8 删除 Swift 无 owned.json 的 expectedHash 自动恢复，JS restore() 不再传 expectedText。未确认所有权时保留当前 clipboard，允许 fixture 残留；已 mark 的完整 representation/changeCount 路径保留。新增 unmarkedCopyPreserved named-pasteboard 回归。

独立 green 探针直接编译最终 Swift，以相同 original→capture→before→本次fixture Copy→新的同文Copy→无owned restore 场景复核（甚至保留 request.expectedHash 以验证不会退回字符串推断）：返回 `kind=preserved-new-content`，changeCount `3→3`，allPassed=true；只写唯一 named pasteboard，finally releaseGlobally并删除/tmp目录。与上述真实 red `3→4` 对照，问题关闭。

## 已成立的修复与验证

- 原默认 spawnSync 缓冲风险有独立 root probe：2 MiB expected，仅 captured 1114112 bytes，status=null、ENOBUFS；已改为原快照不经 stdout，而在0700临时目录保存各 item/type/Data 的0600文件。仅状态/计数通过最多16KiB stdout。
- Swift 对 unreadable/promised data 失败、128 items/2048 types/16MiB accepted representations 预算、24MiB JSON snapshot序列化限额检查；capture失败禁止 Copy并删私有目录。
- restore 构造全部 NSPasteboardItems 后再动 board；已 mark 路径复核 changeCount 与全 representations，后续独立同文 Copy 的新 count会被保留。snapshot结束再次检查 count；恢复后按 items精确核对；JS finally 无论成功/异常删除私有目录，重复 restore 幂等返回 disposed。
- 初次读取 `/tmp/d-pi-clipboard-validation-2026-10-06.log`：8项 named-pasteboard 真测全 true，privateArtifactsRemaining=0，但未覆盖 no-owned 缺口。最终根 `clipboard-final.txt` 8项全部 true（含 unmarkedCopyPreserved），privateArtifactsRemaining=0；已结合源码与 reviewer独立 red/green 核实。
- 读取根 `check-final.txt`：完整检查含 tsc，末尾123测试文件通过/1 skipped；722 tests passed/2 skipped，architecture34/tooling70记录通过。此为根执行证据，本 reviewer不重复全矩阵。

## 证据与边界

- 初审的11条真实React/规则回归、2000属性样本及机械设计检查沿用；增量无产品正文实现变化。
- NSPasteboard 没有 compare-and-swap，最终 count核对和clear/write仍有无法完全消除的窄竞态；不能宣称绝对原子恢复。16MiB是可接受快照的数据预算，`data(forType:)`可能先物化原生表示，不能宣称读取阶段严格分配上限。
- 本 reviewer首次读取 `package-final.txt` 时已是 `M2 package timeout`：validateLongReading.mjs:152，failure path `/private/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-m2-package-df8apr`。已及时告知根。b575bea8 将 append fixture各行索引化、扩展tool loadMode设为essential；这两个仅改确定性harness输入，未改变产品。最终末读根重测 `package-retest.txt` 已再次 timeout：`long-reading.mjs:207:20`，等待剪贴板内容与expectedText精确相等；failure path `/private/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-m2-package-V8qi9X`。已即时告知根，根需核实实际剪贴板/expected差异；该失败不是Standards helper ownership修复未成立的证据，但包内验收仍未通过。本review不猜失败根因，包内结果/截图需后续记录。
- 未跑真实供应商或完整M2性能组合、未对用户认可作判断。tooling fix不改变初审对产品路径的无高价值发现结论。

## 实际Copy拒绝后的Main权限增量复核（15a1440）

固定 `git diff b575bea8...15a1440`：7files/153 additions/9 deletions；候选15a1440初末status均空。原copy-rejection-probe.txt已读取：actual clean67cb147 trusted鼠标Copy报 `NotAllowedError: Write permission denied`；初版 secureWindow 统一拒绝permission request确实阻断既有navigator.clipboard.writeText。此为真实产品路径缺陷，不是剪贴板保护helper缺陷。

- `src/app/main/lifecycle/window.ts:36-51` 新predicate精确匹配 WebContents对象、permission=clipboard-sanitized-write、isMainFrame与 requestingUrl===current.webContents.getURL；check/request共用同一predicate，不引入独立不一致规则。clipboard-read、deprecated-read、未知或其它permission均短路拒绝。请求输入来自Electron权限handler，不接受Renderer自造frame/URL数据。
- 对照锁定官方Electron44 electron.d.ts：permissionCheck允许null WebContents，worker/无document可能没有 requestingUrl；本predicate均拒绝。permissionRequest提供bool主frame与请求frame最近完整URL，不用请求方声明origin冒充业务身份。完整URL比较比仅file:// origin更窄，忽略额外_origin不会扩大许可范围。
- `loadWindowRenderer` 和 `application.createWindow`仍只加载built-in renderer或既有受限本地devserver；sandbox/contextIsolation/nodeIntegration政策未变；page-created窗口、will-navigate、webview等既有禁止仍在。App只拥有一个当前窗口，新窗口重建时替换session权限handler，旧WebContents不满足新current identity；不放行子frame或其它同session contents。
- 本许可满足App自有复制，不开放clipboard读取，不通过preload新增任意宿主能力，不改变模型/OMP能力。未新增持久许可或另一个permission owner。
- 新window.test直接抓实际secureWindow安装的两个handler，允许合法写入、拒绝读取/其它permission、其它/nullcontents、子frame、来源URL不匹配；类型从ElectronSession setter推导，符合当前官方API。Main启动mock补了setPermissionCheckHandler。独立执行 `node scripts/testing/test.mjs vitest src/app/main/lifecycle/window.test.ts src/app/main/index.test.ts`：2files/9tests passed，14:45:55本机日志，未写general clipboard。自动测试证明predicate行为，尚不替代修复包真实ElectronCopy能力。
- long-reading harness新增unhandledrejection观测，以明确真实Copy拒绝，而非重复等待超时；作用域位于隔离包测试，不进入产品。模型正文/读取路径未调整。

截至首次读取check-copy-final.txt，完整check实际失败：window-security.integration.test.ts的旧Electron mock缺setPermissionCheckHandler，22条报TypeError，701pass/22fail。已立即告知根补已有fixture；API在真实Electron44存在，此失败不证明Main修复不可运行。后续固定head若仅补该fixture，需复核对应差异/重新运行安全集成测试；完整gate与新clean包Copy证据仍由根核实，不把此前67cb147通过外推到15a1440。

### 安全集成fixture补齐的最终复核（c531558）

末读源已由根切换c531558；已刷新 `git diff 15a1440...c531558`：仅 `tests/integration/window-security.integration.test.ts` 补5行/删1行，mock提供getURL和真实Electron已有的setPermissionCheckHandler；不改变产品permission policy或削弱原测试断言。最终固定head与初末status再次核实，clean。

独立在最终checkout执行window+Main+window-security.integration三文件：31 tests passed（2026-10-06 14:47:27），原22条mock API缺失失败消除；集成覆盖原本地加载、受限devURL/redirect、窗口关闭/加载失败、sandbox/contextIsolation和窗口/导航/webview拒绝。runner有重复Main实例化触发的MaxListenersExceededWarning（11 process.exit listeners），未据此归因本次权限产品变更或声明无警告；不扩大本次审查范围。

完整check-copy-final需根在fixture修正后重新完成，新clean产品包的trustedCopy闭环须根实际验证。Standards源码审查与31条自动行为证据已足以支持这次局部边界结论；不在review中写general clipboard，不把它们当真实ElectronCopy/视觉或用户认可证据。

## 最终validation准确性复核（84055cf）

固定 `git diff c531558...84055cf`：仅 `validation/m2/long-reading.mjs`，73 additions/12 deletions。`git diff --quiet c531558...84055cf -- src runtime package.json` exit0。最终checkout初末status clean；reviewer没有再跑full check、Swift或general clipboard写入。`node --check validation/m2/long-reading.mjs` 通过。

- CDP Enter keyDown补text/unmodifiedText=CR、nativeVirtualKeyCode=36，keyUp不注入text；与固定macOS候选一致。前后都等待实际段index切换，不以focus/dispatch调用本身证明按钮激活。root前次实际run走到10MiB工具断言，keyboard-retest.txt已读。
- marker长度由实际Buffer.byteLength派生：首尾各21bytes，filler长度为10485760减去两marker。独立Node精确长度探针通过；不再把20/22硬编码为边界。正式构建/Host/SDK预算未变化。
- 从本Thread的SQLite native_session.session_file定位当前唯一m2_long_output记录；meta要求totalBytes=10MiB、direction=middle、fixtureBytes=10MiB、artifactId纯数字；按原生session目录+sessionbasename+artifactId定位artifact，严格检查实际文件length及首尾marker。providertool文本必须严格等于nativeTool text parts的原文拼接，而非要求provider收到原始10MiB。
- 读取已有隔离 `/private/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-m2-package-tgZO00` 实际native toolResult与对应0.m2_long_output.log：artifact=10485760bytes，首尾21bytes完全匹配，meta.totalBytes=10485760/direction=middle/artifactId=0；原生传入会话文本41077bytes，含 `elided. Read artifact://`。artifact SHA256=`d7338b6e19f80b4ddad7f6e013149b41d9c58198fca52233e12371e9d4a89cb2`。该样本前次provider完整10MiB断言实际失败（41077 vs10485760），不能改称通过；它是校正验证假设的证据。
- GUI遍历实际工具段：每次仅1个text区域/<=8192units，所有段拼接严格===nativeText；原生中间省略与artifact提示因此必须完整包含。Host自身未截断这一约40KiB文本，所以truncated=false符合实际链路。末页截图用于展示原生gap，不把看不到首屏tail误当Host丢失正文。
- 最终check-admission.txt已读取：124files passed/1skipped，723tests passed/2skipped；完整check由根执行并报告architecture34/tooling70通过。源app与c531558一致，不用早期22条mock失败继续作为当前blocker。

新validation的claims在源码层面准确，Standards无高价值新增问题。**证据限制**：此native样本验证SDK实际产生10MiB工具结果并保存完整artifact；Host/Renderer实际拿到41077bytes的原生受限表示，不能声称此路径实测Host收到完整10MiB、实测Host超预算截断或完成全集M2性能组合。最终84055cf整段machine执行尚未由本reviewer读到完成结果；新的provider===nativeText与GUI拼接断言是经过审查的验证能力，实际通过须以root随后完成的同源包运行记录/截图为准。既有失败证据保留，不事后改写成成功。

## CDP deadline与实际段提交增量复核（17da39f）

固定 `git diff 84055cf...17da39f`：validation/m2/long-reading.mjs与package.mjs两文件，31 additions/6 deletions；product c531558...17da39f 的src/runtime/package.json diff仍为空。当前reviewcheckout初末clean；未重跑整矩阵/Swift或写general clipboard。两份mjs `node --check`均通过。

已读root hidden-frame-probe.json：`no-frame-in-1000ms`、visibility=hidden、page=1、stalledMethod为Runtime.evaluate awaitPromise requestAnimationFrame；clipboardPrivateArtifacts=0，root只关闭隔离app并终止自己的stalledharness。此证明旧动画帧等待停滞的具体状态；不把旧run当作成功或归因产品分段失败。

- reading三个循环原awaitRAF改为等待实际 `data-reading-segment`：前进使用刚读取的index+1，回到首段循环使用segments.length-2-attempt；初始keyboard返回index0已有断言，每次读取仅一段并严格拼接，progress等待不会把click dispatch本身冒充实际React提交。最多100次导航、wait既有期限与CDP期限仍限制异常等待，不靠窗口可见性推动取样。
- package.mjs每次call登记独立30sec timer和pending ID。CDP response删除pending并调用包装resolve/reject以clear timer；onclose拒绝每个pending，包装reject逐个clear timer并清Map；timeout删除pending并reject，迟到response task不存在不会结算其它call。没有业务重试、发送重放或产品生命周期变化。
- 独立stdin探针提取固定实际connect()/call()函数，替换仅WebSocket/fetch/time边界，验证真实响应路径：success/error计时器清理；stalled timeout rejection及pending移除；late response忽略；close拒绝两并行call并清全部timers/Map，全通过。探针未落新仓库测试，未操作CDP页面或clipboard。此证据验证新增等待资源的结算，未外推网络/整个package矩阵结果。

这次增量无高价值新发现。最终同源包machine执行尚需root package-complete.txt完成结果/identity/截图/ZIP补齐；此前840/176/keyboard等失败或停滞保留为历史证据。只在最终完整运行成功后才可宣称对应包内场景通过；本报告不提前宣称。

### 17da39f实际run的后续结果（不覆盖新修复head）

末读package-complete.txt已实际失败：`long-reading.mjs:442 assert.ok(toolReader)`，actual=null，failure目录HtLEeD。reviewer已即时告知根，并只读检查failure截图和projection源码：message_end的tool角色采用通用conversation.toolResult标签，先前toolExecution的内部toolName不保证继续出现在第一段DOM。该失败与新CDP deadline/dataset进度结算无关；选择器要求article同时包含内部m2_long_output名称是harness假设错误，不能因此报告产品工具正文缺失。root随后核实DOM已有fixture marker与tools details，并告知在2183925改为唯一fixture marker+details；该新head尚待最终固定输入/运行完成后独立刷新，本17da39f记录不提前把它声称通过。

## 最终一行选择器与成功machine证据复核（2183925）

最终固定checkout HEAD=`218392527b16d4a14936cc95b2c7da3201f6de5f`，初末status为空。`git diff 17da39f...2183925`仅一行：工具article要求details并包含唯一 `M2_TEN_MIB_TOOL_START` fixture marker，移除不属于最终UI承诺的内部工具名文本匹配。原生记录查找、toolRequest/nativeText equality、完整artifact与所有GUI段拼接断言均保持。product c531558...2183925 的src/runtime/package.json diff为空；产品source=`c531558406e3c3b7da4544be8df55fe92d40530f`。

已读取root package-verified.txt成功输出与 `.scratch/m2-first-release/evidence/long-reading-package-result.json`：21checks完成；build version0.1.0-m2.16、commit c531558、dirty=false、id c5315584-f375cd21。该JSON位于root交付工作树，尚未出现在固定2183925的reviewcheckout中，不将后续文档证据收录冒充产品source。

独立只读文件交叉核验（不重复matrix/Swift/general写）：

- 实际交付app.asar流式SHA256=`69b24c046a884c3d2b9aec7efa678cfa0209dd437c710a16f66aff8b2cfb37c8`，严格等于result.sourceAsarSha256。
- 长回复复制40784 UTF-16units，7段长度求和精确40784、每段<=8192；clipboardRestoration=restored。
- 从最终隔离XlBDIl原生会话实际读取m2_long_output记录及artifact：original=10485760bytes，SHA256=`d7338b6e19f80b4ddad7f6e013149b41d9c58198fca52233e12371e9d4a89cb2`；原生text=41077bytes/41073 UTF-16units，严格匹配JSON；6段长度之和41073、每段<=8192。result的provider===nativeText与GUI全文拼接checks已完成。仍不把10MiB原生artifact说成Host/Renderer收到10MiB正文。
- 最终隔离root没有clipboard-private-*目录，privateSnapshotsRemaining=0；原始clipboard helper的独立named-pasteboard red/green/多格式记录沿用。

已独立查看三张根证据图片：深色normal与浅色compact阅读图清楚显示原文分段提示、第1/7段、上下段控件和正文/滚动区域；sourcebuild标识c5315584-f375cd21与JSON一致，所见布局无高价值新缺陷。`m2-long-tool-native-gap.png`当时视口只呈现顶部原生输入与Composer，工具行及artifact/elision提示位于视口外；因此这张图不能独立证明“可见native gap”。已告知root可补定位截图，或保留准确限制。机器实际遍历6段/拼接原生text的证据不受该取景限制影响。

最终Standards结论：授权范围内产品与harness增量已覆盖，无未关闭高价值问题；已识别的clipboard ownership P2修复有独立真red/green，实际Copy权限修复有真实包21checks闭环；已知历史失败/停滞保留并与最终成功分开。真实供应商、系统级IME输入源、完整M2长期性能组合、用户认可和release未由本候选21项检查覆盖。ZIP/source完整交付身份由root收尾核实。


## 最终取景与同源交付证据复核（3fdb25f）

最终固定checkout HEAD=`3fdb25f5c96f8b126d9b75fcbb1eaa7e8198dd6e`，本轮初末`git status --short`均为空。`git diff 2183925...3fdb25f`仅`validation/m2/long-reading.mjs`新增6行：在全部工具段拼接严格等于nativeText之后切专注阅读，将实际工具正文滚到视口中，短暂等待250ms后截图，再恢复控件。没有删除或放松machine断言；`git diff --quiet c531558...3fdb25f -- src runtime package.json` exit0，产品source仍为`c531558406e3c3b7da4544be8df55fe92d40530f`。等待受既有CDP30sec deadline约束，不依赖隐藏窗口动画帧。无新高价值Standards问题。

最新root归档JSON及原始log指向隔离运行`d-pi-m2-package-9twqGK`，两者21项checks一致，运行成功；build0.1.0-m2.16/source c531558/dirty=false/id c5315584-f375cd21。复制40784 UTF-16units，7段精确求和；clipboardRestoration=restored，实际隔离root的private snapshot目录残留0。原生artifact10485760bytes、SHA256 d7338b6e19f80b4ddad7f6e013149b41d9c58198fca52233e12371e9d4a89cb2；实际获得41077bytes/41073 UTF-16units，6段精确求和，provider/nativeText与GUI全文拼接assertions完成。以上替换后的最新证据不是旧失败或XlBDIl结果的改写。

独立查看最新`m2-long-tool-native-gap.png`：工具结果details展开，第6/6段、禁用下一段、原生末尾marker和`[Showing head and tail bytes of 1 line; 10.0MB elided. Read artifact://0 for full output]`提示均清晰可见，build标识一致。深色normal与浅色compact阅读图亦已查看，分段原文提示、第1/7段及控件/正文可见，无高价值布局问题。上节2183925时旧图视口不足是历史事实，**已由本轮实际取景补齐，现不构成当前证据限制**。截图证明原生省略提示保留与可见，不证明本候选具备artifact链接打开功能或Renderer收到完整10MiB正文。

已读root最新`long-reading-candidate-integrity.json`：sourceCommit c531558、validationCommit3fdb25f；ZIP430094907bytes、SHA256 c9d4adbfc76ca1f8c7a0af8719c861231a5e8d43e783875f459cfeeb06d797a7；root记录unzip-t exit0，源app.asar与ZIP内app.asar均为69b24c046a884c3d2b9aec7efa678cfa0209dd437c710a16f66aff8b2cfb37c8，与实际machine sourceAsarSha256一致。本review已独立流式核验实际source app.asar，ZIP CRC与ZIP流式hash为root执行证据，本轮不重复矩阵或大包扫描。候选未签名/未公证；这些完整性记录不构成发布或用户认可。

最终结论：无未关闭的高价值Standards问题；clipboard ownership P2与实际Copy权限缺陷均有修复和对应证据，最新21项实际包内场景与补充视觉证据成立。用户认可保持pending；真实供应商、系统IME输入源、完整M2长期/全集性能组合未验。不编辑源、管理状态、版本或commit；仅更新指定ignored评审报告。
