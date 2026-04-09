const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_RECENT_FILES = 10;

function nowIso() {
  return new Date().toISOString();
}

function sanitizeTitle(rawTitle) {
  const normalized = typeof rawTitle === "string" ? rawTitle.trim() : "";
  const collapsed = normalized.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return (collapsed || "Untitled").slice(0, 120);
}

function detectFormatFromPath(filePath) {
  const ext = path.extname(String(filePath || "")).replace(".", "").toLowerCase();
  return ext || "txt";
}

function toDocumentMeta(result, fallbackFormat = "txt") {
  return {
    title: sanitizeTitle(result?.title || "Untitled"),
    filePath: result?.filePath || null,
    updatedAt: result?.updatedAt || nowIso(),
    format: (result?.format || fallbackFormat || "txt").toLowerCase(),
    isUntitled: !result?.filePath,
  };
}

class DocumentService {
  constructor({ userDataDir, formatRegistry, maxRecentFiles = MAX_RECENT_FILES }) {
    if (!userDataDir) {
      throw new Error("userDataDir가 필요합니다.");
    }
    if (!formatRegistry) {
      throw new Error("formatRegistry가 필요합니다.");
    }

    this.userDataDir = path.resolve(userDataDir);
    this.recentFilesPath = path.join(this.userDataDir, "recent-files.json");
    this.maxRecentFiles = maxRecentFiles;
    this.formatRegistry = formatRegistry;
  }

  async createUntitled() {
    return {
      meta: {
        title: "Untitled",
        filePath: null,
        updatedAt: nowIso(),
        format: "txt",
        isUntitled: true,
      },
      content: "",
    };
  }

  async listRecentFiles() {
    const recentEntries = await this.#readRecentEntries();
    const existing = [];
    const missing = [];

    for (const entry of recentEntries) {
      try {
        const stat = await fs.stat(entry.filePath);
        if (!stat.isFile()) {
          missing.push(entry.filePath);
          continue;
        }

        existing.push({
          filePath: entry.filePath,
          title: sanitizeTitle(path.basename(entry.filePath, path.extname(entry.filePath))),
          updatedAt: stat.mtime.toISOString(),
          format: entry.format || detectFormatFromPath(entry.filePath),
        });
      } catch {
        missing.push(entry.filePath);
      }
    }

    return { existing, missing };
  }

  async removeRecentMissing(paths) {
    const removeSet = new Set((Array.isArray(paths) ? paths : []).map((item) => path.resolve(String(item))));
    const recentEntries = await this.#readRecentEntries();
    const kept = recentEntries.filter((item) => !removeSet.has(item.filePath));
    const removed = recentEntries.length - kept.length;
    await this.#writeRecentEntries(kept);
    return { removed };
  }

  async openFileByPath(filePath) {
    if (typeof filePath !== "string" || !filePath.trim()) {
      throw new Error("열 파일 경로가 올바르지 않습니다.");
    }
    const resolvedPath = path.resolve(filePath);
    const adapter = this.formatRegistry.getByFilePath(resolvedPath);
    if (!adapter) {
      const ext = detectFormatFromPath(resolvedPath) || "unknown";
      const error = new Error(`${ext} 포맷은 아직 열기를 지원하지 않습니다.`);
      error.code = "NOT_SUPPORTED_FORMAT";
      error.format = ext;
      error.action = "열기";
      throw error;
    }

    const opened = await adapter.open({ filePath: resolvedPath });
    const format = (opened?.format || adapter.format || detectFormatFromPath(resolvedPath)).toLowerCase();
    await this.touchRecent({ filePath: opened.filePath, format });
    return {
      meta: toDocumentMeta(opened, format),
      content: String(opened?.content ?? ""),
    };
  }

  async saveCurrent({ filePath, content, sourceFormat }) {
    if (typeof filePath !== "string" || !filePath.trim()) {
      throw new Error("저장 경로가 올바르지 않습니다.");
    }
    const resolvedPath = path.resolve(filePath);
    const format = (sourceFormat || detectFormatFromPath(resolvedPath)).toLowerCase();
    const adapter = this.formatRegistry.getByFormat(format) || this.formatRegistry.getByFilePath(resolvedPath);
    if (!adapter) {
      const error = new Error(`${format} 포맷은 아직 저장을 지원하지 않습니다.`);
      error.code = "NOT_SUPPORTED_FORMAT";
      error.format = format;
      error.action = "저장";
      throw error;
    }

    const saved = await adapter.save({ filePath: resolvedPath, content, sourceFormat: format });
    const finalFormat = (saved?.format || adapter.format || format).toLowerCase();
    await this.touchRecent({ filePath: saved.filePath, format: finalFormat });
    return {
      ...saved,
      format: finalFormat,
    };
  }

  async saveAs({ outputPath, content, sourceFormat }) {
    if (typeof outputPath !== "string" || !outputPath.trim()) {
      throw new Error("저장 경로가 올바르지 않습니다.");
    }
    const resolvedPath = path.resolve(outputPath);
    const format = (sourceFormat || detectFormatFromPath(resolvedPath)).toLowerCase();
    const adapter = this.formatRegistry.getByFormat(format) || this.formatRegistry.getByFilePath(resolvedPath);
    if (!adapter) {
      const error = new Error(`${format} 포맷은 아직 저장을 지원하지 않습니다.`);
      error.code = "NOT_SUPPORTED_FORMAT";
      error.format = format;
      error.action = "저장";
      throw error;
    }

    const saved = await adapter.save({ filePath: resolvedPath, content, sourceFormat: format });
    const finalFormat = (saved?.format || adapter.format || format).toLowerCase();
    await this.touchRecent({ filePath: saved.filePath, format: finalFormat });
    return {
      ...saved,
      format: finalFormat,
    };
  }

  async exportDocument({ sourceFilePath, targetFormat, outputPath, content }) {
    if (typeof outputPath !== "string" || !outputPath.trim()) {
      throw new Error("내보낼 파일 경로가 올바르지 않습니다.");
    }
    const resolvedOutput = path.resolve(outputPath);
    const formatFromPath = detectFormatFromPath(resolvedOutput);
    const resolvedTargetFormat = (targetFormat || formatFromPath || "txt").toLowerCase();
    const adapter = this.formatRegistry.getByFormat(resolvedTargetFormat);
    if (!adapter) {
      const error = new Error(`${resolvedTargetFormat} 포맷은 아직 내보내기를 지원하지 않습니다.`);
      error.code = "NOT_SUPPORTED_FORMAT";
      error.format = resolvedTargetFormat;
      error.action = "내보내기";
      throw error;
    }

    const result = await adapter.export({
      sourceFilePath: sourceFilePath ? path.resolve(sourceFilePath) : null,
      targetFormat: resolvedTargetFormat,
      outputPath: resolvedOutput,
      content: String(content ?? ""),
    });

    return {
      ...result,
      format: (result?.format || resolvedTargetFormat).toLowerCase(),
    };
  }

  async touchRecent({ filePath, format }) {
    if (typeof filePath !== "string" || !filePath.trim()) {
      return;
    }
    const resolvedPath = path.resolve(filePath);
    const normalizedFormat = (format || detectFormatFromPath(resolvedPath)).toLowerCase();
    const recentEntries = await this.#readRecentEntries();
    const deduped = [
      { filePath: resolvedPath, format: normalizedFormat },
      ...recentEntries.filter((item) => item.filePath !== resolvedPath),
    ];
    await this.#writeRecentEntries(deduped.slice(0, this.maxRecentFiles));
  }

  async #readRecentEntries() {
    try {
      const raw = await fs.readFile(this.recentFilesPath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
        return [];
      }

      const normalized = [];
      for (const item of parsed.items) {
        const isLegacyString = typeof item === "string";
        const filePath = isLegacyString ? item : item?.filePath;
        if (typeof filePath !== "string" || !filePath.trim()) {
          continue;
        }

        const resolvedPath = path.resolve(filePath);
        if (normalized.some((entry) => entry.filePath === resolvedPath)) {
          continue;
        }

        normalized.push({
          filePath: resolvedPath,
          format: (isLegacyString ? detectFormatFromPath(resolvedPath) : item?.format || detectFormatFromPath(resolvedPath))
            .toLowerCase(),
        });
      }

      return normalized.slice(0, this.maxRecentFiles);
    } catch {
      return [];
    }
  }

  async #writeRecentEntries(entries) {
    const normalized = [];
    for (const item of entries) {
      if (typeof item?.filePath !== "string" || !item.filePath.trim()) {
        continue;
      }
      const filePath = path.resolve(item.filePath);
      if (normalized.some((entry) => entry.filePath === filePath)) {
        continue;
      }

      normalized.push({
        filePath,
        format: String(item?.format || detectFormatFromPath(filePath)).toLowerCase(),
      });
    }

    const payload = {
      version: 2,
      items: normalized.slice(0, this.maxRecentFiles),
    };

    await fs.mkdir(path.dirname(this.recentFilesPath), { recursive: true });
    await fs.writeFile(this.recentFilesPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}

module.exports = {
  DocumentService,
  MAX_RECENT_FILES,
  detectFormatFromPath,
  sanitizeTitle,
};
