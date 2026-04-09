import { createEditorModeController } from "../editor/mode-controller.js";
import { getEditorText, normalizeLineBreaks, setEditorText } from "../editor/text.js";
import { getSelectionCaretRangeIn, setSelectionAtRange } from "../editor/selection.js";

export function renderDesktopEditor(
  { appRoot, renderScreen, bindTopbarActions, escapeHtml, formatDateTimeForDisplay, filesApi, settingsStore },
  meta,
  content
) {
  appRoot.innerHTML = renderScreen(
    `
      <section class="editor-layout">
        <div class="editor-top-actions" aria-label="문서 작업">
          <button class="button" type="button" id="desktop-export">Export TXT</button>
          <button class="button button-primary" type="button" id="desktop-save">저장</button>
        </div>

        <article class="reader-paper editor-paper">
          <div class="reader-paper-head editor-paper-head">
            <header class="editor-header">
              <div>
                <h1>${escapeHtml(meta.title)}</h1>
              </div>
            </header>
          </div>

          <div class="reader-frame">
            <div class="editor-textarea-wrap" id="desktop-editor-surface">
              <div id="desktop-line-overlay" class="line-overlay editor-line-overlay" aria-hidden="true"></div>
              <div
                id="desktop-editor"
                class="editor-textarea"
                role="textbox"
                aria-multiline="true"
                aria-label="문서 내용 편집"
                contenteditable="plaintext-only"
                spellcheck="false"
              ></div>
            </div>
          </div>
        </article>

        <p class="editor-status muted" id="desktop-status"></p>
      </section>
    `,
    {
      screenClass: "reader-screen",
      leadingHtml: '<a class="browse-home-button" href="#/browse">문서 목록으로</a>',
    }
  );

  bindTopbarActions();

  const editor = appRoot.querySelector("#desktop-editor");
  const overlay = appRoot.querySelector("#desktop-line-overlay");
  const saveButton = appRoot.querySelector("#desktop-save");
  const exportButton = appRoot.querySelector("#desktop-export");
  const statusNode = appRoot.querySelector("#desktop-status");
  if (!editor || !overlay || !saveButton || !exportButton || !statusNode) {
    return () => {};
  }

  let savedContent = normalizeLineBreaks(content);
  setEditorText(editor, savedContent);
  if (editor.contentEditable !== "plaintext-only") {
    editor.contentEditable = "true";
  }
  savedContent = getEditorText(editor);

  const modeController = createEditorModeController(editor, overlay, {
    getCondition: settingsStore.getCondition,
  });
  const unsubscribeSettings = settingsStore.subscribe(({ condition }) => {
    modeController.applyCondition(condition);
  });

  const syncStatus = (message = "") => {
    const dirty = getEditorText(editor) !== savedContent;
    const base = `최근 수정: ${formatDateTimeForDisplay(meta.updatedAt)}`;
    const dirtyText = dirty ? "저장되지 않은 변경 사항이 있습니다." : "저장 완료 상태입니다.";
    statusNode.textContent = [base, dirtyText, message].filter(Boolean).join("  ");
  };

  syncStatus();
  try {
    editor.focus({ preventScroll: true });
  } catch {
    editor.focus();
  }

  const doSave = async () => {
    saveButton.setAttribute("disabled", "true");
    try {
      const currentContent = getEditorText(editor);
      const result = await filesApi.saveDoc(meta.docId, currentContent);
      savedContent = currentContent;
      if (result?.updatedAt) {
        meta.updatedAt = result.updatedAt;
      }
      syncStatus("저장했습니다.");
    } catch (error) {
      syncStatus("저장 실패");
      window.alert(error.message || "저장에 실패했습니다.");
    } finally {
      saveButton.removeAttribute("disabled");
    }
  };

  const onInput = () => {
    syncStatus();
  };
  const onPaste = (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (typeof document.execCommand === "function") {
      document.execCommand("insertText", false, text);
      return;
    }

    const range = getSelectionCaretRangeIn(editor);
    if (!range) {
      return;
    }

    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    setSelectionAtRange(range);
  };
  const onKeyDown = (event) => {
    const isSaveKey = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
    if (!isSaveKey) {
      return;
    }
    event.preventDefault();
    doSave();
  };

  saveButton.addEventListener("click", doSave);
  editor.addEventListener("input", onInput);
  editor.addEventListener("paste", onPaste);
  editor.addEventListener("keydown", onKeyDown);

  const onExport = async () => {
    exportButton.setAttribute("disabled", "true");
    try {
      const result = await filesApi.exportTxt(meta.docId);
      if (result?.outputPath) {
        syncStatus(`내보내기 완료: ${result.outputPath}`);
      } else {
        syncStatus("내보내기를 취소했습니다.");
      }
    } catch (error) {
      window.alert(error.message || "내보내기에 실패했습니다.");
    } finally {
      exportButton.removeAttribute("disabled");
    }
  };
  exportButton.addEventListener("click", onExport);

  return () => {
    saveButton.removeEventListener("click", doSave);
    exportButton.removeEventListener("click", onExport);
    editor.removeEventListener("input", onInput);
    editor.removeEventListener("paste", onPaste);
    editor.removeEventListener("keydown", onKeyDown);
    unsubscribeSettings();
    modeController.destroy();
  };
}
