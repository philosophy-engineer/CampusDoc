class DocumentService {
  constructor({ repository, importers = [], exporters = [] }) {
    this.repository = repository;
    this.importers = new Map(importers.map((item) => [item.format, item]));
    this.exporters = new Map(exporters.map((item) => [item.format, item]));
  }

  async listDocs() {
    return this.repository.listDocs();
  }

  async createDoc(title) {
    return this.repository.createDoc(title);
  }

  async readDoc(docId) {
    return this.repository.readDoc(docId);
  }

  async saveDoc(docId, content) {
    return this.repository.saveDoc(docId, content);
  }

  async getDocMeta(docId) {
    return this.repository.getDocMeta(docId);
  }

  async importFile({ format, sourcePath, title }) {
    const importer = this.importers.get(format);
    if (!importer) {
      throw new Error(`지원하지 않는 import 포맷입니다: ${format}`);
    }

    return importer.importFile({ sourcePath, title });
  }

  async exportFile({ format, docId, outputPath }) {
    const exporter = this.exporters.get(format);
    if (!exporter) {
      throw new Error(`지원하지 않는 export 포맷입니다: ${format}`);
    }

    return exporter.exportFile({ docId, outputPath });
  }
}

module.exports = {
  DocumentService,
};
