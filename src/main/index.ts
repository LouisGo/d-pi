import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, utilityProcess, type UtilityProcess } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let window: BrowserWindow | undefined
let host: UtilityProcess | undefined
let ompPid: number | undefined
let activity = { status: 'disconnected', queuedCount: 0, interactionCount: 0 }
let quitting = false
let waitingToQuit = false
let hostCrashed = false
function record(event: string, extra: Record<string, unknown> = {}): void {
  try {
    const file = path.join(app.getPath('userData'), 'lifecycle.jsonl')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) fs.renameSync(file, file + '.previous')
    fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), event, ...extra }) + '\n')
  } catch { /* diagnostics must not affect app lifecycle */ }
}

function killGroup(pid: number | undefined): void {
  if (!pid) return
  try { process.kill(-pid, 'SIGTERM') } catch {}
  setTimeout(() => { try { process.kill(-pid, 'SIGKILL') } catch {} }, 1200).unref()
}
function createHost(): void {
  host = utilityProcess.fork(path.join(__dirname, 'host.js'))
  record('host-start', { pid: host.pid })
  const current = host
  current.on('message', message => {
    const data = message as any
    if (data?.type === 'omp-pid') { ompPid = data.pid; record('omp-start', { pid: ompPid }) }
    if (data?.type === 'omp-exit') { record('omp-exit', { code: data.code, signal: data.signal }); ompPid = undefined }
    if (data?.type === 'activity') {
      activity = { status: data.status, queuedCount: data.queuedCount, interactionCount: data.interactionCount }
      if (waitingToQuit && !hasWork()) void finishQuit(false)
    }
  })
  current.on('exit', () => {
    if (host !== current) return
    host = undefined
    record('host-exit', { pid: current.pid, quitting })
    killGroup(ompPid)
    ompPid = undefined
    if (!quitting) {
      hostCrashed = true
      createHost()
      window?.webContents.reload()
    }
  })
  current.postMessage({ type: 'init', dataDir: app.getPath('userData'), interrupted: hostCrashed })
  if (window && !window.isDestroyed()) attachWindow()
}
function attachWindow(): void {
  if (!host || !window || window.isDestroyed()) return
  const { port1, port2 } = new MessageChannelMain()
  host.postMessage({ type: 'attach' }, [port1])
  window.webContents.postMessage('session-port', null, [port2])
}
function createWindow(): void {
  window = new BrowserWindow({
    width: 1180, height: 800, minWidth: 720, minHeight: 550, show: true,
    title: 'OMP Desktop',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
    },
  })
  const target = window
  target.webContents.on('will-navigate', event => event.preventDefault())
  target.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  target.webContents.on('did-finish-load', attachWindow)
  target.on('close', event => { if (!quitting) { event.preventDefault(); target.hide(); record('window-hidden', { visible: target.isVisible(), ompPid }) } })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void target.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void target.loadFile(path.join(__dirname, '../renderer/index.html'))
}
function showWindow(): void {
  if (!window || window.isDestroyed()) createWindow()
  else { window.show(); window.focus() }
  record('window-shown', { visible: window?.isVisible(), ompPid })
}
function hasWork(): boolean { return activity.status === 'running' || activity.status === 'stopping' || activity.queuedCount > 0 || activity.interactionCount > 0 }
async function finishQuit(stop: boolean): Promise<void> {
  if (quitting) return
  quitting = true
  record('quit-start', { stop, ompPid, queuedCount: activity.queuedCount, interactionCount: activity.interactionCount })
  waitingToQuit = false
  host?.postMessage({ type: 'shutdown', stop })
  if (stop) killGroup(ompPid)
  const pid = ompPid
  setTimeout(() => { if (host) host.kill(); killGroup(pid); app.exit(0) }, stop ? 1500 : 4000).unref()
  if (!host) app.exit(0)
}
async function requestQuit(): Promise<void> {
  if (quitting) return
  if (!hasWork()) { await finishQuit(false); return }
  showWindow()
  const { response } = await dialog.showMessageBox(window!, {
    type: 'question', title: '还有未完成的工作',
    message: '当前执行、排队需求或待回答问题尚未结束。',
    detail: '等待完成会保持应用运行；停止后退出会结束受管理的 OMP 执行，不再处理排队需求。',
    buttons: ['等待完成后退出', '停止后退出', '取消退出'], defaultId: 2, cancelId: 2, noLink: true,
  })
  if (response === 0) { waitingToQuit = true; window?.setTitle('OMP Desktop · 等待完成后退出'); showWindow() }
  if (response === 1) await finishQuit(true)
  if (response === 2) { waitingToQuit = false; window?.setTitle('OMP Desktop'); record('quit-cancelled') }
}

app.whenReady().then(() => {
  app.setAppUserModelId('dev.lou.dpi')
  ipcMain.handle('choose-project', async event => {
    if (!window || event.sender !== window.webContents) return undefined
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
    const selected = result.canceled ? undefined : result.filePaths[0]
    if (selected) host?.postMessage({ type: 'permit-path', kind: 'project', path: selected })
    return selected
  })
  ipcMain.handle('choose-executable', async event => {
    if (!window || event.sender !== window.webContents) return undefined
    const result = await dialog.showOpenDialog(window, { properties: ['openFile'] })
    const selected = result.canceled ? undefined : result.filePaths[0]
    if (selected) host?.postMessage({ type: 'permit-path', kind: 'executable', path: selected })
    return selected
  })
  ipcMain.handle('choose-config', async event => {
    if (!window || event.sender !== window.webContents) return undefined
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
    const selected = result.canceled ? undefined : result.filePaths[0]
    if (selected) host?.postMessage({ type: 'permit-path', kind: 'config', path: selected })
    return selected
  })
  ipcMain.handle('quit-app', async event => { if (window && event.sender === window.webContents) await requestQuit() })
  createHost()
  createWindow()
  app.on('activate', showWindow)
})
app.on('before-quit', event => { if (!quitting) { event.preventDefault(); void requestQuit() } })
app.on('window-all-closed', () => { /* Closing a window hides it. The Dock keeps the session available. */ })
process.on('exit', () => killGroup(ompPid))
