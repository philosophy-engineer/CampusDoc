export function routeFromHash(hash = window.location.hash) {
  if (!hash || hash === "#" || hash === "#/" || hash === "#/start") {
    return { type: "start" };
  }

  if (hash === "#/browse") {
    return { type: "browse" };
  }

  if (hash === "#/study" || hash === "#/records") {
    return { type: "legacy_redirect" };
  }

  if (hash.startsWith("#/file/")) {
    const encodedName = hash.slice("#/file/".length);
    try {
      const name = decodeURIComponent(encodedName);
      return { type: "file", name };
    } catch {
      return { type: "invalid" };
    }
  }

  return { type: "invalid" };
}
