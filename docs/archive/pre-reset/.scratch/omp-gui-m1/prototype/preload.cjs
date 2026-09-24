const { ipcRenderer } = require('electron');
ipcRenderer.on('probe-port', event => {
  const port = event.ports[0];
  port.onmessage = ({ data }) => ipcRenderer.send('probe-observed', data);
  port.start();
  ipcRenderer.removeAllListeners('probe-command');
  ipcRenderer.on('probe-command', (_, command) => port.postMessage(command));
});
