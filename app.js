const app = document.getElementById("app");

const CONDITION_KEY = "hci_reader_condition";
const THEME_KEY = "hci_reader_theme";

const VALID_CONDITIONS = ["A", "B", "C", "D"];
const VALID_THEMES = ["light", "dark"];

const CONDITION_SHORT_LABEL = {
  A: "A(기본)",
  B: "B(밑줄 안내)",
  C: "C(줄 강조)",
  D: "D(키보드 줄 강조)",
};

const state = {
  screenCleanup: null,
  settingsModal: null,
  settingsListeners: new Set(),
};

const campusDocFilesApi = window.campusDoc?.files ?? null;
const isElectronDesktop = Boolean(campusDocFilesApi);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTimeForDisplay(isoString) {
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

function isLikelyDocId(value) {
  return typeof value === "string" && /^[a-z0-9-]{8,64}$/i.test(value);
}

function getCondition() {
  const raw = localStorage.getItem(CONDITION_KEY);
  return VALID_CONDITIONS.includes(raw) ? raw : "A";
}

function setCondition(next) {
  const value = VALID_CONDITIONS.includes(next) ? next : "A";
  localStorage.setItem(CONDITION_KEY, value);
  notifySettingsChanged();
  return value;
}

function getTheme() {
  const raw = localStorage.getItem(THEME_KEY);
  return VALID_THEMES.includes(raw) ? raw : "dark";
}

function applyTheme(theme) {
  const value = VALID_THEMES.includes(theme) ? theme : "dark";
  document.body.dataset.theme = value;
  return value;
}

function setTheme(next) {
  const value = applyTheme(next);
  localStorage.setItem(THEME_KEY, value);
  notifySettingsChanged();
  return value;
}

function subscribeSettings(listener) {
  state.settingsListeners.add(listener);
  return () => {
    state.settingsListeners.delete(listener);
  };
}

function notifySettingsChanged() {
  const payload = {
    condition: getCondition(),
    theme: getTheme(),
  };

  state.settingsListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // ignore listener errors and keep the app responsive
    }
  });
}

function renderTopbar(leadingHtml = "", { showSettingsButton = true } = {}) {
  return `
    <header class="topbar">
      <div class="topbar-leading">${leadingHtml}</div>
      <div class="topbar-actions">
        ${
          showSettingsButton
            ? '<button class="topbar-action" type="button" id="open-settings-button">설정</button>'
            : ""
        }
      </div>
    </header>
  `;
}

function renderScreen(contentHtml, { screenClass = "", leadingHtml = "", showSettingsButton = true } = {}) {
  return `
    <section class="screen ${screenClass}">
      ${renderTopbar(leadingHtml, { showSettingsButton })}
      ${contentHtml}
    </section>
  `;
}

function bindTopbarActions() {
  const settingsButton = app.querySelector("#open-settings-button");
  if (settingsButton) {
    settingsButton.addEventListener("click", openSettingsModal);
  }
}

function ensureSettingsModal() {
  if (state.settingsModal) {
    return state.settingsModal;
  }

  const modeOptions = VALID_CONDITIONS.map((mode) => {
    return `
      <label class="radio-item">
        <input type="radio" name="settings-condition" value="${mode}">
        <span class="radio-label">
          <span class="radio-label__text">${escapeHtml(CONDITION_SHORT_LABEL[mode] || mode)}</span>
          <span class="radio-label__check" aria-hidden="true">✓</span>
        </span>
      </label>
    `;
  }).join("");

  const node = document.createElement("div");
  node.className = "settings-modal hidden";
  node.innerHTML = `
    <div class="settings-modal__backdrop" data-close-settings="true"></div>
    <section class="settings-modal__panel" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
      <header class="settings-modal__header">
        <h2 id="settings-modal-title">앱 설정</h2>
        <button class="button" type="button" data-close-settings="true">닫기</button>
      </header>

      <section class="settings-block" aria-label="테마 설정">
        <p class="settings-block__title">Theme</p>
        <div class="settings-inline-options" role="radiogroup" aria-label="테마 선택">
          <label><input type="radio" name="settings-theme" value="dark"> Dark</label>
          <label><input type="radio" name="settings-theme" value="light"> Light</label>
        </div>
      </section>

      <section class="settings-block" aria-label="읽기 모드 설정">
        <p class="settings-block__title">Reading Mode</p>
        <div class="radio-group" role="radiogroup" aria-label="읽기 모드 선택">
          ${modeOptions}
        </div>
      </section>
    </section>
  `;

  document.body.append(node);
  state.settingsModal = node;

  node.querySelectorAll('[data-close-settings="true"]').forEach((closeTarget) => {
    closeTarget.addEventListener("click", closeSettingsModal);
  });

  node.querySelectorAll('input[name="settings-theme"]').forEach((input) => {
    input.addEventListener("change", (event) => {
      setTheme(event.target.value);
    });
  });

  node.querySelectorAll('input[name="settings-condition"]').forEach((input) => {
    input.addEventListener("change", (event) => {
      setCondition(event.target.value);
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.settingsModal && !state.settingsModal.classList.contains("hidden")) {
      closeSettingsModal();
    }
  });

  return node;
}

function syncSettingsModalInputs() {
  const modal = ensureSettingsModal();
  const currentTheme = getTheme();
  const currentCondition = getCondition();

  modal.querySelectorAll('input[name="settings-theme"]').forEach((input) => {
    input.checked = input.value === currentTheme;
  });

  modal.querySelectorAll('input[name="settings-condition"]').forEach((input) => {
    input.checked = input.value === currentCondition;
  });
}

function openSettingsModal() {
  const modal = ensureSettingsModal();
  syncSettingsModalInputs();
  modal.classList.remove("hidden");

  const focusTarget = modal.querySelector('input[name="settings-condition"]:checked') || modal.querySelector("button");
  if (focusTarget) {
    focusTarget.focus();
  }
}

function closeSettingsModal() {
  if (!state.settingsModal) {
    return;
  }

  state.settingsModal.classList.add("hidden");
}

function teardownScreenSession() {
  if (typeof state.screenCleanup === "function") {
    state.screenCleanup();
  }
  state.screenCleanup = null;
}

function renderLoading(message) {
  app.innerHTML = renderScreen(
    `
    <h1>CampusDoc</h1>
    <p class="muted">${escapeHtml(message)}</p>
  `,
    {
      screenClass: "status-screen",
      leadingHtml: '<span class="app-mark">CampusDoc Desktop</span>',
    }
  );
  bindTopbarActions();
}

function renderError(title, message) {
  app.innerHTML = renderScreen(
    `
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">${escapeHtml(message)}</p>
    <p><a class="button" href="#/start">시작 화면으로</a></p>
  `,
    {
      screenClass: "error-screen",
      leadingHtml: '<span class="app-mark">CampusDoc Desktop</span>',
    }
  );
  bindTopbarActions();
}

function renderElectronOnlyNotice() {
  app.innerHTML = renderScreen(
    `
      <h1>Electron 실행이 필요합니다.</h1>
      <p class="muted">이 앱은 Desktop(Electron) 전용으로 동작합니다.</p>
      <p class="muted">프로젝트 루트에서 <code>npm run dev</code> 또는 <code>npm start</code>로 실행해 주세요.</p>
    `,
    {
      screenClass: "status-screen",
      leadingHtml: '<span class="app-mark">CampusDoc Desktop</span>',
    }
  );
  bindTopbarActions();
}

function routeFromHash() {
  const hash = window.location.hash;
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

function renderStartHome() {
  app.innerHTML = renderScreen(
    `
    <section class="home-grid" aria-label="시작 옵션">
      <a class="home-card home-card-action" href="#/browse">
        <span class="home-card-title">문서 작업 시작</span>
      </a>
    </section>
  `,
    {
      screenClass: "home-screen",
      leadingHtml: '<span class="app-mark">CampusDoc Desktop</span>',
    }
  );

  bindTopbarActions();
}

function renderDesktopList(docs) {
  const items =
    docs.length === 0
      ? '<p class="muted">아직 문서가 없습니다. TXT를 가져오거나 새 문서를 만들어 주세요.</p>'
      : `<ul class="doc-list">${docs
          .map((doc) => {
            return `
              <li class="doc-list-item">
                <a class="doc-open-link" href="#/file/${encodeURIComponent(doc.docId)}">${escapeHtml(doc.title)}</a>
                <p class="doc-list-meta">수정: ${escapeHtml(formatDateTimeForDisplay(doc.updatedAt))}</p>
              </li>
            `;
          })
          .join("")}</ul>`;

  app.innerHTML = renderScreen(
    `
      <section class="browse-layout">
        <section class="browse-section">
          <header class="browse-header">
            <p class="browse-file-guide">내 작업 문서</p>
            <div class="desktop-actions">
              <button class="button" type="button" id="desktop-import">TXT 가져오기</button>
              <button class="button button-primary" type="button" id="desktop-create">새 문서</button>
            </div>
          </header>
          ${items}
        </section>
      </section>
    `,
    {
      screenClass: "browse-screen",
      leadingHtml: '<a class="browse-home-button" href="#/start">시작으로</a>',
    }
  );

  bindTopbarActions();

  const importButton = app.querySelector("#desktop-import");
  if (importButton) {
    importButton.addEventListener("click", async () => {
      importButton.setAttribute("disabled", "true");
      try {
        const imported = await campusDocFilesApi.importTxt();
        if (imported && imported.docId) {
          window.location.hash = `#/file/${encodeURIComponent(imported.docId)}`;
          return;
        }
        renderRoute();
      } catch (error) {
        renderError("TXT 가져오기 실패", error.message || "파일을 가져오지 못했습니다.");
      } finally {
        importButton.removeAttribute("disabled");
      }
    });
  }

  const createButton = app.querySelector("#desktop-create");
  if (createButton) {
    createButton.addEventListener("click", async () => {
      const titleInput = window.prompt("새 문서 제목을 입력해 주세요.", "새 문서");
      if (titleInput === null) {
        return;
      }

      createButton.setAttribute("disabled", "true");
      try {
        const created = await campusDocFilesApi.createDoc(titleInput);
        if (created?.docId) {
          window.location.hash = `#/file/${encodeURIComponent(created.docId)}`;
          return;
        }
        renderRoute();
      } catch (error) {
        renderError("문서 생성 실패", error.message || "새 문서를 만들지 못했습니다.");
      } finally {
        createButton.removeAttribute("disabled");
      }
    });
  }
}

function parsePixel(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readTextAreaMetrics(textarea, caretPos) {
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const styleProps = [
    "boxSizing",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "lineHeight",
    "textTransform",
    "textIndent",
    "textAlign",
    "wordSpacing",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderStyle",
    "whiteSpace",
    "wordBreak",
    "overflowWrap",
  ];

  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.height = "auto";
  mirror.style.overflow = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.width = `${textarea.clientWidth}px`;

  styleProps.forEach((prop) => {
    mirror.style[prop] = computed[prop];
  });

  const safePos = Math.max(0, Math.min(caretPos, textarea.value.length));
  mirror.textContent = textarea.value.slice(0, safePos);

  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.append(marker);

  document.body.append(mirror);

  const lineHeight = parsePixel(computed.lineHeight, parsePixel(computed.fontSize, 16) * 1.6);
  const caretTop = marker.offsetTop;
  const caretLeft = marker.offsetLeft;

  document.body.removeChild(mirror);

  const paddingTop = parsePixel(computed.paddingTop);
  const paddingRight = parsePixel(computed.paddingRight);
  const paddingBottom = parsePixel(computed.paddingBottom);
  const paddingLeft = parsePixel(computed.paddingLeft);
  const borderTop = parsePixel(computed.borderTopWidth);
  const borderLeft = parsePixel(computed.borderLeftWidth);
  const contentWidth = Math.max(1, textarea.clientWidth - paddingLeft - paddingRight);

  return {
    lineHeight,
    caretTop,
    caretLeft,
    paddingTop,
    paddingBottom,
    paddingLeft,
    borderTop,
    borderLeft,
    contentWidth,
  };
}

function getLineBoundary(text, position) {
  const safePos = Math.max(0, Math.min(position, text.length));
  const start = text.lastIndexOf("\n", Math.max(0, safePos - 1)) + 1;
  let end = text.indexOf("\n", safePos);
  if (end === -1) {
    end = text.length;
  }
  return {
    start,
    end,
    column: safePos - start,
  };
}

function moveCaretByLine(textarea, direction, preferredColumn) {
  const text = textarea.value;
  const current = getLineBoundary(text, textarea.selectionStart ?? 0);

  if (direction < 0) {
    if (current.start <= 0) {
      return false;
    }
    const prevEnd = current.start - 1;
    const prevStart = text.lastIndexOf("\n", Math.max(0, prevEnd - 1)) + 1;
    const prevLength = prevEnd - prevStart;
    const nextPos = prevStart + Math.min(preferredColumn, prevLength);
    textarea.setSelectionRange(nextPos, nextPos);
    return true;
  }

  if (current.end >= text.length) {
    return false;
  }

  const nextStart = current.end + 1;
  let nextEnd = text.indexOf("\n", nextStart);
  if (nextEnd === -1) {
    nextEnd = text.length;
  }
  const nextLength = nextEnd - nextStart;
  const nextPos = nextStart + Math.min(preferredColumn, nextLength);
  textarea.setSelectionRange(nextPos, nextPos);
  return true;
}

function createEditorModeController(textarea, overlay) {
  let condition = getCondition();
  let rafId = 0;
  let preferredColumn = null;

  function hideOverlay() {
    overlay.style.display = "none";
    overlay.classList.remove("mode-b", "mode-c", "mode-d");
  }

  function ensureCaretInView(metrics) {
    const lineTop = metrics.caretTop;
    const lineBottom = lineTop + metrics.lineHeight;
    const visibleTop = textarea.scrollTop + metrics.paddingTop;
    const visibleBottom = textarea.scrollTop + textarea.clientHeight - metrics.paddingBottom;

    if (lineTop < visibleTop + 8) {
      const target = Math.max(0, lineTop - metrics.paddingTop - metrics.lineHeight);
      textarea.scrollTop = target;
      return;
    }

    if (lineBottom > visibleBottom - 8) {
      const target = Math.max(0, lineBottom + metrics.paddingBottom - textarea.clientHeight + metrics.lineHeight);
      textarea.scrollTop = target;
    }
  }

  function renderOverlay() {
    if (condition === "A" || document.activeElement !== textarea) {
      hideOverlay();
      return;
    }

    const caretPos = textarea.selectionStart ?? 0;
    const metrics = readTextAreaMetrics(textarea, caretPos);
    const relativeTop = metrics.borderTop + metrics.caretTop - textarea.scrollTop;

    if (relativeTop + metrics.lineHeight < 0 || relativeTop > textarea.clientHeight) {
      hideOverlay();
      return;
    }

    overlay.style.display = "block";
    overlay.style.left = `${Math.max(0, metrics.borderLeft + metrics.paddingLeft)}px`;
    overlay.style.width = `${metrics.contentWidth}px`;
    overlay.style.top = `${Math.max(0, relativeTop)}px`;
    overlay.style.height = `${Math.max(8, metrics.lineHeight)}px`;

    overlay.classList.toggle("mode-b", condition === "B");
    overlay.classList.toggle("mode-c", condition === "C");
    overlay.classList.toggle("mode-d", condition === "D");
  }

  function scheduleRender() {
    if (rafId) {
      return;
    }
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      renderOverlay();
    });
  }

  function handleArrowJump(event, direction) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return;
    }

    if (condition !== "D") {
      return;
    }

    event.preventDefault();

    if (preferredColumn == null) {
      preferredColumn = getLineBoundary(textarea.value, textarea.selectionStart ?? 0).column;
    }

    const moved = moveCaretByLine(textarea, direction, preferredColumn);
    if (!moved) {
      return;
    }

    const metrics = readTextAreaMetrics(textarea, textarea.selectionStart ?? 0);
    ensureCaretInView(metrics);
    scheduleRender();
  }

  function resetPreferredColumn() {
    preferredColumn = null;
  }

  const onInput = () => {
    resetPreferredColumn();
    scheduleRender();
  };
  const onScroll = () => scheduleRender();
  const onSelect = () => {
    resetPreferredColumn();
    scheduleRender();
  };
  const onFocus = () => scheduleRender();
  const onBlur = () => hideOverlay();
  const onPointer = () => {
    resetPreferredColumn();
    scheduleRender();
  };
  const onResize = () => scheduleRender();
  const onKeyDown = (event) => {
    if (event.key === "ArrowUp") {
      handleArrowJump(event, -1);
      return;
    }
    if (event.key === "ArrowDown") {
      handleArrowJump(event, 1);
      return;
    }
    if (condition === "D") {
      resetPreferredColumn();
    }
  };

  textarea.addEventListener("input", onInput);
  textarea.addEventListener("scroll", onScroll);
  textarea.addEventListener("select", onSelect);
  textarea.addEventListener("focus", onFocus);
  textarea.addEventListener("blur", onBlur);
  textarea.addEventListener("click", onPointer);
  textarea.addEventListener("keyup", onPointer);
  textarea.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", onResize);

  scheduleRender();

  return {
    applyCondition(nextCondition) {
      condition = VALID_CONDITIONS.includes(nextCondition) ? nextCondition : "A";
      scheduleRender();
    },
    destroy() {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      textarea.removeEventListener("input", onInput);
      textarea.removeEventListener("scroll", onScroll);
      textarea.removeEventListener("select", onSelect);
      textarea.removeEventListener("focus", onFocus);
      textarea.removeEventListener("blur", onBlur);
      textarea.removeEventListener("click", onPointer);
      textarea.removeEventListener("keyup", onPointer);
      textarea.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      hideOverlay();
    },
  };
}

function renderDesktopEditor(meta, content) {
  const currentCondition = getCondition();

  app.innerHTML = renderScreen(
    `
      <section class="editor-layout">
        <header class="editor-header">
          <div>
            <h1>${escapeHtml(meta.title)}</h1>
            <p class="muted">문서 ID: ${escapeHtml(meta.docId)}</p>
          </div>
          <div class="desktop-actions">
            <button class="button" type="button" id="desktop-export">Export TXT</button>
            <button class="button button-primary" type="button" id="desktop-save">저장</button>
          </div>
        </header>

        <p class="editor-mode-label">현재 읽기 모드: ${escapeHtml(CONDITION_SHORT_LABEL[currentCondition] || currentCondition)}</p>

        <label class="editor-label" for="desktop-editor">내용</label>
        <div class="editor-textarea-wrap">
          <textarea id="desktop-editor" class="editor-textarea" spellcheck="false"></textarea>
          <div id="desktop-line-overlay" class="editor-line-overlay" aria-hidden="true"></div>
        </div>

        <p class="editor-status muted" id="desktop-status"></p>
      </section>
    `,
    {
      screenClass: "reader-screen",
      leadingHtml: '<a class="browse-home-button" href="#/browse">문서 목록으로</a>',
    }
  );

  bindTopbarActions();

  const editor = app.querySelector("#desktop-editor");
  const overlay = app.querySelector("#desktop-line-overlay");
  const saveButton = app.querySelector("#desktop-save");
  const exportButton = app.querySelector("#desktop-export");
  const statusNode = app.querySelector("#desktop-status");
  const modeLabelNode = app.querySelector(".editor-mode-label");
  if (!editor || !overlay || !saveButton || !exportButton || !statusNode || !modeLabelNode) {
    return;
  }

  let savedContent = content;
  editor.value = content;

  const modeController = createEditorModeController(editor, overlay);
  const unsubscribeSettings = subscribeSettings(({ condition }) => {
    modeController.applyCondition(condition);
    modeLabelNode.textContent = `현재 읽기 모드: ${CONDITION_SHORT_LABEL[condition] || condition}`;
  });

  const syncStatus = (message = "") => {
    const dirty = editor.value !== savedContent;
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
      const result = await campusDocFilesApi.saveDoc(meta.docId, editor.value);
      savedContent = editor.value;
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

  saveButton.addEventListener("click", doSave);
  editor.addEventListener("input", () => {
    syncStatus();
  });
  editor.addEventListener("keydown", (event) => {
    const isSaveKey = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
    if (!isSaveKey) {
      return;
    }
    event.preventDefault();
    doSave();
  });

  exportButton.addEventListener("click", async () => {
    exportButton.setAttribute("disabled", "true");
    try {
      const result = await campusDocFilesApi.exportTxt(meta.docId);
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
  });

  state.screenCleanup = () => {
    unsubscribeSettings();
    modeController.destroy();
  };
}

async function renderRoute() {
  teardownScreenSession();

  if (!isElectronDesktop) {
    renderElectronOnlyNotice();
    return;
  }

  const route = routeFromHash();

  if (route.type === "legacy_redirect") {
    window.location.hash = "#/start";
    return;
  }

  if (route.type === "invalid") {
    renderError("잘못된 경로입니다.", "시작 화면으로 이동해 주세요.");
    return;
  }

  if (route.type === "start") {
    renderStartHome();
    return;
  }

  if (route.type === "browse") {
    renderLoading("문서 목록을 불러오는 중...");
    try {
      const docs = await campusDocFilesApi.listDocs();
      renderDesktopList(docs);
    } catch (error) {
      renderError("문서 목록 로딩 실패", error.message || "문서 목록을 가져오지 못했습니다.");
    }
    return;
  }

  if (!isLikelyDocId(route.name)) {
    renderError("잘못된 문서 ID입니다.", "문서 목록으로 돌아가 다시 선택해 주세요.");
    return;
  }

  renderLoading("문서를 여는 중...");
  try {
    const result = await campusDocFilesApi.readDoc(route.name);
    renderDesktopEditor(result.meta, result.content);
  } catch (error) {
    renderError("문서 열기 실패", error.message || "문서를 열 수 없습니다.");
  }
}

window.addEventListener("hashchange", renderRoute);
window.addEventListener("DOMContentLoaded", () => {
  applyTheme(getTheme());
  ensureSettingsModal();

  if (!window.location.hash || window.location.hash === "#/" || window.location.hash === "#") {
    window.location.hash = "#/start";
    return;
  }

  renderRoute();
});
