import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { FrameDecoder } from './frame-decoder'
import { clientCommand, textOf, type DisplayMessage, type HostEvent, type Interaction, type SessionView, type Submission, type ToolCard } from '../shared/protocol'

const parent = (process as any).parentPort
const exec = promisify(execFile)
type Port = { postMessage: (value: unknown) => void; on: (name: string, fn: (event: { data: unknown }) => void) => void; start: () => void; close: () => void }
type Saved = { project?: string; executable?: string; configDir?: string; sessionFile?: string }
let dataDir = '', saved: Saved = {}, port: Port | undefined, omp: ChildProcessWithoutNullStreams | undefined
const permitted = { projects: new Set<string>(), executables: new Set<string>(), configs: new Set<string>() }
let frameDecoder = new FrameDecoder(), readyResolve: ((frame: any) => void) | undefined, readyReject: ((reason: Error) => void) | undefined
const pending = new Map<string, { resolve: (frame: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()
const interactionTimers = new Map<string, NodeJS.Timeout>()
let seqId = 0, messageId = 0, activeMessage: number | undefined, messageTimer: NodeJS.Timeout | undefined
const dirtyMessages = new Set<number>()
let shuttingDown = false
const view: SessionView = { generation: crypto.randomUUID(), seq: 0, status: 'disconnected', queuedCount: 0, messages: [], tools: [], interactions: [], submissions: [] }

function toMain(value: unknown): void { parent.postMessage(value) }
function toRenderer(value: HostEvent): void { try { port?.postMessage(value) } catch { port = undefined } }
function terminateOmp(): void {
  if (!omp?.pid) return
  try { process.kill(-omp.pid, 'SIGTERM') } catch { try { omp.kill('SIGTERM') } catch {} }
  const pid = omp.pid
  setTimeout(() => { try { process.kill(-pid, 'SIGKILL') } catch {} }, 1200).unref()
}
function delta(change: Extract<HostEvent, { type: 'delta' }>['change']): void {
  view.seq++
  toRenderer({ type: 'delta', generation: view.generation, seq: view.seq, change })
}
function flushMessages(): void {
  if (messageTimer) clearTimeout(messageTimer)
  messageTimer = undefined
  for (const id of dirtyMessages) {
    const item = view.messages.find(x => x.id === id)
    if (item) delta({ kind: 'message', value: item })
  }
  dirtyMessages.clear()
}
function dirty(id: number): void {
  dirtyMessages.add(id)
  if (!messageTimer) messageTimer = setTimeout(flushMessages, 45)
}
function patchStatus(value: Partial<SessionView>): void {
  flushMessages()
  Object.assign(view, value)
  delta({ kind: 'status', value })
  toMain({ type: 'activity', status: view.status, queuedCount: view.queuedCount, interactionCount: view.interactions.length, ompPid: view.ompPid })
}
function save(): void {
  if (!dataDir) return
  fs.mkdirSync(dataDir, { recursive: true })
  const target = path.join(dataDir, 'session.json')
  const temporary = target + '.tmp'
  fs.writeFileSync(temporary, JSON.stringify(saved))
  fs.renameSync(temporary, target)
}
function load(): void {
  try { saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'session.json'), 'utf8')) } catch { saved = {} }
  view.project = saved.project
  view.executable = saved.executable
  view.configDir = saved.configDir
  view.recoverable = Boolean(saved.sessionFile && fs.existsSync(saved.sessionFile))
  try {
    const items = JSON.parse(fs.readFileSync(path.join(dataDir, 'submissions.json'), 'utf8'))
    if (Array.isArray(items)) view.submissions = items.slice(-100).map((item: Submission) => item.status === 'submitting' || item.status === 'accepted' ? { ...item, status: 'uncertain', error: '上次连接已结束，请检查原生会话后决定是否重发。' } : item)
  } catch { /* no saved submissions */ }
  if (saved.project) permitted.projects.add(saved.project)
  if (saved.executable) permitted.executables.add(saved.executable)
  if (saved.configDir) permitted.configs.add(saved.configDir)
}
function addSubmission(item: Submission): void {
  const index = view.submissions.findIndex(x => x.id === item.id)
  if (index >= 0) view.submissions[index] = item
  else view.submissions.push(item)
  if (dataDir) {
    const target = path.join(dataDir, 'submissions.json')
    const temp = target + '.tmp'
    fs.writeFileSync(temp, JSON.stringify(view.submissions.slice(-100)))
    fs.renameSync(temp, target)
  }
  delta({ kind: 'submission', value: item })
}
function consumeUserMessage(message: any): void {
  const content = textOf(message?.content)
  const match = view.submissions.find(x => (x.status === 'accepted' || x.status === 'submitting') && x.text === content)
  if (match) addSubmission({ ...match, status: 'processing' })
}
function setInteraction(frame: any): void {
  flushMessages()
  if (frame.method === 'cancel') {
    const id = frame.targetId || frame.id
    removeInteraction(id)
    return
  }
  if (['notify', 'setStatus', 'setWidget'].includes(frame.method)) {
    const label = frame.title || frame.statusKey || frame.widgetKey || frame.method
    const detail = frame.message || frame.statusText || (Array.isArray(frame.widgetLines) ? frame.widgetLines.join('\n') : '')
    if (frame.method !== 'notify') { patchStatus({ notice: detail ? `${label}：${detail}`.slice(0, 1000) : undefined }); return }
    if (!detail) return
    const message: DisplayMessage = { id: ++messageId, role: 'system', content: [{ type: 'text', text: `${label}${detail ? `：${detail}` : ''}` }], complete: true }
    view.messages.push(message)
    dirty(message.id)
    return
  }
  if (frame.method === 'setTitle' || frame.method === 'set_editor_text') return
  if (frame.method === 'open_url') { patchStatus({ error: 'OMP 请求在外部浏览器继续登录；当前阶段请使用既有 OMP 配置。' }); return }
  if (!['select', 'confirm', 'input', 'editor'].includes(frame.method)) {
    patchStatus({ error: `不支持的 OMP 交互：${String(frame.method)}` })
    return
  }
  const item: Interaction = { id: frame.id, method: frame.method, title: frame.title, message: frame.message, options: frame.options, placeholder: frame.placeholder, prefill: frame.prefill, timeout: frame.timeout, createdAt: Date.now() }
  view.interactions.push(item)
  delta({ kind: 'interaction', value: item })
  if (typeof item.timeout === 'number' && item.timeout > 0) interactionTimers.set(item.id, setTimeout(() => removeInteraction(item.id), item.timeout))
  patchStatus({ status: 'running' })
}
function removeInteraction(id: string): void {
  if (!view.interactions.some(x => x.id === id)) return
  clearTimeout(interactionTimers.get(id))
  interactionTimers.delete(id)
  view.interactions = view.interactions.filter(x => x.id !== id)
  delta({ kind: 'interaction', value: { id, removed: true } })
  patchStatus({})
}
function tool(frame: any, status: ToolCard['status']): void {
  flushMessages()
  const id = String(frame.toolCallId || frame.id || `tool-${view.tools.length}`)
  const index = view.tools.findIndex(x => x.id === id)
  const previous = index >= 0 ? view.tools[index] : undefined
  const item: ToolCard = { id, name: String(frame.toolName || frame.name || previous?.name || 'tool'), arguments: frame.args ?? frame.arguments ?? previous?.arguments, result: frame.result ?? previous?.result, status }
  if (index >= 0) view.tools[index] = item
  else view.tools.push(item)
  delta({ kind: 'tool', value: view.tools[index >= 0 ? index : view.tools.length - 1] })
}
function rpcFrame(frame: any): void {
  if (frame.type === 'ready') { readyResolve?.(frame); readyResolve = undefined; return }
  if (frame.type === 'response') {
    const request = pending.get(frame.id)
    if (request) { pending.delete(frame.id); clearTimeout(request.timer); request.resolve(frame) }
    else if (frame.success === false && typeof frame.id === 'string' && frame.id.startsWith('ui-')) {
      const item = view.submissions.find(x => `ui-${x.id}` === frame.id)
      if (item) addSubmission({ ...item, status: 'rejected', error: frame.error || 'OMP 后续调度失败' })
    }
    return
  }
  if (frame.type === 'prompt_result' && frame.agentInvoked === false) {
    const item = view.submissions.find(x => `ui-${x.id}` === frame.id)
    if (item) addSubmission({ ...item, status: 'processing' })
    return
  }
  if (frame.type === 'extension_ui_request') { setInteraction(frame); return }
  if (frame.type === 'agent_start') { patchStatus({ status: 'running' }); return }
  if (frame.type === 'agent_end') {
    flushMessages()
    if (frame.isTerminal !== false) {
      patchStatus({ status: 'idle' })
      void refreshState()
    }
    return
  }
  if (frame.type === 'tool_execution_start') { tool(frame, 'running'); return }
  if (frame.type === 'tool_execution_end') { tool(frame, frame.isError ? 'error' : 'done'); return }
  if (frame.type === 'message_start') {
    const message: DisplayMessage = { id: ++messageId, role: frame.message?.role || 'unknown', content: frame.message?.content || [], complete: false, timestamp: frame.message?.timestamp, toolCallId: frame.message?.toolCallId }
    view.messages.push(message)
    activeMessage = message.id
    if (message.role === 'user') { consumeUserMessage(frame.message); void refreshState() }
    dirty(message.id)
    return
  }
  if (frame.type === 'message_update' || frame.type === 'message_end') {
    const item = view.messages.findLast(x => x.id === activeMessage)
    if (item && frame.message) {
      item.content = frame.message.content || item.content
      item.error = frame.message.isError
      if (frame.type === 'message_end') { item.complete = true; activeMessage = undefined; flushMessages() }
      else dirty(item.id)
    }
    return
  }
  if (frame.type === 'extension_error') patchStatus({ error: `OMP 扩展错误：${frame.error}` })
}
function rpc(type: string, input: Record<string, unknown> = {}, id = `${type}-${++seqId}`): Promise<any> {
  if (!omp?.stdin.writable) return Promise.reject(Error('OMP 未连接'))
  const command = JSON.stringify({ id, type, ...input }) + '\n'
  if (Buffer.byteLength(command) > 1_048_576) return Promise.reject(Error('输入超过 OMP 单帧限制'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`OMP ${type} 响应超时，结果不明`)) }, 30_000)
    pending.set(id, { resolve, reject, timer })
    omp!.stdin.write(command, error => { if (error) { clearTimeout(timer); pending.delete(id); reject(error) } })
  })
}
async function refreshState(): Promise<void> {
  try {
    const response = await rpc('get_state')
    if (!response.success) throw Error(response.error)
    const state = response.data || {}
    const sessionFile = state.sessionFile
    if (typeof sessionFile === 'string' && fs.existsSync(sessionFile) && sessionFile !== saved.sessionFile) { saved.sessionFile = sessionFile; save() }
    patchStatus({ sessionId: state.sessionId, model: state.model ? `${state.model.provider}/${state.model.id}` : undefined, recoverable: Boolean(saved.sessionFile && fs.existsSync(saved.sessionFile)), queuedCount: state.queuedMessageCount || 0, status: state.isStreaming ? 'running' : view.status === 'stopping' ? 'stopping' : 'idle' })
  } catch (error) { patchStatus({ error: String(error) }) }
}
async function discover(executable?: string): Promise<{ file: string; version: string }> {
  const candidates = executable ? [executable] : ['/opt/homebrew/bin/omp', '/usr/local/bin/omp', ...String(process.env.PATH || '').split(path.delimiter).map(x => path.join(x, 'omp'))]
  for (const file of [...new Set(candidates)]) {
    try {
      const { stdout } = await exec(file, ['--version'], { timeout: 5000 })
      const version = stdout.trim().match(/(?:omp\/?v?)(\d+\.\d+\.\d+)/i)?.[1]
      if (version) return { file, version }
    } catch { /* try the next known location */ }
  }
  throw Error(executable ? `无法运行 OMP：${executable}` : '未找到 OMP。请在界面指定可执行文件。')
}
async function restoreHistory(): Promise<void> {
  let cursor: string | undefined
  const all: any[] = []
  for (let page = 0; page < 10_000; page++) {
    const result = await rpc('get_messages_page', cursor ? { cursor, limit: 128 } : { limit: 128 })
    if (!result.success) throw Error(result.error || '会话历史分页失败')
    if (!Array.isArray(result.data?.messages)) throw Error('OMP 返回了无效的会话历史')
    all.push(...result.data.messages)
    cursor = result.data.nextCursor
    if (!cursor) break
    if (page === 9_999) throw Error('会话历史页数超过限制')
  }
  view.messages = all.map((x: any) => ({ id: ++messageId, role: String(x.role || 'unknown'), content: x.content || [], complete: true, timestamp: x.timestamp, error: x.isError, toolCallId: x.toolCallId }))
  view.tools = []
  for (const message of all) {
    if (message.role === 'assistant' && Array.isArray(message.content)) for (const call of message.content) {
      if (call?.type === 'toolCall' && typeof call.id === 'string') view.tools.push({ id: call.id, name: String(call.name || 'tool'), arguments: call.arguments, status: 'running' })
    }
    if (message.role === 'toolResult' && typeof message.toolCallId === 'string') {
      const card = view.tools.find(x => x.id === message.toolCallId)
      if (card) { card.result = { content: message.content, details: message.details }; card.status = message.isError ? 'error' : 'done' }
    }
  }
}
async function start(project: string, executable?: string, configDir?: string, resume = false): Promise<void> {
  if (omp) throw Error('已有 OMP 会话正在运行')
  if (!permitted.projects.has(project) || (executable && !permitted.executables.has(executable)) || (configDir && !permitted.configs.has(configDir))) throw Error('路径须从受控宿主选择器中选择')
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) throw Error(`项目目录不可用：${project}`)
  if (configDir && (!fs.existsSync(configDir) || !fs.statSync(configDir).isDirectory())) throw Error(`OMP 配置目录不可用：${configDir}`)
  const found = await discover(executable)
  if (found.version !== '18.3.0') throw Error(`当前已验证 OMP 版本为 18.3.0，实际为 ${found.version}`)
  const projectChanged = saved.project && saved.project !== project
  if (projectChanged) view.submissions = []
  saved = { project, executable: found.file, configDir, sessionFile: projectChanged ? undefined : saved.sessionFile }
  save()
  view.messages = []; view.tools = []; view.interactions = []
  view.generation = crypto.randomUUID(); view.seq = 0; messageId = 0; activeMessage = undefined
  patchStatus({ status: 'connecting', project, executable: found.file, configDir, version: found.version, recoverable: Boolean(saved.sessionFile && fs.existsSync(saved.sessionFile)), error: undefined, queuedCount: 0 })
  toRenderer({ type: 'snapshot', view: structuredClone(view) })
  frameDecoder = new FrameDecoder()
  const args = ['--mode', 'rpc-ui', '--no-title']
  if (resume && saved.sessionFile && fs.existsSync(saved.sessionFile)) args.push('--resume', saved.sessionFile)
  const env = { ...process.env }
  if (configDir) env.PI_CODING_AGENT_DIR = configDir
  omp = spawn(found.file, args, { cwd: project, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  patchStatus({ ompPid: omp.pid })
  toMain({ type: 'omp-pid', pid: omp.pid })
  const launched = omp
  const ready = new Promise<any>((resolve, reject) => { readyResolve = resolve; readyReject = reject; setTimeout(() => { if (readyResolve) { readyResolve = undefined; reject(Error('OMP ready 超时')) } }, 15_000) })
  launched.stdout.on('data', bytes => { try { for (const frame of frameDecoder.push(bytes)) rpcFrame(frame) } catch (error) { fault(Error(`OMP 协议错误：${String(error)}`)) } })
  let stderr = ''
  launched.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-4000) })
  launched.on('error', error => fault(error))
  launched.on('exit', (code, signal) => {
    try { frameDecoder.finish() } catch (error) { if (!shuttingDown) patchStatus({ error: String(error) }) }
    if (omp === launched) omp = undefined
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(Error('OMP 已退出，命令结果不明')) }
    pending.clear()
    readyReject?.(Error(`OMP 在 ready 前退出：${stderr || code || signal}`)); readyReject = undefined
    if (!shuttingDown) patchStatus({ status: 'interrupted', error: `OMP 已退出 (${code ?? signal})。${stderr.slice(-500)}`, ompPid: undefined })
    toMain({ type: 'omp-exit', code, signal })
  })
  try {
    const hello = await ready
    if (!hello.supportedProtocolVersions?.includes(2)) throw Error('OMP 不支持必要的 RPC v2 协议')
    const negotiation = await rpc('negotiate_protocol', { protocolVersion: 2 })
    if (!negotiation.success) throw Error(negotiation.error || 'RPC v2 协商失败')
    if (resume) await restoreHistory()
    await refreshState()
    toRenderer({ type: 'snapshot', view: structuredClone(view) })
  } catch (error) {
    fault(error instanceof Error ? error : Error(String(error)))
    throw error
  }
}
function fault(error: Error): void {
  patchStatus({ status: 'interrupted', error: error.message })
  terminateOmp()
}
async function command(raw: unknown): Promise<void> {
  const parsed = clientCommand.safeParse(raw)
  if (!parsed.success) return
  const cmd = parsed.data
  try {
    if (cmd.type === 'snapshot') { toRenderer({ type: 'snapshot', view: structuredClone(view) }); return }
    if (cmd.type === 'start') { await start(cmd.project, cmd.executable, cmd.configDir); return }
    if (cmd.type === 'resume') { if (!saved.project) throw Error('没有可恢复的项目'); await start(saved.project, saved.executable, saved.configDir, true); return }
    if (cmd.type === 'prompt') {
      if (!omp) throw Error('OMP 未连接')
      const item: Submission = { id: cmd.requestId, text: cmd.message, intent: cmd.intent, status: 'submitting' }
      addSubmission(item)
      const behavior = cmd.intent === 'normal' ? {} : { streamingBehavior: cmd.intent }
      const response = await rpc('prompt', { message: cmd.message, ...behavior }, `ui-${cmd.requestId}`)
      const latest = view.submissions.find(x => x.id === item.id) || item
      addSubmission(response.success ? { ...latest, status: latest.status === 'processing' ? 'processing' : 'accepted' } : { ...latest, status: 'rejected', error: response.error })
      if (!response.success) throw Error(response.error || 'OMP 拒绝输入')
      await refreshState()
      toRenderer({ type: 'commandResult', requestId: cmd.requestId, ok: true })
      return
    }
    if (cmd.type === 'abort') {
      if (!omp) throw Error('OMP 未连接')
      patchStatus({ status: 'stopping' })
      const result = await rpc('abort')
      if (!result.success) throw Error(result.error || '停止失败')
      await refreshState()
      return
    }
    if (cmd.type === 'answer') {
      if (cmd.generation !== view.generation) throw Error('交互属于旧连接')
      if (!view.interactions.some(x => x.id === cmd.id)) throw Error('交互已过期')
      omp?.stdin.write(JSON.stringify({ type: 'extension_ui_response', id: cmd.id, value: cmd.value, confirmed: cmd.confirmed, cancelled: cmd.cancelled }) + '\n')
      removeInteraction(cmd.id)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    patchStatus({ error: message, status: omp ? view.status : 'interrupted' })
    if (cmd.type === 'prompt') {
      const item = view.submissions.find(x => x.id === cmd.requestId)
      if (item?.status === 'submitting') addSubmission({ ...item, status: 'uncertain', error: message })
      toRenderer({ type: 'commandResult', requestId: cmd.requestId, ok: false, error: message })
    }
  }
}
parent.on('message', ({ data, ports }: { data: any; ports: Port[] }) => {
  if (data?.type === 'init') {
    dataDir = data.dataDir; load()
    if (data.interrupted) patchStatus({ status: 'interrupted', project: saved.project, error: '上次连接意外中断，请手动恢复原生会话。' })
    else if (saved.project) void start(saved.project, saved.executable, saved.configDir, true).catch(fault)
  } else if (data?.type === 'attach') {
    port?.close(); port = ports[0]
    port.on('message', event => void command(event.data))
    port.start()
    toRenderer({ type: 'snapshot', view: structuredClone(view) })
  } else if (data?.type === 'permit-path' && typeof data.path === 'string') {
    if (data.kind === 'project') permitted.projects.add(data.path)
    if (data.kind === 'executable') permitted.executables.add(data.path)
    if (data.kind === 'config') permitted.configs.add(data.path)
  } else if (data?.type === 'shutdown') {
    shuttingDown = true
    if (data.stop) {
      try { omp?.stdin.write(JSON.stringify({ id: 'quit-abort', type: 'abort' }) + '\n') } catch {}
      setTimeout(() => { try { if (omp?.pid) process.kill(-omp.pid, 'SIGTERM') } catch {} }, 150)
      setTimeout(() => process.exit(0), 1200)
    } else {
      omp?.stdin.end()
      setTimeout(() => process.exit(0), 3000)
    }
  }
})
