const { FormatAdapter, NotSupportedFormatError } = require("./base");

class NotSupportedFormatAdapter extends FormatAdapter {
  constructor(format, extensions = []) {
    super({ format, extensions, implemented: false });
  }

  async open() {
    throw new NotSupportedFormatError({ format: this.format, action: "열기" });
  }

  async save() {
    throw new NotSupportedFormatError({ format: this.format, action: "저장" });
  }

  async export() {
    throw new NotSupportedFormatError({ format: this.format, action: "내보내기" });
  }
}

module.exports = {
  NotSupportedFormatAdapter,
};
