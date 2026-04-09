const fs = require("node:fs/promises");
const path = require("node:path");
const { TextDecoder } = require("node:util");

const { FormatAdapter } = require("./base");

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function decodeUtf8Strict(buffer) {
  try {
    return utf8Decoder.decode(buffer);
  } catch {
    throw new Error("UTF-8 텍스트만 열 수 있습니다.");
  }
}

async function atomicWriteFile(targetPath, data) {
  const directory = path.dirname(targetPath);
  const tempPath = path.join(directory, `.${path.basename(targetPath)}.${Date.now()}.tmp`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, data);
  await fs.rename(tempPath, targetPath);
}

function ensureTxtPath(targetPath) {
  const resolved = path.resolve(targetPath);
  if (path.extname(resolved).toLowerCase() === ".txt") {
    return resolved;
  }
  return `${resolved}.txt`;
}

class TxtFormatAdapter extends FormatAdapter {
  constructor() {
    super({
      format: "txt",
      extensions: ["txt"],
    });
  }

  async open({ filePath }) {
    const resolved = path.resolve(filePath);
    const buffer = await fs.readFile(resolved);
    const content = decodeUtf8Strict(buffer);
    const stat = await fs.stat(resolved);
    const title = path.basename(resolved, path.extname(resolved)).trim() || "Untitled";

    return {
      filePath: resolved,
      content,
      title,
      updatedAt: stat.mtime.toISOString(),
      format: "txt",
    };
  }

  async save({ filePath, content }) {
    const targetPath = ensureTxtPath(filePath);
    await atomicWriteFile(targetPath, String(content ?? ""));
    const stat = await fs.stat(targetPath);
    const title = path.basename(targetPath, path.extname(targetPath)).trim() || "Untitled";

    return {
      filePath: targetPath,
      title,
      updatedAt: stat.mtime.toISOString(),
      format: "txt",
    };
  }

  async export({ outputPath, content }) {
    const targetPath = ensureTxtPath(outputPath);
    await atomicWriteFile(targetPath, String(content ?? ""));
    const stat = await fs.stat(targetPath);
    const title = path.basename(targetPath, path.extname(targetPath)).trim() || "Untitled";

    return {
      outputPath: targetPath,
      filePath: targetPath,
      title,
      updatedAt: stat.mtime.toISOString(),
      format: "txt",
    };
  }
}

module.exports = {
  TxtFormatAdapter,
  decodeUtf8Strict,
  ensureTxtPath,
};
