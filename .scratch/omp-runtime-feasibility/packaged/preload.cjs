const { ipcRenderer } = require('electron');
ipcRenderer.on('port', event => {
  const port = event.ports[0];
  port.onmessage = ({ data }) => ipcRenderer.send('observed', data);
  port.start();
  ipcRenderer.on('command', (_, command) => port.postMessage(command));
});
