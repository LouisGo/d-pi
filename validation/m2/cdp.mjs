import { registerWaitCancellation, ValidationTransportError } from "./wait.mjs";

/** Only the isolated validation browser's request correlation lives here. */
export function createCdpClient(socket, timeout = 30000) {
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const task = pending.get(message.id);
    pending.delete(message.id);
    message.error
      ? task?.reject(Error(message.error.message))
      : task?.resolve(message.result);
  };
  socket.onclose = () => {
    for (const task of pending.values())
      task.reject(new ValidationTransportError("CDP closed"));
    pending.clear();
  };
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) {
        reject(new ValidationTransportError("CDP closed"));
        return;
      }
      const id = ++sequence;
      let unregister = () => {};
      const timer = setTimeout(() => {
        pending
          .get(id)
          ?.reject(new ValidationTransportError(`CDP ${method} timeout`));
      }, timeout);
      pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          pending.delete(id);
          unregister();
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          pending.delete(id);
          unregister();
          reject(error);
        },
      });
      unregister = registerWaitCancellation((reason) => {
        const error = new ValidationTransportError(`CDP ${method} ${reason}`);
        pending.get(id)?.reject(error);
        return error;
      });
      try {
        socket.send(JSON.stringify({ id, method, params }));
      } catch {
        pending
          .get(id)
          ?.reject(new ValidationTransportError(`CDP ${method} send failed`));
      }
    });
  }
  return { call };
}
