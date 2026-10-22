/* Reuse Material's index, snippet rendering and native/offline language loaders. */
(() => {
  const listen = self.addEventListener.bind(self);
  const send = self.postMessage.bind(self);
  let materialHandler;
  let materialResponse;

  self.addEventListener = (type, handler, ...options) => {
    if (type === "message") materialHandler = handler;
    else listen(type, handler, ...options);
  };
  self.postMessage = response => { materialResponse = response; };
