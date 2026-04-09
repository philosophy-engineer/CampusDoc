const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const { DocumentService, sanitizeTitle } = require("./backend/document-service");
const { FormatRegistry } = require("./backend/format-registry");
const { NotSupportedFormatAdapter } = require("./backend/formats/not-supported");
const { ensureTxtPath, TxtFormatAdapter } = require("./backend/formats/txt");
const { IPC_CHANNELS } = require("./shared/ipc-channels");

let mainWindow = null;
let documentService = null;
let formatRegistry = null;
let handlersRegistered = false;

function toPublicError(error) {
  if (!(error instanceof Error)) {
    return new Error("요청 처리 중 오류가 발생했습니다.");
  }

  const publicError = new Error(error.message);
  if (error.code) {
    publicError.code = error.code;
  }
  if (error.format) {
    publicError.format = error.format;
  }
  if (error.action) {
    publicError.action = error.action;
  }
  return publicError;
}

function createFormatRegistry() {
  return new FormatRegistry([
    new TxtFormatAdapter(),
    new NotSupportedFormatAdapter("docx", ["docx"]),
    new NotSupportedFormatAdapter("hwp", ["hwp"]),
    new NotSupportedFormatAdapter("pptx", ["pptx"]),
    new NotSupportedFormatAdapter("pdf", ["pdf"]),
  ]);
}

function createDocumentService() {
  return new DocumentService({
    userDataDir: app.getPath("userData"),
    formatRegistry,
  });
}

function getSuggestedFileName(baseName, extension) {
  const safeTitle = sanitizeTitle(baseName || "Untitled");
  return `${safeTitle}.${String(extension || "txt").toLowerCase()}`;
}

async function askSaveTargetPath({ suggestedName, targetFormat = "txt" }) {
  const extension = String(targetFormat || "txt").toLowerCase();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: `${extension.toUpperCase()} 파일 저장`,
    defaultPath: path.join(app.getPath("documents"), getSuggestedFileName(suggestedName, extension)),
    filters: [{ name: "Document Files", extensions: [extension] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  if (extension === "txt") {
    return ensureTxtPath(result.filePath);
  }

  const resolved = path.resolve(result.filePath);
  if (path.extname(resolved).replace(".", "").toLowerCase() === extension) {
    return resolved;
  }
  return `${resolved}.${extension}`;
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

  register(IPC_CHANNELS.listRecentFiles, async () => {
    return documentService.listRecentFiles();
  });

  register(IPC_CHANNELS.removeRecentMissing, async ({ paths }) => {
    return documentService.removeRecentMissing(paths);
  });

  const openFileDialogHandler = async () => {
    const extensions = formatRegistry.getOpenDialogExtensions();
    const selection = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Document Files", extensions: extensions.length > 0 ? extensions : ["txt"] }],
      title: "파일 열기",
    });

    if (selection.canceled || selection.filePaths.length === 0) {
      return null;
    }

    return {
      filePath: path.resolve(selection.filePaths[0]),
    };
  };

  register(IPC_CHANNELS.openFileDialog, openFileDialogHandler);

  register(IPC_CHANNELS.openFileByPath, async ({ filePath }) => {
    return documentService.openFileByPath(filePath);
  });

  // Deprecated aliases for one release
  register(IPC_CHANNELS.openTxtDialog, openFileDialogHandler);

  register(IPC_CHANNELS.openTxtByPath, async ({ filePath }) => {
    return documentService.openFileByPath(filePath);
  });

  register(IPC_CHANNELS.createUntitled, async () => {
    return documentService.createUntitled();
  });

  register(IPC_CHANNELS.saveCurrent, async ({ filePath, content, sourceFormat, suggestedName }) => {
    if (typeof filePath === "string" && filePath.trim()) {
      return documentService.saveCurrent({ filePath, content, sourceFormat });
    }

    const outputPath = await askSaveTargetPath({ suggestedName, targetFormat: sourceFormat || "txt" });
    if (!outputPath) {
      return { canceled: true };
    }

    return documentService.saveAs({
      outputPath,
      content,
      sourceFormat: sourceFormat || "txt",
    });
  });

  register(IPC_CHANNELS.saveAs, async ({ content, sourceFormat, suggestedName }) => {
    const outputPath = await askSaveTargetPath({ suggestedName, targetFormat: sourceFormat || "txt" });
    if (!outputPath) {
      return { canceled: true };
    }

    return documentService.saveAs({
      outputPath,
      content,
      sourceFormat: sourceFormat || "txt",
    });
  });

  register(IPC_CHANNELS.exportDocument, async ({ targetFormat, content, sourceFilePath, suggestedName }) => {
    const outputPath = await askSaveTargetPath({ suggestedName, targetFormat: targetFormat || "txt" });
    if (!outputPath) {
      return { canceled: true };
    }

    return documentService.exportDocument({
      sourceFilePath,
      targetFormat: targetFormat || "txt",
      outputPath,
      content,
    });
  });

  register(IPC_CHANNELS.confirmUnsavedChanges, async ({ title }) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["저장", "버리기", "취소"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: "저장되지 않은 변경 사항",
      message: "저장되지 않은 변경 사항이 있습니다.",
      detail: `문서: ${sanitizeTitle(title || "Untitled")}`,
    });

    if (result.response === 0) {
      return { action: "save" };
    }
    if (result.response === 1) {
      return { action: "discard" };
    }
    return { action: "cancel" };
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
  formatRegistry = createFormatRegistry();
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
