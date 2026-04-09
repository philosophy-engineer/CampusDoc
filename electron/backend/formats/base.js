class FormatAdapter {
  constructor({ format, extensions = [], implemented = true }) {
    if (!format) {
      throw new Error("format이 필요합니다.");
    }
    this.format = String(format).toLowerCase();
    this.extensions = extensions.map((item) => String(item).toLowerCase());
    this.implemented = Boolean(implemented);
  }

  supportsFormat(format) {
    return this.format === String(format || "").toLowerCase();
  }

  supportsExtension(extension) {
    return this.extensions.includes(String(extension || "").toLowerCase());
  }

  async open() {
    throw new Error("open 구현이 필요합니다.");
  }

  async save() {
    throw new Error("save 구현이 필요합니다.");
  }

  async export() {
    throw new Error("export 구현이 필요합니다.");
  }
}

class NotSupportedFormatError extends Error {
  constructor({ format, action }) {
    super(`${format} 포맷은 아직 ${action}을(를) 지원하지 않습니다.`);
    this.code = "NOT_SUPPORTED_FORMAT";
    this.format = format;
    this.action = action;
  }
}

module.exports = {
  FormatAdapter,
  NotSupportedFormatError,
};
