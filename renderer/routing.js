export function routeFromHash(hash = window.location.hash) {
  if (!hash || hash === "#" || hash === "#/" || hash === "#/start") {
    return { type: "browse" };
  }

  if (hash === "#/browse") {
    return { type: "browse" };
  }

  if (hash === "#/new") {
    return { type: "new" };
  }

  if (hash === "#/study" || hash === "#/records") {
    return { type: "browse" };
  }

  if (hash.startsWith("#/file/")) {
    const encodedPath = hash.slice("#/file/".length);
    try {
      const filePath = decodeURIComponent(encodedPath);
      if (!filePath) {
        return { type: "invalid" };
      }
      return { type: "file", filePath };
    } catch {
      return { type: "invalid" };
    }
  }

  return { type: "invalid" };
}
