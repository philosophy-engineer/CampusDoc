const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const { DocRepository, sanitizeTitle } = require("./backend/doc-repository");
const { DocumentService } = require("./backend/document-service");
const { TxtExporter, TxtImporter } = require("./backend/formats/txt");
const { IPC_CHANNELS } = require("./shared/ipc-channels");

let mainWindow = null;
let documentService = null;
let handlersRegistered = false;

function toPublicError(error) {
  if (error instanceof Error) {
    return new Error(error.message);
  }
  return new Error("요청 처리 중 오류가 발생했습니다.");
}

function createDocumentService() {
  const workspaceDir = path.join(app.getPath("userData"), "workspace");
  const repository = new DocRepository({ workspaceDir });

  return new DocumentService({
    repository,
    importers: [new TxtImporter(repository)],
    exporters: [new TxtExporter(repository)],
  });
}

function watchRendererFilesForDev() {
  if (process.env.CAMPUSDOC_DEV !== "1" || !mainWindow) {
    return;
  }

  const rendererWatchTargets = [
    path.join(__dirname, "..", "index.html"),
    path.join(__dirname, "..", "styles"),
    path.join(__dirname, "..", "renderer"),
  ];

  const watchers = rendererWatchTargets.map((targetPath) => {
    return fs.watch(targetPath, { recursive: true }, () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }
      mainWindow.webContents.reloadIgnoringCache();
    });
  });

  mainWindow.on("closed", () => {
    watchers.forEach((watcher) => watcher.close());
  });
}

function registerIpcHandlers() {
  if (handlersRegistered) {
    return;
  }

  const register = (channel, handler) => {
    ipcMain.handle(channel, async (_event, payload) => {
      try {
        return await handler(payload || {});
      } catch (error) {
        throw toPublicError(error);
      }
    });
  };

  register(IPC_CHANNELS.listDocs, async () => {
    return documentService.listDocs();
  });

  register(IPC_CHANNELS.importTxt, async () => {
    const selection = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Text Files", extensions: ["txt"] }],
      title: "TXT 파일 가져오기",
    });

    if (selection.canceled || selection.filePaths.length === 0) {
      return null;
    }

    return documentService.importFile({
      format: "txt",
      sourcePath: selection.filePaths[0],
    });
  });

  register(IPC_CHANNELS.createDoc, async ({ title }) => {
    return documentService.createDoc(title);
  });

  register(IPC_CHANNELS.readDoc, async ({ docId }) => {
    return documentService.readDoc(docId);
  });

  register(IPC_CHANNELS.saveDoc, async ({ docId, content }) => {
    return documentService.saveDoc(docId, content);
  });

  register(IPC_CHANNELS.exportTxt, async ({ docId }) => {
    const meta = await documentService.getDocMeta(docId);
    const suggestedName = `${sanitizeTitle(meta.title)}.txt`;

    const result = await dialog.showSaveDialog(mainWindow, {
      title: "TXT 파일 내보내기",
      defaultPath: path.join(app.getPath("documents"), suggestedName),
      filters: [{ name: "Text Files", extensions: ["txt"] }],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    let outputPath = result.filePath;
    if (path.extname(outputPath).toLowerCase() !== ".txt") {
      outputPath = `${outputPath}.txt`;
    }

    return documentService.exportFile({
      format: "txt",
      docId,
      outputPath,
    });
  });

  handlersRegistered = true;
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 980,
    minHeight: 680,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  await mainWindow.loadFile(path.join(__dirname, "..", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  watchRendererFilesForDev();
}

app.whenReady().then(async () => {
  app.setName("CampusDoc");
  documentService = createDocumentService();
  registerIpcHandlers();
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
