export function normalizeLineBreaks(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

export function setEditorText(editor, text) {
  editor.textContent = normalizeLineBreaks(text);
}

export function getEditorText(editor) {
  return normalizeLineBreaks(editor.innerText || editor.textContent || "");
}
