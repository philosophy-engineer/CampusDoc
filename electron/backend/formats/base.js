class Importer {
  constructor(format) {
    this.format = format;
  }

  supports(format) {
    return this.format === format;
  }

  async importFile() {
    throw new Error("importFile 구현이 필요합니다.");
  }
}

class Exporter {
  constructor(format) {
    this.format = format;
  }

  supports(format) {
    return this.format === format;
  }

  async exportFile() {
    throw new Error("exportFile 구현이 필요합니다.");
  }
}

module.exports = {
  Importer,
  Exporter,
};
