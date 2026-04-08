const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  DocRepository,
  decodeUtf8Strict,
  ensurePathInside,
  sanitizeTitle,
} = require("./doc-repository");

describe("DocRepository", () => {
  let tempDir;
  let repository;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "campusdoc-test-"));
    repository = new DocRepository({ workspaceDir: tempDir });
    await repository.init();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("create/read/save 흐름에서 메타데이터와 파일이 동기화된다", async () => {
    const created = await repository.createDoc("테스트 문서");
    expect(created.docId).toMatch(/^[a-f0-9]{16}$/);

    const read1 = await repository.readDoc(created.docId);
    expect(read1.meta.title).toBe("테스트 문서");
    expect(read1.content).toBe("");

    const saveResult = await repository.saveDoc(created.docId, "hello campus");
    expect(saveResult.updatedAt).toBeTruthy();

    const read2 = await repository.readDoc(created.docId);
    expect(read2.content).toBe("hello campus");
    expect(read2.meta.updatedAt).toBe(saveResult.updatedAt);
  });

  it("exportTxt는 작업본 내용을 지정한 경로로 저장한다", async () => {
    const created = await repository.createDoc("내보내기 테스트");
    await repository.saveDoc(created.docId, "export content");

    const outputPath = path.join(tempDir, "out.txt");
    const exported = await repository.exportTxt(created.docId, outputPath);

    expect(exported.outputPath).toBe(outputPath);
    const raw = await fs.readFile(outputPath, "utf8");
    expect(raw).toBe("export content");
  });

  it("경로 순회 시도를 차단한다", async () => {
    await expect(repository.readDoc("../evil")).rejects.toThrow("문서 ID 형식이 올바르지 않습니다.");

    expect(() => {
      ensurePathInside(path.join(tempDir, "docs"), path.join(tempDir, "docs", "..", "outside.txt"));
    }).toThrow("허용되지 않은 경로입니다.");
  });

  it("UTF-8이 아닌 파일은 import할 수 없다", async () => {
    const sourcePath = path.join(tempDir, "invalid.txt");
    await fs.writeFile(sourcePath, Buffer.from([0xc3, 0x28]));

    await expect(repository.importTxtFromPath(sourcePath)).rejects.toThrow("UTF-8 텍스트만 가져올 수 있습니다.");
  });
});

describe("helpers", () => {
  it("sanitizeTitle은 제어문자를 제거하고 기본 제목을 보장한다", () => {
    expect(sanitizeTitle("  hello\nworld\t ")).toBe("hello world");
    expect(sanitizeTitle("\u0000\u0001")).toBe("새 문서");
  });

  it("decodeUtf8Strict는 유효한 UTF-8은 통과시킨다", () => {
    expect(decodeUtf8Strict(Buffer.from("안녕하세요", "utf8"))).toBe("안녕하세요");
  });
});
