const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, payload = {}) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld("campusDoc", {
  files: {
    listDocs: () => invoke("campusdoc:list-docs"),
    importTxt: () => invoke("campusdoc:import-txt"),
    createDoc: (title) => invoke("campusdoc:create-doc", { title }),
    readDoc: (docId) => invoke("campusdoc:read-doc", { docId }),
    saveDoc: (docId, content) => invoke("campusdoc:save-doc", { docId, content }),
    exportTxt: (docId) => invoke("campusdoc:export-txt", { docId }),
  },
});
