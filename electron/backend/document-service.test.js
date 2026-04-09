const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { DocumentService } = require("./document-service");
const { FormatRegistry } = require("./format-registry");
const { NotSupportedFormatAdapter } = require("./formats/not-supported");
const { TxtFormatAdapter } = require("./formats/txt");

function createService(userDataDir) {
  const registry = new FormatRegistry([
    new TxtFormatAdapter(),
    new NotSupportedFormatAdapter("docx", ["docx"]),
    new NotSupportedFormatAdapter("hwp", ["hwp"]),
    new NotSupportedFormatAdapter("pptx", ["pptx"]),
    new NotSupportedFormatAdapter("pdf", ["pdf"]),
  ]);

  return new DocumentService({
    userDataDir,
    formatRegistry: registry,
  });
}

describe("DocumentService", () => {
  let tempDir;
  let service;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "campusdoc-document-service-"));
    service = createService(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("TXT 파일 열기/저장/내보내기가 동작한다", async () => {
    const sourcePath = path.join(tempDir, "sample.txt");
    await fs.writeFile(sourcePath, "hello");

    const opened = await service.openFileByPath(sourcePath);
    expect(opened.meta.format).toBe("txt");
    expect(opened.content).toBe("hello");

    const saved = await service.saveCurrent({
      filePath: sourcePath,
      content: "hello updated",
      sourceFormat: "txt",
    });
    expect(saved.filePath).toBe(sourcePath);

    const exported = await service.exportDocument({
      sourceFilePath: sourcePath,
      targetFormat: "txt",
      outputPath: path.join(tempDir, "exported"),
      content: "from export",
    });
    expect(exported.outputPath.endsWith(".txt")).toBe(true);
    const raw = await fs.readFile(exported.outputPath, "utf8");
    expect(raw).toBe("from export");
  });

  it("미지원 포맷은 NOT_SUPPORTED_FORMAT으로 응답한다", async () => {
    const docxPath = path.join(tempDir, "sample.docx");
    await fs.writeFile(docxPath, "fake");

    await expect(service.openFileByPath(docxPath)).rejects.toMatchObject({
      code: "NOT_SUPPORTED_FORMAT",
      format: "docx",
      action: "열기",
    });

    await expect(
      service.exportDocument({
        sourceFilePath: null,
        targetFormat: "pdf",
        outputPath: path.join(tempDir, "out.pdf"),
        content: "x",
      })
    ).rejects.toMatchObject({
      code: "NOT_SUPPORTED_FORMAT",
      format: "pdf",
      action: "내보내기",
    });
  });

  it("최근 파일 목록은 format을 유지하고 missing 정리를 지원한다", async () => {
    const existingPath = path.join(tempDir, "exists.txt");
    const missingPath = path.join(tempDir, "missing.txt");
    await fs.writeFile(existingPath, "ok");

    await service.touchRecent({ filePath: existingPath, format: "txt" });
    await service.touchRecent({ filePath: missingPath, format: "txt" });

    const before = await service.listRecentFiles();
    expect(before.existing).toHaveLength(1);
    expect(before.existing[0].format).toBe("txt");
    expect(before.missing).toContain(path.resolve(missingPath));

    await service.removeRecentMissing(before.missing);
    const after = await service.listRecentFiles();
    expect(after.missing).toHaveLength(0);
    expect(after.existing).toHaveLength(1);
  });

});
