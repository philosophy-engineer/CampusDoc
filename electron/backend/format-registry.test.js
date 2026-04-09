const { FormatRegistry } = require("./format-registry");

describe("FormatRegistry", () => {
  it("확장자와 포맷으로 어댑터를 조회한다", () => {
    const txtAdapter = { format: "txt", extensions: ["txt"], implemented: true, open() {}, save() {}, export() {} };
    const pdfAdapter = { format: "pdf", extensions: ["pdf"], implemented: false, open() {}, save() {}, export() {} };
    const registry = new FormatRegistry([txtAdapter, pdfAdapter]);

    expect(registry.getByFormat("txt")).toBe(txtAdapter);
    expect(registry.getByFormat("pdf")).toBe(pdfAdapter);
    expect(registry.getByFilePath("/tmp/a.txt")).toBe(txtAdapter);
    expect(registry.getByFilePath("/tmp/a.PDF")).toBe(pdfAdapter);
    expect(registry.getByFilePath("/tmp/a.unknown")).toBeNull();
    expect(registry.getOpenDialogExtensions()).toEqual(["txt"]);
  });
});
