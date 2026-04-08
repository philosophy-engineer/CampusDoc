const { Exporter, Importer } = require("./base");

class TxtImporter extends Importer {
  constructor(repository) {
    super("txt");
    this.repository = repository;
  }

  async importFile({ sourcePath, title }) {
    return this.repository.importTxtFromPath(sourcePath, title);
  }
}

class TxtExporter extends Exporter {
  constructor(repository) {
    super("txt");
    this.repository = repository;
  }

  async exportFile({ docId, outputPath }) {
    return this.repository.exportTxt(docId, outputPath);
  }
}

module.exports = {
  TxtExporter,
  TxtImporter,
};
