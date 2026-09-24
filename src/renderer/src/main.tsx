import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { create } from 'zustand'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FolderOpen, Send, CornerUpRight, Square, RotateCcw, Copy, ChevronDown, ChevronRight, Settings2, LogOut } from 'lucide-react'
import type { ClientCommand, HostEvent, Interaction, SessionView } from '../../shared/protocol'
import { textOf } from '../../shared/protocol'
import { Button } from './components/app-button'
import './style.css'

declare global { interface Window { session: {
  subscribe: (listener: (event: HostEvent) => void) => () => void
  send: (command: ClientCommand) => void
  chooseProject: () => Promise<string | undefined>
  chooseExecutable: () => Promise<string | undefined>
  chooseConfig: () => Promise<string | undefined>
  quit: () => Promise<void>
} } }

const empty: SessionView = { generation: '', seq: 0, status: 'disconnected', queuedCount: 0, messages: [], tools: [], interactions: [], submissions: [] }
const useSession = create<{ view: SessionView; apply: (event: HostEvent) => void }>(set => ({
  view: empty,
  apply: event => set(state => {
    if (event.type === 'snapshot') return { view: event.view }
    if (event.type !== 'delta') return state
    const previous = state.view
    if (event.generation !== previous.generation || event.seq !== previous.seq + 1) {
      window.session.send({ type: 'snapshot' })
      return state
    }
    const view = { ...previous, seq: event.seq }
    const change = event.change
    if (change.kind === 'status') Object.assign(view, change.value)
    if (change.kind === 'message') view.messages = [...view.messages.filter(x => x.id !== change.value.id), change.value].sort((a, b) => a.id - b.id)
    if (change.kind === 'tool') view.tools = [...view.tools.filter(x => x.id !== change.value.id), change.value]
    if (change.kind === 'submission') view.submissions = [...view.submissions.filter(x => x.id !== change.value.id), change.value]
    if (change.kind === 'interaction') view.interactions = 'removed' in change.value ? view.interactions.filter(x => x.id !== change.value.id) : [...view.interactions.filter(x => x.id !== change.value.id), change.value]
    return { view }
  })
}))

function InteractionCard({ item, generation }: { item: Interaction; generation: string }) {
  const [value, setValue] = React.useState(item.prefill || '')
  const [busy, setBusy] = React.useState(false)
  const answer = (data: { value?: string; confirmed?: boolean; cancelled?: boolean }) => {
    if (busy) return
    setBusy(true)
    window.session.send({ type: 'answer', generation, id: item.id, ...data })
  }
  return <section className="interaction" aria-label="待回答交互">
    <div className="eyebrow">OMP 需要你的回答</div>
    <h3>{item.title || item.method}</h3>
    {item.message && <p>{item.message}</p>}
    {item.method === 'select' && <div className="options">{item.options?.map(option => <Button key={option} disabled={busy} onClick={() => answer({ value: option })}>{option}</Button>)}</div>}
    {(item.method === 'input' || item.method === 'editor') && <>
      {item.method === 'editor' ? <textarea value={value} placeholder={item.placeholder} onChange={e => setValue(e.target.value)} rows={5} /> : <input value={value} placeholder={item.placeholder} onChange={e => setValue(e.target.value)} />}
      <Button variant="primary" disabled={busy} onClick={() => answer({ value })}>提交回答</Button>
    </>}
    {item.method === 'confirm' && <div className="options"><Button variant="primary" disabled={busy} onClick={() => answer({ confirmed: true })}>确认</Button><Button disabled={busy} onClick={() => answer({ confirmed: false })}>拒绝</Button></div>}
    <Button variant="ghost" disabled={busy} onClick={() => answer({ cancelled: true })}>取消交互</Button>
  </section>
}

function ToolCard({ tool }: { tool: SessionView['tools'][number] }) {
  const [open, setOpen] = React.useState(false)
  const detail = JSON.stringify({ arguments: tool.arguments, result: tool.result }, null, 2)
  return <article className="tool-card">
    <button className="tool-head" onClick={() => setOpen(!open)} aria-expanded={open}>
      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      <span>{tool.name}</span><span className={`tool-status ${tool.status}`}>{tool.status === 'running' ? '运行中' : tool.status === 'error' ? '失败' : '已结束'}</span>
    </button>
    {open && <div className="tool-body"><Button variant="ghost" onClick={() => navigator.clipboard.writeText(detail)}><Copy size={14} />复制详情</Button><pre>{detail}</pre></div>}
  </article>
}

function Conversation({ view }: { view: SessionView }) {
  const scroll = React.useRef<HTMLDivElement>(null)
  const nearBottom = React.useRef(true)
  const [showLatest, setShowLatest] = React.useState(false)
  React.useLayoutEffect(() => {
    if (nearBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [view.messages.length, view.messages.at(-1)?.content])
  return <div className="conversation-wrap">
    <div className="conversation" ref={scroll} onScroll={e => {
      const el = e.currentTarget
      nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90
      setShowLatest(!nearBottom.current)
    }}>
      {view.messages.length === 0 && <div className="empty"><div className="empty-mark">⌘</div><h2>从一个具体问题开始</h2><p>OMP 会使用当前项目与已有配置。工具执行和需要你决定的步骤会留在这里。</p></div>}
      {view.messages.map(message => {
        const content = textOf(message.content)
        const calls = Array.isArray(message.content) ? message.content.filter((x: any) => x?.type === 'toolCall') : []
        if (message.role === 'toolResult' && view.tools.some(x => x.id === message.toolCallId)) return null
        if (!content && !calls.length) return null
        return <article className={`message ${message.role}`} key={message.id}>
          <div className="message-label">{message.role === 'user' ? '你' : message.role === 'assistant' ? 'OMP' : message.role === 'toolResult' ? '工具结果' : message.role}</div>
          {content && <div className={`message-text ${message.complete ? 'markdown' : ''}`}>
            {message.complete ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children }) => <span>{children}</span>, img: ({ alt }) => <span>[图片: {alt}]</span> }}>{content}</ReactMarkdown> : content}
          </div>}
          {calls.map((call: any) => <React.Fragment key={call.id || call.name}><div className="call-line">调用 {call.name}</div>{view.tools.find(tool => tool.id === call.id) && <ToolCard tool={view.tools.find(tool => tool.id === call.id)!}/>}</React.Fragment>)}
        </article>
      })}
      {view.tools.filter(tool => !view.messages.some(message => Array.isArray(message.content) && message.content.some((part: any) => part?.type === 'toolCall' && part.id === tool.id))).map(tool => <ToolCard key={tool.id} tool={tool} />)}
      {view.submissions.filter(x => x.status === 'accepted' || x.status === 'uncertain' || x.status === 'rejected').map(x => <div className={`submission ${x.status}`} key={x.id}><strong>{x.intent === 'steer' ? '干预' : x.intent === 'followUp' ? '排队追加' : '提交'}</strong> · {x.status === 'accepted' ? '已接受，等待 OMP 处理' : x.status === 'uncertain' ? '结果不明，请检查会话后决定是否重发' : `被拒绝：${x.error}`}<div>{x.text}</div></div>)}
    </div>
    {showLatest && <Button className="latest" onClick={() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight }}>回到最新 ↓</Button>}
  </div>
}

function App() {
  const view = useSession(s => s.view)
  const apply = useSession(s => s.apply)
  const [draft, setDraft] = React.useState(() => localStorage.getItem('draft') || '')
  const [executable, setExecutable] = React.useState('')
  const [configDir, setConfigDir] = React.useState('')
  const [project, setProject] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [localError, setLocalError] = React.useState('')
  const composing = React.useRef(false)
  const pending = React.useRef(new Map<string, string>())
  React.useEffect(() => window.session.subscribe(event => {
    apply(event)
    if (event.type === 'commandResult') {
      const text = pending.current.get(event.requestId)
      if (event.ok && text && draft === text) setDraft('')
      if (!event.ok) setLocalError(event.error || '提交失败')
      pending.current.delete(event.requestId)
      setSending(false)
    }
  }), [apply, draft])
  React.useEffect(() => { localStorage.setItem('draft', draft) }, [draft])
  React.useEffect(() => { if (view.project) setProject(view.project); if (view.executable) setExecutable(view.executable); if (view.configDir) setConfigDir(view.configDir) }, [view.project, view.executable, view.configDir])
  const submit = (intent: 'normal' | 'followUp' | 'steer') => {
    const text = draft.trim()
    if (!text || sending) return
    const requestId = crypto.randomUUID()
    pending.current.set(requestId, text)
    setSending(true); setLocalError('')
    window.session.send({ type: 'prompt', requestId, message: text, intent })
  }
  const active = view.status === 'running' || view.status === 'stopping'
  const connected = view.status === 'running' || view.status === 'idle' || view.status === 'stopping'
  const selectProject = async () => { const result = await window.session.chooseProject(); if (result) setProject(result) }
  return <div className="app">
    <header className="header"><div className="brand"><span className="brand-icon">π</span><div><strong>OMP Desktop</strong><small>单会话工作区</small></div></div><div className="header-actions"><span className={`connection ${view.status}`}>{view.interactions.length ? '等待回答' : view.status === 'running' ? '执行中' : view.status === 'idle' ? '已连接' : view.status === 'connecting' ? '连接中' : view.status === 'stopping' ? '停止中' : view.status === 'interrupted' ? '连接中断' : '未连接'}</span><Button variant="ghost" title="退出应用" onClick={() => window.session.quit()}><LogOut size={17}/></Button></div></header>
    <div className="workspace-bar"><FolderOpen size={17}/><span className="project-path">{view.project || '尚未选择项目'}</span>{view.notice && <span className="project-path" title={view.notice}>{view.notice}</span>}{view.model && <span className="model">{view.model}</span>}{view.queuedCount > 0 && <span className="queue">排队 {view.queuedCount}</span>}</div>
    {!connected && <section className="setup"><div className="eyebrow">工作区连接</div><h1>{view.status === 'interrupted' ? '连接已中断' : '连接到现有 OMP'}</h1><p>选择本地项目，继续使用你已经安装和配置的 OMP。</p><div className="setup-row"><input readOnly value={project} placeholder="选择项目目录"/><Button onClick={selectProject}>选择目录</Button></div><details><summary><Settings2 size={15}/> OMP 路径与配置目录</summary><div className="setup-row"><input readOnly value={executable} placeholder="自动发现 OMP，可指定可执行文件"/><Button onClick={async () => { const x = await window.session.chooseExecutable(); if (x) setExecutable(x) }}>选择 OMP</Button></div><div className="setup-row"><input readOnly value={configDir} placeholder="使用 OMP 原配置，可指定配置目录"/><Button onClick={async () => { const x = await window.session.chooseConfig(); if (x) setConfigDir(x) }}>选择配置</Button></div></details><div className="setup-actions"><Button variant="primary" disabled={!project || view.status === 'connecting'} onClick={() => window.session.send({ type: 'start', project, executable: executable || undefined, configDir: configDir || undefined })}>连接项目</Button>{view.status === 'interrupted' && <Button onClick={() => window.session.send({ type: 'resume' })}><RotateCcw size={15}/>{view.recoverable ? '恢复原生会话' : '重新连接项目（无原生历史）'}</Button>}</div>{view.error && <div className="error">{view.error}</div>}</section>}
    {connected && <><Conversation view={view}/><div className="bottom">{view.interactions.map(item => <InteractionCard key={item.id} item={item} generation={view.generation}/>)}{(view.error || localError) && <div className="error">{localError || view.error}</div>}<div className="composer"><textarea aria-label="输入需求" placeholder={active ? '写下后续要求，默认排队追加…' : '告诉 OMP 你想完成什么…'} value={draft} onChange={e => setDraft(e.target.value)} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !composing.current && !e.nativeEvent.isComposing) { e.preventDefault(); submit(active ? 'followUp' : 'normal') } }}/><div className="composer-actions"><span>⌘↵ 发送 · Shift+Enter 换行</span><div>{active && <Button variant="danger" onClick={() => window.session.send({ type: 'abort' })}><Square size={14}/>停止当前执行</Button>}{active && <Button disabled={!draft.trim() || sending} onClick={() => submit('steer')}><CornerUpRight size={15}/>干预当前执行</Button>}<Button variant="primary" disabled={!draft.trim() || sending} onClick={() => submit(active ? 'followUp' : 'normal')}><Send size={15}/>{active ? '排队追加' : '发送'}</Button></div></div></div><div className="footnote">停止当前执行不会清空 OMP 已接受的队列。关窗后任务继续；退出应用请用菜单或右上角按钮。</div></div></>}
  </div>
}

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><App /></QueryClientProvider>)
