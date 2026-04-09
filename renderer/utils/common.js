export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatDateTimeForDisplay(isoString) {
  if (!isoString) {
    return "-";
  }

  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return String(isoString);
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function isLikelyDocId(value) {
  return typeof value === "string" && /^[a-z0-9-]{8,64}$/i.test(value);
}
