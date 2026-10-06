# 失败提醒可读性 P2：独立复核

- 独立 worktree：`/Users/louistation/.codex/worktrees/m2-attention-review-spec/d-pi`
- 原候选/source：`672afdc675f835ecde2a000088020cf75da2b9d3`
- 固定修复 head：`d272bd6bfb9a4a7f4d54e0a20b69940c514ede82`
- 按明确授权在干净 review checkout `git checkout --detach d272bd6`；源码审查输入为 `git diff 672afdc675f835ecde2a000088020cf75da2b9d3..d272bd6bfb9a4a7f4d54e0a20b69940c514ede82`。检查结束工作区干净。

## 结论

该 P2 的源码修复与回归覆盖成立，工程层关闭；新增可达高价值问题 **0**。新的实际 macOS 候选裁切断言/截图须由主 Agent 执行，不能把本次静态复核或 happy-dom 红绿外推为真实布局已经通过。

## 独立核对

1. ThreadWorkbench 只在 target.kind=failed、readingView=submissions，且当前工作区实际存在匹配 trace 的收据时设置 readingFocus=true。未匹配的 failed 与 needs-answer 都为 false，保留 setup 中的 runtime fallback/真实交互。因此没有把所有 failed 强制切换为专注而隐藏必要状态的副作用。
2. 复用既有专注模式：setup 与 Composer 使用 hidden，配置由既有 data-reading-focus CSS 隐藏，编辑器及阅读面板继续挂载；没有改执行生命周期、业务状态或新增布局系统。设置 readingFocus 后继续在 RAF 做 locateAttention，details 展开、滚动和聚焦逻辑保持；effect 随 target/readingView 变化释放旧 RAF。
3. 新正式 React/Router 回归使用 SubmissionReceiptSchema 的匹配实际收据，确认 failed+submissions 的专注标记、details open、article 焦点、原 Tiptap DOM 与 draft text 保留；用户 Restore controls 后 Composer 解除 hidden；新的 missing trace 与 needs-answer 恢复 false。同文件既有 navigation/阅读滚动连续性与专注模式测试保持。
4. actual harness 的 failureDetail 现在找到真实失败状态 p，从窗口边界开始，逐祖先按 overflowX/overflowY 的 auto/scroll/hidden/clip 取有效矩形交集，要求状态段落完整落在交集内；同时继续要求 details open、article focus、真实失败文本。这样前一候选中“article 在窗口内，但被狭窄 reading-pane 裁掉状态行”的场景不会再通过。断言只要求短状态段落可读，没有不合理要求长正文 article 一次全部可见。

## 证据与限制

已独立阅读完整 3 文件 delta 与相关 hidden/专注布局实现，再核对 `/tmp/d-pi-attention-reading-red.txt`：新增专注回归实际收到 false、预期 true；`/tmp/d-pi-attention-reading-green.txt` 留存 2 文件 10 tests 通过。日志为主 Agent 执行证据，本 reviewer 未运行这些 tests。

本 reviewer 未 install/build、启动 App、复制候选、修改源码或管理状态。尚未看见 d272bd6 新包的实际裁切交集结果或修复后截图；请沿本轮相同失败提醒路径和代表性 viewport/density 做定向候选验证，保留 native 系统通知尚未实测的独立限制。工程修复不构成 M2 父票/用户认可完成。
