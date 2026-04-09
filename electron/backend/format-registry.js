const path = require("node:path");

class FormatRegistry {
  constructor(adapters = []) {
    this.adaptersByFormat = new Map();
    this.adaptersByExtension = new Map();

    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  register(adapter) {
    const format = String(adapter?.format || "").toLowerCase();
    if (!format) {
      throw new Error("adapter.format이 필요합니다.");
    }
    this.adaptersByFormat.set(format, adapter);

    for (const extension of adapter.extensions || []) {
      const ext = String(extension || "").toLowerCase();
      if (ext) {
        this.adaptersByExtension.set(ext, adapter);
      }
    }
  }

  getByFormat(format) {
    return this.adaptersByFormat.get(String(format || "").toLowerCase()) || null;
  }

  getByFilePath(filePath) {
    const extension = path.extname(String(filePath || "")).replace(".", "").toLowerCase();
    if (!extension) {
      return null;
    }
    return this.adaptersByExtension.get(extension) || null;
  }

  getOpenDialogExtensions() {
    const ext = new Set();
    for (const adapter of this.adaptersByFormat.values()) {
      if (adapter.implemented && typeof adapter.open === "function") {
        for (const item of adapter.extensions || []) {
          ext.add(String(item).toLowerCase());
        }
      }
    }
    return [...ext];
  }
}

module.exports = {
  FormatRegistry,
};
