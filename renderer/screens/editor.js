import { createEditorModeController } from "../editor/mode-controller.js";
import { getEditorText, normalizeLineBreaks, setEditorText } from "../editor/text.js";
import { getSelectionCaretRangeIn, setSelectionAtRange } from "../editor/selection.js";

function titleFromPath(filePath) {
  const normalized = String(filePath || "").trim();
  if (!normalized) {
    return "Untitled";
  }
  const fileName = normalized.split(/[\\/]/).pop() || normalized;
  return (fileName.replace(/\.txt$/i, "") || "Untitled").trim();
}

export function renderDesktopEditor(
  { appRoot, renderScreen, bindTopbarActions, escapeHtml, formatDateTimeForDisplay, filesApi, settingsStore },
  meta,
  content
) {
  appRoot.innerHTML = renderScreen(
    `
      <section class="editor-layout">
        <div class="editor-top-actions" aria-label="문서 작업">
          <button class="button" type="button" id="desktop-export">Export</button>
          <button class="button" type="button" id="desktop-save-as">다른 이름으로 저장</button>
          <button class="button button-primary" type="button" id="desktop-save">저장</button>
        </div>

        <article class="reader-paper editor-paper">
          <div class="reader-paper-head editor-paper-head">
            <header class="editor-header">
              <div>
                <h1 id="desktop-title">${escapeHtml(meta.title || "Untitled")}</h1>
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
      leadingHtml: '<a class="browse-home-button" href="#/browse">최근 파일</a>',
    }
  );

  bindTopbarActions();

  const editor = appRoot.querySelector("#desktop-editor");
  const overlay = appRoot.querySelector("#desktop-line-overlay");
  const exportButton = appRoot.querySelector("#desktop-export");
  const saveButton = appRoot.querySelector("#desktop-save");
  const saveAsButton = appRoot.querySelector("#desktop-save-as");
  const statusNode = appRoot.querySelector("#desktop-status");
  const titleNode = appRoot.querySelector("#desktop-title");

  if (!editor || !overlay || !exportButton || !saveButton || !saveAsButton || !statusNode || !titleNode) {
    return {
      cleanup: () => {},
      isDirty: () => false,
      save: async () => true,
      getTitle: () => "Untitled",
    };
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

  const syncTitle = () => {
    const title = meta.title || titleFromPath(meta.filePath) || "Untitled";
    titleNode.textContent = title;
  };

  const syncStatus = (message = "") => {
    const dirty = getEditorText(editor) !== savedContent;
    const fileLabel = meta.filePath || "Untitled (저장 전)";
    const updatedLabel = formatDateTimeForDisplay(meta.updatedAt);
    const dirtyText = dirty ? "저장되지 않은 변경 사항이 있습니다." : "저장 완료 상태입니다.";
    statusNode.textContent = [`파일: ${fileLabel}`, `최근 수정: ${updatedLabel}`, dirtyText, message]
      .filter(Boolean)
      .join("  ");
  };

  const applySaveResult = (result) => {
    if (result?.filePath) {
      meta.filePath = result.filePath;
      meta.isUntitled = false;
      meta.title = result.title || titleFromPath(result.filePath);
    }
    if (result?.updatedAt) {
      meta.updatedAt = result.updatedAt;
    }
    if (result?.format) {
      meta.format = String(result.format).toLowerCase();
    }
    syncTitle();
  };

  syncTitle();
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
      const result = await filesApi.saveCurrent(
        meta.filePath,
        currentContent,
        meta.format || "txt",
        meta.title || "Untitled"
      );
      if (result?.canceled) {
        syncStatus("저장을 취소했습니다.");
        return false;
      }

      savedContent = currentContent;
      applySaveResult(result);
      syncStatus("저장했습니다.");
      return true;
    } catch (error) {
      if (error?.code === "NOT_SUPPORTED_FORMAT") {
        window.alert(`${String(error.format || meta.format || "unknown").toUpperCase()} 포맷 저장은 아직 준비 중입니다.`);
        return false;
      }
      syncStatus("저장 실패");
      window.alert(error.message || "저장에 실패했습니다.");
      return false;
    } finally {
      saveButton.removeAttribute("disabled");
    }
  };

  const doSaveAs = async () => {
    saveAsButton.setAttribute("disabled", "true");
    try {
      const currentContent = getEditorText(editor);
      const result = await filesApi.saveAs(currentContent, meta.format || "txt", meta.title || "Untitled");
      if (result?.canceled) {
        syncStatus("다른 이름으로 저장을 취소했습니다.");
        return false;
      }

      savedContent = currentContent;
      applySaveResult(result);
      syncStatus(`다른 이름으로 저장 완료: ${result.filePath}`);
      return true;
    } catch (error) {
      if (error?.code === "NOT_SUPPORTED_FORMAT") {
        window.alert(`${String(error.format || meta.format || "unknown").toUpperCase()} 포맷 저장은 아직 준비 중입니다.`);
        return false;
      }
      window.alert(error.message || "다른 이름으로 저장에 실패했습니다.");
      return false;
    } finally {
      saveAsButton.removeAttribute("disabled");
    }
  };

  const doExport = async () => {
    exportButton.setAttribute("disabled", "true");
    try {
      const currentContent = getEditorText(editor);
      const result = await filesApi.exportDocument({
        targetFormat: "txt",
        content: currentContent,
        sourceFilePath: meta.filePath || null,
        suggestedName: meta.title || "Untitled",
      });

      if (result?.canceled) {
        syncStatus("내보내기를 취소했습니다.");
        return false;
      }
      syncStatus(`내보내기 완료: ${result.outputPath || result.filePath}`);
      return true;
    } catch (error) {
      if (error?.code === "NOT_SUPPORTED_FORMAT") {
        window.alert(`${String(error.format || "unknown").toUpperCase()} 내보내기는 아직 준비 중입니다.`);
        return false;
      }
      window.alert(error.message || "내보내기에 실패했습니다.");
      return false;
    } finally {
      exportButton.removeAttribute("disabled");
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

  exportButton.addEventListener("click", doExport);
  saveButton.addEventListener("click", doSave);
  saveAsButton.addEventListener("click", doSaveAs);
  editor.addEventListener("input", onInput);
  editor.addEventListener("paste", onPaste);
  editor.addEventListener("keydown", onKeyDown);

  return {
    cleanup: () => {
      exportButton.removeEventListener("click", doExport);
      saveButton.removeEventListener("click", doSave);
      saveAsButton.removeEventListener("click", doSaveAs);
      editor.removeEventListener("input", onInput);
      editor.removeEventListener("paste", onPaste);
      editor.removeEventListener("keydown", onKeyDown);
      unsubscribeSettings();
      modeController.destroy();
    },
    isDirty: () => getEditorText(editor) !== savedContent,
    save: doSave,
    getTitle: () => meta.title || "Untitled",
  };
}
