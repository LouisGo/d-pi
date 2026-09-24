import { contextBridge, ipcRenderer } from 'electron'
import type { ClientCommand, HostEvent } from '../shared/protocol'

let port: MessagePort | undefined
const listeners = new Set<(event: HostEvent) => void>()
ipcRenderer.on('session-port', event => {
  port?.close()
  port = event.ports[0]
  port.onmessage = ({ data }) => { for (const listener of listeners) listener(data as HostEvent) }
  port.start()
  port.postMessage({ type: 'snapshot' })
})

contextBridge.exposeInMainWorld('session', {
  subscribe: (listener: (event: HostEvent) => void) => { listeners.add(listener); port?.postMessage({ type: 'snapshot' }); return () => listeners.delete(listener) },
  send: (command: ClientCommand) => port?.postMessage(command),
  chooseProject: () => ipcRenderer.invoke('choose-project'),
  chooseExecutable: () => ipcRenderer.invoke('choose-executable'),
  chooseConfig: () => ipcRenderer.invoke('choose-config'),
  quit: () => ipcRenderer.invoke('quit-app'),
})
