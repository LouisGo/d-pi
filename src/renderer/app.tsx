import { useSyncExternalStore } from "react";
import { match } from "ts-pattern";
import {
  DarkThemeIcon,
  FolderIcon,
  LightThemeIcon,
} from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import { BUILD_INFO } from "../shared/build-info";
import { Composer } from "./composer";
import { Conversation, History, Submissions } from "./conversation";
import type { AppModel } from "./model";
import { RuntimePanel } from "./runtime-panel";
export function App({ model }: { model: AppModel }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return match(state)
    .with({ kind: "loading" }, () => (
      <main className="startup" role="status">
        正在恢复本地草稿…
      </main>
    ))
    .with({ kind: "failed" }, ({ error }) => (
      <main className="startup failure">
        <h1>本地数据暂不可用</h1>
        <p>{error.safeMessage}</p>
        <p className="trace">追踪：{error.traceId}</p>
        <p className="trace">构建 {BUILD_INFO.id}</p>
        <Button onClick={() => void model.start()}>重新检查</Button>
      </main>
    ))
    .with(
      { kind: "ready" },
      ({ draft, preferences, directoryAvailable, notice, busy }) => (
        <div className="app-shell">
          <aside className="sidebar">
            <div className="brand">
              d-pi <span>S3</span>
            </div>
            <div className="sidebar-label">项目</div>
            {draft ? (
              <div className="project-item">
                <FolderIcon />
                <span>{draft.directory.split("/").filter(Boolean).at(-1)}</span>
              </div>
            ) : (
              <p className="muted">尚未选择项目</p>
            )}
            <div className="sidebar-bottom">
              <span className="muted">本地草稿</span>
              <span className="muted">项目执行需授权</span>
              <span className="trace muted" title={BUILD_INFO.commit}>
                {BUILD_INFO.version} · {BUILD_INFO.id}
              </span>
            </div>
          </aside>
          <main className="workspace">
            <header className="toolbar">
              <span className="muted">{draft ? "新的 Thread" : "开始"}</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  disabled={busy}
                  aria-label={
                    preferences.theme === "light"
                      ? "切换为深色主题"
                      : "切换为浅色主题"
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void model.preference("theme")}
                >
                  {preferences.theme === "light" ? (
                    <DarkThemeIcon />
                  ) : (
                    <LightThemeIcon />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void model.preference("density")}
                >
                  {preferences.density === "normal" ? "紧凑密度" : "正常密度"}
                </Button>
              </div>
            </header>
            {notice && (
              <div role="alert" className="notice failure">
                {notice.safeMessage}
                <span className="trace"> {notice.traceId}</span>
              </div>
            )}
            <div className="work-content">
              {draft && model.controller ? (
                <>
                  <div className="draft-intro">
                    <h1>从一个想法开始</h1>
                    <p className="muted">
                      文字会保存到此设备，下次打开可继续编辑。
                    </p>
                  </div>
                  <div className="directory-info">
                    <FolderIcon />
                    <span>{draft.directory}</span>
                    <span className="muted">项目执行需授权</span>
                  </div>
                  {!directoryAvailable && (
                    <p className="failure" role="alert">
                      项目目录已失效。草稿仍可编辑；应用不会自动换到其他目录。
                    </p>
                  )}
                  {model.runtime && (
                    <RuntimePanel
                      model={model.runtime}
                      onFollowUp={(text) =>
                        void model.submission?.sendText(text, "followUp")
                      }
                    />
                  )}
                  {model.runtime?.reading && (
                    <Conversation model={model.runtime.reading} />
                  )}
                  <Composer
                    draft={draft}
                    controller={model.controller}
                    model={model}
                  />
                  {model.submission && <Submissions model={model.submission} />}
                  {model.history && (
                    <History bridge={model.history} threadId={draft.threadId} />
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <h1>在项目里，写下第一步</h1>
                  <p className="muted">选择目录，创建一份可恢复的文字草稿。</p>
                  <Button disabled={busy} onClick={() => void model.choose()}>
                    <FolderIcon />
                    选择项目并创建草稿
                  </Button>
                  <p className="empty-note">目录默认仅浏览，不运行项目代码。</p>
                </div>
              )}
            </div>
          </main>
        </div>
      ),
    )
    .exhaustive();
}
