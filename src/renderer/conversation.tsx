import { code } from "@streamdown/code";
import { useState, useSyncExternalStore } from "react";
import { Streamdown } from "streamdown";
import { WebsiteIcon } from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import type { ConversationModel } from "../features/conversation/model";
import type {
  HistoryBridge,
  HistoryCursor,
  HistoryPage,
} from "../features/history/contracts";
import type { SubmissionModel } from "../features/submission/model";
import { urlBrand } from "./url-display";

// Keep remote resources inert. Native text can be copied; only an explicit app action may open a URL.
function Markdown({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  return (
    <Streamdown
      plugins={{ code }}
      controls={false}
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      components={{
        img: ({ alt }) => <span>[图片：{alt ?? "未加载"}]</span>,
        a: ({ children, href }) => (
          <span title={href}>
            <WebsiteIcon brand={urlBrand(href ?? "")} />
            {children} {href && <code>{href}</code>}
          </span>
        ),
      }}
    >
      {text}
    </Streamdown>
  );
}
export function Conversation({ model }: { model: ConversationModel }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <section className="conversation" aria-label="会话阅读">
      <h2>会话</h2>
      {!state?.items.length && (
        <p className="muted">发送后，OMP 的回复和工具结果会显示在这里。</p>
      )}
      {state?.gap && (
        <p role="status">当前显示有缺口，可在下方读取原生记录核对。</p>
      )}
      {state?.items.map((item) => (
        <article className="message" key={item.id}>
          <div className="message-heading">
            <strong>{item.label}</strong>
            <span>
              {item.state === "streaming"
                ? "进行中"
                : item.state === "failed"
                  ? "失败"
                  : ""}
            </span>
            <Button
              variant="ghost"
              onClick={() => void navigator.clipboard.writeText(item.text)}
            >
              复制
            </Button>
          </div>
          {item.role === "tool" ? (
            <details>
              <summary>查看工具输出</summary>
              <pre>{item.text || "等待结果…"}</pre>
            </details>
          ) : (
            <Markdown text={item.text} streaming={item.state === "streaming"} />
          )}
        </article>
      ))}
    </section>
  );
}
export function Submissions({ model }: { model: SubmissionModel }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <section className="submission-records" aria-label="提交记录">
      {state.message && (
        <p role="alert" className="failure">
          {state.message}
        </p>
      )}
      <details>
        <summary>
          本地提交原文（{state.receipts.length}，最多显示最近 100 条）
        </summary>
        <p className="muted">
          调用回执不代表业务已接受或任务已完成。结果未知时请先核对，不要重复发送。
        </p>
        <Button variant="ghost" onClick={() => void model.refresh()}>
          核对提交状态
        </Button>
        {state.receipts.map((receipt) => (
          <article className="message" key={receipt.submissionId}>
            <p>
              {receipt.state === "rejected"
                ? "未派发到 OMP，原文保留；可处理阻塞后重新发送"
                : receipt.state === "acknowledged"
                  ? "已收到调用回执"
                  : receipt.state === "prepared"
                    ? "已保存，未派发"
                    : receipt.state === "dispatching"
                      ? "已派发，等待回执"
                      : "结果未知"}
              {receipt.outcome === "failed"
                ? " · 原生返回失败"
                : receipt.outcome === "unknown"
                  ? " · 后续结果未知"
                  : ""}
            </p>
            <pre>{receipt.text}</pre>
            {receipt.retryOf && (
              <p className="trace">显式再次发送，来源：{receipt.retryOf}</p>
            )}
            {receipt.state === "prepared" && (
              <>
                <p className="muted">
                  此次输入尚未派发。继续发送使用上方已保存的原文，并重新核验执行授权；编辑区中后来的内容保持不变。
                </p>
                <Button
                  disabled={state.sending}
                  onClick={() =>
                    void model.continuePrepared(receipt.submissionId)
                  }
                >
                  继续发送
                </Button>
              </>
            )}
            {(receipt.state === "unknown" ||
              receipt.outcome === "unknown" ||
              receipt.outcome === "failed") && (
              <details>
                <summary>作为新提交再次发送</summary>
                <p role="alert">
                  原提交可能已经执行，再次发送可能产生重复操作。请先核对原生历史；新草稿保持不变。恢复只读或队列暂停时不会派发。
                </p>
                <Button
                  disabled={state.sending}
                  onClick={() => void model.resend(receipt.submissionId)}
                >
                  确认可能重复，重新发送
                </Button>
              </details>
            )}
            <Button
              variant="ghost"
              onClick={() => void navigator.clipboard.writeText(receipt.text)}
            >
              复制提交原文
            </Button>
          </article>
        ))}
      </details>
    </section>
  );
}
export function History({
  bridge,
  threadId,
}: {
  bridge: HistoryBridge;
  threadId: string;
}) {
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function read(cursor: HistoryCursor | null) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      setPage(await bridge.read(threadId, cursor));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="history" aria-label="只读原生历史">
      <details>
        <summary>只读原生历史</summary>
        <p className="muted">
          按文件追加顺序分页显示文字，保留记录分支标识；不等于当前模型上下文。读取不会启动
          OMP。
        </p>
        <Button variant="ghost" disabled={busy} onClick={() => void read(null)}>
          读取原生记录
        </Button>
        {error && <p role="alert">读取连接失败，可重新读取。</p>}
        {page?.kind === "unavailable" && (
          <p role="status">
            记录暂不可读：{page.reason}。不会用空列表代替故障。
          </p>
        )}
        {page?.kind === "page" && (
          <>
            {page.incompleteTail && <p>文件末尾尚未写完，仅显示完整记录。</p>}
            {page.omitted > 0 && (
              <p>本页另有 {page.omitted} 条非消息记录，未作为正文显示。</p>
            )}
            {page.entries.map((entry) => (
              <article className="message" key={entry.id}>
                <strong>{entry.role}</strong>
                <p className="trace">
                  {entry.id} ← {entry.parentId ?? "根"}
                </p>
                <Markdown text={entry.text} />
              </article>
            ))}
            {page.next && (
              <Button disabled={busy} onClick={() => void read(page.next)}>
                下一页
              </Button>
            )}
            {!page.entries.length && !page.next && (
              <p>没有可显示的完整文字消息。</p>
            )}
          </>
        )}
      </details>
    </section>
  );
}
