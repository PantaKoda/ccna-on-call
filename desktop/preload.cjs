// The small bridge between the game page and the desktop app. The page checks
// for window.ccnaDesktop; in a browser it is not there and nothing changes.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ccnaDesktop", {
  platform: process.platform,
  update: {
    get: () => ipcRenderer.invoke("update:get"),
    check: () => ipcRenderer.invoke("update:check"),
    start: () => ipcRenderer.invoke("update:start"),
    on(cb) {
      const f = (_e, state) => cb(state);
      ipcRenderer.on("update:state", f);
      return () => ipcRenderer.removeListener("update:state", f);
    },
  },
  music: {
    get: () => ipcRenderer.invoke("music:get"),
    pickFolder: () => ipcRenderer.invoke("music:pick"),
    findSteam: () => ipcRenderer.invoke("music:steam"),
    clear: () => ipcRenderer.invoke("music:clear"),
  },
  data: {
    info: () => ipcRenderer.invoke("data:info"),
    import: () => ipcRenderer.invoke("data:import"),
    open: () => ipcRenderer.invoke("data:open"),
  },
});
