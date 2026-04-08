const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { TextDecoder } = require("node:util");

const DOC_ID_PATTERN = /^[a-f0-9]{16}$/;
const MAX_TITLE_LENGTH = 120;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function nowIso() {
  return new Date().toISOString();
}

function isValidDocId(value) {
  return typeof value === "string" && DOC_ID_PATTERN.test(value);
}

function generateDocId() {
  return crypto.randomBytes(8).toString("hex");
}

function sanitizeTitle(rawTitle) {
  const normalized = typeof rawTitle === "string" ? rawTitle.trim() : "";
  const collapsed = normalized.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return (collapsed || "새 문서").slice(0, MAX_TITLE_LENGTH);
}

function ensurePathInside(parentDir, targetPath) {
  const parentResolved = path.resolve(parentDir);
  const targetResolved = path.resolve(targetPath);

  if (targetResolved === parentResolved || targetResolved.startsWith(`${parentResolved}${path.sep}`)) {
    return targetResolved;
  }

  throw new Error("허용되지 않은 경로입니다.");
}

function decodeUtf8Strict(buffer) {
  try {
    return utf8Decoder.decode(buffer);
  } catch {
    throw new Error("UTF-8 텍스트만 가져올 수 있습니다.");
  }
}

async function atomicWriteFile(targetPath, data) {
  const directory = path.dirname(targetPath);
  const tempName = `.${path.basename(targetPath)}.${crypto.randomUUID()}.tmp`;
  const tempPath = path.join(directory, tempName);

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, data);
  await fs.rename(tempPath, targetPath);
}

function createInitialIndex() {
  return {
    version: 1,
    docs: [],
  };
}

function normalizeMeta(rawMeta) {
  return {
    docId: rawMeta.docId,
    title: sanitizeTitle(rawMeta.title),
    sourcePath: typeof rawMeta.sourcePath === "string" ? rawMeta.sourcePath : null,
    format: "txt",
    createdAt: rawMeta.createdAt,
    updatedAt: rawMeta.updatedAt,
  };
}

class DocRepository {
  constructor({ workspaceDir }) {
    if (!workspaceDir) {
      throw new Error("workspaceDir가 필요합니다.");
    }

    this.workspaceDir = path.resolve(workspaceDir);
    this.docsDir = path.join(this.workspaceDir, "docs");
    this.indexPath = path.join(this.workspaceDir, "index.json");
  }

  async init() {
    await fs.mkdir(this.docsDir, { recursive: true });
    try {
      await fs.access(this.indexPath);
    } catch {
      await atomicWriteFile(this.indexPath, `${JSON.stringify(createInitialIndex(), null, 2)}\n`);
    }
  }

  async listDocs() {
    const index = await this.#readIndex();
    const sorted = [...index.docs].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return sorted.map((meta) => ({ ...meta }));
  }

  async getDocMeta(docId) {
    if (!isValidDocId(docId)) {
      throw new Error("문서 ID 형식이 올바르지 않습니다.");
    }

    const index = await this.#readIndex();
    const meta = index.docs.find((item) => item.docId === docId);
    if (!meta) {
      throw new Error("문서를 찾을 수 없습니다.");
    }
    return { ...meta };
  }

  async createDoc(title) {
    return this.#createDocWithContent({
      title,
      content: "",
      sourcePath: null,
    });
  }

  async importTxtFromPath(sourcePath, titleOverride) {
    if (typeof sourcePath !== "string" || !sourcePath) {
      throw new Error("가져올 파일 경로가 올바르지 않습니다.");
    }

    const sourceBuffer = await fs.readFile(sourcePath);
    const content = decodeUtf8Strict(sourceBuffer);
    const sourceTitle = path.basename(sourcePath, path.extname(sourcePath));

    return this.#createDocWithContent({
      title: titleOverride || sourceTitle,
      content,
      sourcePath,
    });
  }

  async readDoc(docId) {
    const meta = await this.getDocMeta(docId);
    const docPath = this.#docPathFromId(docId);
    const content = await fs.readFile(docPath, "utf8");

    return {
      meta,
      content,
    };
  }

  async saveDoc(docId, content) {
    if (typeof content !== "string") {
      throw new Error("저장할 문서 내용이 올바르지 않습니다.");
    }

    const index = await this.#readIndex();
    const target = index.docs.find((item) => item.docId === docId);
    if (!target) {
      throw new Error("문서를 찾을 수 없습니다.");
    }

    const docPath = this.#docPathFromId(docId);
    await atomicWriteFile(docPath, content);

    const updatedAt = nowIso();
    target.updatedAt = updatedAt;
    await this.#writeIndex(index);

    return {
      updatedAt,
    };
  }

  async exportTxt(docId, outputPath) {
    if (typeof outputPath !== "string" || !outputPath) {
      throw new Error("내보낼 파일 경로가 올바르지 않습니다.");
    }

    const { content } = await this.readDoc(docId);
    await atomicWriteFile(path.resolve(outputPath), content);

    return {
      outputPath: path.resolve(outputPath),
    };
  }

  async #createDocWithContent({ title, content, sourcePath }) {
    const docId = generateDocId();
    const createdAt = nowIso();
    const meta = {
      docId,
      title: sanitizeTitle(title),
      sourcePath: sourcePath || null,
      format: "txt",
      createdAt,
      updatedAt: createdAt,
    };

    const docPath = this.#docPathFromId(docId);
    await atomicWriteFile(docPath, content);

    const index = await this.#readIndex();
    index.docs.push(meta);
    await this.#writeIndex(index);

    return { ...meta };
  }

  #docPathFromId(docId) {
    if (!isValidDocId(docId)) {
      throw new Error("문서 ID 형식이 올바르지 않습니다.");
    }

    const candidatePath = path.join(this.docsDir, `${docId}.txt`);
    return ensurePathInside(this.docsDir, candidatePath);
  }

  async #readIndex() {
    await this.init();
    const raw = await fs.readFile(this.indexPath, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.docs)) {
      throw new Error("index.json 형식이 올바르지 않습니다.");
    }

    return {
      version: parsed.version,
      docs: parsed.docs.filter((item) => item && typeof item === "object").map(normalizeMeta),
    };
  }

  async #writeIndex(index) {
    const normalizedIndex = {
      version: 1,
      docs: index.docs.map(normalizeMeta),
    };
    await atomicWriteFile(this.indexPath, `${JSON.stringify(normalizedIndex, null, 2)}\n`);
  }
}

module.exports = {
  DOC_ID_PATTERN,
  DocRepository,
  atomicWriteFile,
  decodeUtf8Strict,
  ensurePathInside,
  isValidDocId,
  sanitizeTitle,
};
