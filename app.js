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

function normalizeLineBreaks(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

function setEditorText(editor, text) {
  editor.textContent = normalizeLineBreaks(text);
}

function getEditorText(editor) {
  return normalizeLineBreaks(editor.innerText || editor.textContent || "");
}

function getCaretRangeFromPoint(x, y) {
  if (typeof document.caretRangeFromPoint === "function") {
    return document.caretRangeFromPoint(x, y);
  }

  if (typeof document.caretPositionFromPoint === "function") {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos) {
      return null;
    }
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.setEnd(pos.offsetNode, pos.offset);
    return range;
  }

  return null;
}

function getRangeRect(range, preferredY) {
  if (range.collapsed) {
    const collapsedRect = range.getBoundingClientRect();
    if (collapsedRect && collapsedRect.height > 0) {
      return collapsedRect;
    }
  }

  const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
  if (rects.length > 0) {
    if (range.collapsed) {
      return rects[0];
    }

    const pickedOnLine = rects.find((rect) => preferredY >= rect.top && preferredY < rect.bottom);
    const picked =
      pickedOnLine ||
      rects.reduce((best, rect) => {
        if (!best) {
          return rect;
        }
        const bestDist = Math.abs(preferredY - (best.top + best.height / 2));
        const currentDist = Math.abs(preferredY - (rect.top + rect.height / 2));
        return currentDist < bestDist ? rect : best;
      }, null);
    return picked;
  }

  const fallback = range.getBoundingClientRect();
  return fallback.height > 0 ? fallback : null;
}

function estimateLineHeight(element) {
  const styles = window.getComputedStyle(element);
  const raw = styles.lineHeight;
  if (raw.endsWith("px")) {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const fontSize = Number.parseFloat(styles.fontSize) || 16;
  return fontSize * 1.6;
}

function isTextNode(node) {
  return node && node.nodeType === Node.TEXT_NODE;
}

function isRangeInsideElement(range, root) {
  const node = range?.startContainer;
  return Boolean(node && (node === root || root.contains(node)));
}

function getSelectionCaretRangeIn(root) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const node = selection.focusNode || selection.anchorNode;
  if (!node || (node !== root && !root.contains(node))) {
    return null;
  }

  const range = document.createRange();
  try {
    range.setStart(node, selection.focusOffset ?? selection.anchorOffset ?? 0);
    range.collapse(true);
  } catch {
    return null;
  }

  return range;
}

function isCollapsedCaretOnBlankLine(range) {
  if (!range || !range.collapsed) {
    return false;
  }

  const node = range.startContainer;
  const offset = range.startOffset;

  if (isTextNode(node)) {
    const text = node.textContent || "";
    const prevChar = offset > 0 ? text[offset - 1] : null;
    const nextChar = offset < text.length ? text[offset] : null;
    const startsAtLineBoundary = offset === 0 || prevChar === "\n";
    const endsAtLineBoundary = offset === text.length || nextChar === "\n";
    return startsAtLineBoundary && endsAtLineBoundary;
  }

  if (node && node.nodeType === Node.ELEMENT_NODE) {
    const prev = node.childNodes[offset - 1] || null;
    const next = node.childNodes[offset] || null;
    const prevIsBoundary = !prev || (isTextNode(prev) ? /\n$/.test(prev.textContent || "") : prev.nodeName === "BR");
    const nextIsBoundary = !next || (isTextNode(next) ? /^\n/.test(next.textContent || "") : next.nodeName === "BR");
    return prevIsBoundary && nextIsBoundary;
  }

  return false;
}

function getExpandedRect(range, preferredY, root) {
  const direct = getRangeRect(range, preferredY);
  if (direct && direct.width >= 1) {
    return direct;
  }

  const node = range.startContainer;
  const offset = range.startOffset;
  const probe = document.createRange();

  if (isTextNode(node)) {
    const len = node.textContent.length;
    const candidates = [];
    if (offset < len) {
      candidates.push([offset, offset + 1]);
    }
    if (offset > 0) {
      candidates.push([offset - 1, offset]);
    }

    for (const [start, end] of candidates) {
      const sampled = node.textContent.slice(start, end);
      if (sampled === "\n") {
        continue;
      }
      probe.setStart(node, start);
      probe.setEnd(node, end);
      const rect = getRangeRect(probe, preferredY);
      if (rect && rect.width >= 1) {
        return rect;
      }
    }
  }

  if (direct && direct.height > 0) {
    return direct;
  }

  const fallbackRange = getCaretRangeFromPoint(
    root.getBoundingClientRect().left + 4,
    Math.min(root.getBoundingClientRect().bottom - 2, Math.max(root.getBoundingClientRect().top + 2, preferredY))
  );
  if (fallbackRange && isRangeInsideElement(fallbackRange, root)) {
    const rect = getRangeRect(fallbackRange, preferredY);
    if (rect) {
      return rect;
    }
  }

  return direct;
}

function isSameVisualLine(a, b) {
  const midA = a.top + a.height / 2;
  const midB = b.top + b.height / 2;
  const tolerance = Math.max(4, Math.min(a.height, b.height) * 0.7);
  return Math.abs(midA - midB) <= tolerance;
}

function measureLineSpan(seedRect, clientY, root) {
  const textRect = root.getBoundingClientRect();
  const leftLimit = Math.max(textRect.left, 0);
  const rightLimit = textRect.right;
  const step = 4;

  let minLeft = seedRect.left;
  let maxRight = seedRect.right;

  let misses = 0;
  for (let x = seedRect.left - step; x >= leftLimit; x -= step) {
    const probeRange = getCaretRangeFromPoint(x, clientY);
    if (!probeRange || !isRangeInsideElement(probeRange, root)) {
      misses += 1;
      if (misses > 10) {
        break;
      }
      continue;
    }

    const probeRect = getExpandedRect(probeRange, clientY, root);
    if (!probeRect || probeRect.width < 1 || !isSameVisualLine(probeRect, seedRect)) {
      misses += 1;
      if (misses > 10) {
        break;
      }
      continue;
    }

    minLeft = Math.min(minLeft, probeRect.left);
    misses = 0;
  }

  misses = 0;
  for (let x = seedRect.right + step; x <= rightLimit; x += step) {
    const probeRange = getCaretRangeFromPoint(x, clientY);
    if (!probeRange || !isRangeInsideElement(probeRange, root)) {
      misses += 1;
      if (misses > 10) {
        break;
      }
      continue;
    }

    const probeRect = getExpandedRect(probeRange, clientY, root);
    if (!probeRect || probeRect.width < 1 || !isSameVisualLine(probeRect, seedRect)) {
      misses += 1;
      if (misses > 10) {
        break;
      }
      continue;
    }

    maxRight = Math.max(maxRight, probeRect.right);
    misses = 0;
  }

  return {
    left: minLeft,
    right: maxRight,
  };
}

function setSelectionAtRange(range) {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function createEditorModeController(editor, overlay) {
  const surface = overlay.parentElement || editor.parentElement || editor;
  let condition = getCondition();
  let rafId = 0;
  let autoScrollRafId = 0;
  let overlaySuppressedByTyping = false;
  let lastRevealCause = "none";
  const lineState = {
    anchorX: null,
    lastClientY: null,
    lineHeight: estimateLineHeight(editor),
  };
  const pointerState = {
    inside: false,
    x: null,
    y: null,
  };

  function hideOverlay() {
    overlay.style.display = "none";
    overlay.classList.remove("mode-b", "mode-c", "mode-d");
  }

  function stopAutoScroll() {
    if (!autoScrollRafId) {
      return;
    }
    cancelAnimationFrame(autoScrollRafId);
    autoScrollRafId = 0;
  }

  function isSurfaceScrollable() {
    return surface.scrollHeight - surface.clientHeight > 1;
  }

  function getScrollContextRect() {
    if (isSurfaceScrollable()) {
      const rect = surface.getBoundingClientRect();
      return {
        usesWindow: false,
        top: rect.top,
        bottom: rect.bottom,
        height: surface.clientHeight,
      };
    }

    return {
      usesWindow: true,
      top: 0,
      bottom: window.innerHeight,
      height: window.innerHeight,
    };
  }

  function scrollByDelta(delta) {
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.01) {
      return 0;
    }

    if (isSurfaceScrollable()) {
      const before = surface.scrollTop;
      const maxTop = Math.max(0, surface.scrollHeight - surface.clientHeight);
      surface.scrollTop = Math.max(0, Math.min(maxTop, before + delta));
      return surface.scrollTop - before;
    }

    const scroller = document.scrollingElement || document.documentElement;
    const before = window.scrollY;
    const maxTop = Math.max(0, scroller.scrollHeight - window.innerHeight);
    const next = Math.max(0, Math.min(maxTop, before + delta));
    window.scrollTo(0, next);
    return window.scrollY - before;
  }

  function getEdgeAutoScrollDelta(position, size, edgeRatio, minSpeed, maxSpeed) {
    const edge = Math.max(24, Math.min(120, size * edgeRatio));
    const topThreshold = edge;
    const bottomThreshold = size - edge;

    if (position < topThreshold) {
      const ratio = Math.min(1, Math.max(0, (topThreshold - position) / edge));
      return -(minSpeed + (maxSpeed - minSpeed) * ratio);
    }

    if (position > bottomThreshold) {
      const ratio = Math.min(1, Math.max(0, (position - bottomThreshold) / edge));
      return minSpeed + (maxSpeed - minSpeed) * ratio;
    }

    return 0;
  }

  function getBCPointerAutoScrollDelta() {
    if (!(condition === "B" || condition === "C")) {
      return 0;
    }
    if (overlaySuppressedByTyping) {
      return 0;
    }
    if (!pointerState.inside || pointerState.y == null) {
      return 0;
    }

    if (isSurfaceScrollable()) {
      const surfaceRect = surface.getBoundingClientRect();
      const pointerYInSurface = pointerState.y - surfaceRect.top;
      return getEdgeAutoScrollDelta(pointerYInSurface, surface.clientHeight, 0.12, 0.35, 2.2);
    }

    return getEdgeAutoScrollDelta(pointerState.y, window.innerHeight, 0.12, 0.35, 2.2);
  }

  function getDKeyboardAutoScrollDelta() {
    if (condition !== "D") {
      return 0;
    }
    if (overlaySuppressedByTyping || document.activeElement !== editor) {
      return 0;
    }

    const range = getSelectionCaretRangeIn(editor);
    if (!range) {
      return 0;
    }

    const rect = getRangeRect(range, lineState.lastClientY ?? 0);
    if (!rect || rect.height <= 0) {
      return 0;
    }

    if (isSurfaceScrollable()) {
      const surfaceRect = surface.getBoundingClientRect();
      const lineCenterInSurface = rect.top + rect.height / 2 - surfaceRect.top;
      return getEdgeAutoScrollDelta(lineCenterInSurface, surface.clientHeight, 0.18, 0.45, 3.4);
    }

    const lineCenterInViewport = rect.top + rect.height / 2;
    return getEdgeAutoScrollDelta(lineCenterInViewport, window.innerHeight, 0.18, 0.45, 3.4);
  }

  function getAutoScrollDelta() {
    if (condition === "B" || condition === "C") {
      return getBCPointerAutoScrollDelta();
    }
    if (condition === "D") {
      return getDKeyboardAutoScrollDelta();
    }
    return 0;
  }

  function runAutoScrollFrame() {
    autoScrollRafId = 0;
    const delta = getAutoScrollDelta();
    if (Math.abs(delta) < 0.01) {
      return;
    }

    const actual = scrollByDelta(delta);
    if (Math.abs(actual) < 0.01) {
      return;
    }

    scheduleRender();
    autoScrollRafId = requestAnimationFrame(runAutoScrollFrame);
  }

  function refreshAutoScroll() {
    const delta = getAutoScrollDelta();
    if (Math.abs(delta) < 0.01) {
      stopAutoScroll();
      return;
    }
    if (!autoScrollRafId) {
      autoScrollRafId = requestAnimationFrame(runAutoScrollFrame);
    }
  }

  function showOverlayAtRange(range, preserveOnFail = false) {
    if (!isRangeInsideElement(range, editor)) {
      if (!preserveOnFail) {
        hideOverlay();
      }
      return false;
    }

    const preferredY = lineState.lastClientY ?? editor.getBoundingClientRect().top + lineState.lineHeight;
    const directRect = getRangeRect(range, preferredY);
    const rect = getExpandedRect(range, preferredY, editor);
    if (!rect || rect.height <= 0) {
      if (!preserveOnFail) {
        hideOverlay();
      }
      return false;
    }

    const surfaceRect = surface.getBoundingClientRect();
    const textRect = editor.getBoundingClientRect();
    const textLeft = textRect.left - surfaceRect.left + surface.scrollLeft;
    const textRight = textRect.right - surfaceRect.left + surface.scrollLeft;
    const isCollapsedRange = Boolean(range.collapsed);
    const isBlankLineCaret = isCollapsedCaretOnBlankLine(range);
    if (condition === "D" && isCollapsedRange && isBlankLineCaret) {
      // In D mode, a caret on a blank line should not render any background overlay.
      hideOverlay();
      return false;
    }
    const hasCaretOnlyRect = Boolean(directRect && directRect.height > 0 && directRect.width < 1 && rect.width < 1);

    if (condition === "D" && hasCaretOnlyRect) {
      const caretX = lineState.anchorX ?? directRect.left;
      const height = directRect.height || lineState.lineHeight;
      const top = directRect.top - surfaceRect.top + surface.scrollTop;
      const desiredWidth = 18;
      const maxLeft = Math.max(textLeft, textRight - desiredWidth);
      const baseLeft = caretX - surfaceRect.left + surface.scrollLeft - desiredWidth / 2;
      const clampedLeft = Math.min(maxLeft, Math.max(textLeft, baseLeft));
      const finalWidth = Math.max(12, Math.min(desiredWidth, textRight - clampedLeft));

      overlay.style.left = `${Math.max(0, clampedLeft)}px`;
      overlay.style.width = `${finalWidth}px`;
      overlay.style.top = `${Math.max(0, top)}px`;
      overlay.style.height = `${Math.max(8, height)}px`;
      overlay.style.display = "block";

      overlay.classList.toggle("mode-b", condition === "B");
      overlay.classList.toggle("mode-c", condition === "C");
      overlay.classList.toggle("mode-d", condition === "D");

      lineState.anchorX = caretX;
      lineState.lastClientY = directRect.top + directRect.height / 2;
      lineState.lineHeight = Math.max(lineState.lineHeight, height);
      return true;
    }

    const seedRect =
      rect.width >= 1
        ? rect
        : {
            ...rect,
            right: rect.left + 1,
            width: 1,
          };
    const samplingY = seedRect.top + seedRect.height / 2;
    const span = measureLineSpan(seedRect, samplingY, editor);
    const spanLeft = span.left;
    const spanRight = span.right;

    const top = seedRect.top - surfaceRect.top + surface.scrollTop;
    const left = spanLeft - surfaceRect.left + surface.scrollLeft;
    const height = seedRect.height || lineState.lineHeight;

    const paddedLeft = Math.max(textLeft, left - 1);
    const paddedRight = Math.min(textRight, spanRight - surfaceRect.left + surface.scrollLeft + 1);
    const finalWidth = Math.max(18, paddedRight - paddedLeft);

    overlay.style.left = `${Math.max(0, paddedLeft)}px`;
    overlay.style.width = `${finalWidth}px`;
    overlay.style.top = `${Math.max(0, top)}px`;
    overlay.style.height = `${Math.max(8, height)}px`;
    overlay.style.display = "block";

    overlay.classList.toggle("mode-b", condition === "B");
    overlay.classList.toggle("mode-c", condition === "C");
    overlay.classList.toggle("mode-d", condition === "D");

    lineState.anchorX = seedRect.left + Math.max(4, Math.min(12, finalWidth / 2));
    lineState.lastClientY = samplingY;
    lineState.lineHeight = Math.max(lineState.lineHeight, seedRect.height || lineState.lineHeight);
    return true;
  }

  function updateOverlayFromPoint(clientX, clientY, preserveOnFail = false) {
    const textRect = editor.getBoundingClientRect();
    if (textRect.height <= 0 || textRect.width <= 0) {
      if (!preserveOnFail) {
        hideOverlay();
      }
      return false;
    }

    const safeX = Math.min(textRect.right - 1, Math.max(textRect.left + 1, clientX));
    const safeY = Math.min(textRect.bottom - 1, Math.max(textRect.top + 1, clientY));
    const range = getCaretRangeFromPoint(safeX, safeY);
    if (!range || !isRangeInsideElement(range, editor)) {
      if (!preserveOnFail) {
        hideOverlay();
      }
      return false;
    }

    range.collapse(true);
    lineState.anchorX = safeX;
    lineState.lastClientY = safeY;
    return showOverlayAtRange(range, preserveOnFail);
  }

  function renderOverlay() {
    if (condition === "A") {
      overlaySuppressedByTyping = false;
      lastRevealCause = "none";
      stopAutoScroll();
      hideOverlay();
      return false;
    }

    if (overlaySuppressedByTyping) {
      stopAutoScroll();
      hideOverlay();
      return false;
    }

    if (condition === "B" || condition === "C") {
      if (!pointerState.inside || pointerState.x == null || pointerState.y == null) {
        hideOverlay();
        return false;
      }
      return updateOverlayFromPoint(pointerState.x, pointerState.y);
    }

    if (document.activeElement !== editor) {
      hideOverlay();
      return false;
    }

    const range = getSelectionCaretRangeIn(editor);
    if (!range) {
      hideOverlay();
      return false;
    }

    return showOverlayAtRange(range);
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

  function ensureCaretVisible() {
    const range = getSelectionCaretRangeIn(editor);
    if (!range) {
      return;
    }

    const rect = getRangeRect(range, lineState.lastClientY ?? 0);
    if (!rect || rect.height <= 0) {
      return;
    }

    const contextRect = getScrollContextRect();
    const lineTop = rect.top - contextRect.top;
    const lineBottom = rect.bottom - contextRect.top;
    const margin = 20;

    if (lineTop < margin) {
      scrollByDelta(lineTop - margin);
      return;
    }

    if (lineBottom > contextRect.height - margin) {
      scrollByDelta(lineBottom - (contextRect.height - margin));
    }
  }

  function moveCaretByVisualLine(direction) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return false;
    }

    if (typeof selection.modify === "function") {
      selection.modify("move", direction < 0 ? "backward" : "forward", "line");
      return Boolean(getSelectionCaretRangeIn(editor));
    }

    const baseRange = getSelectionCaretRangeIn(editor);
    if (!baseRange) {
      return false;
    }

    const preferredY = lineState.lastClientY ?? editor.getBoundingClientRect().top + lineState.lineHeight;
    const baseRect = getExpandedRect(baseRange, preferredY, editor);
    if (!baseRect) {
      return false;
    }

    let editorRect = editor.getBoundingClientRect();
    const x = lineState.anchorX ?? baseRect.left + 6;
    let probeY = baseRect.top + baseRect.height / 2 + direction * lineState.lineHeight;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const safeY = Math.min(editorRect.bottom - 4, Math.max(editorRect.top + 4, probeY));
      const probeRange = getCaretRangeFromPoint(x, safeY);
      if (probeRange && isRangeInsideElement(probeRange, editor)) {
        probeRange.collapse(true);
        setSelectionAtRange(probeRange);
        return true;
      }

      const actual = scrollByDelta(direction * lineState.lineHeight);
      if (actual === 0) {
        break;
      }
      editorRect = editor.getBoundingClientRect();
      probeY += direction * lineState.lineHeight;
    }

    return false;
  }

  const onInput = () => {
    lineState.lineHeight = estimateLineHeight(editor);
    if (condition !== "A") {
      overlaySuppressedByTyping = true;
      lastRevealCause = "none";
      stopAutoScroll();
      hideOverlay();
      return;
    }
    scheduleRender();
    refreshAutoScroll();
  };
  const onScroll = () => {
    scheduleRender();
    refreshAutoScroll();
  };
  const onFocus = () => {
    scheduleRender();
    refreshAutoScroll();
  };
  const onBlur = () => {
    scheduleRender();
    refreshAutoScroll();
  };
  const onPointer = () => {
    scheduleRender();
    refreshAutoScroll();
  };
  const onResize = () => {
    scheduleRender();
    refreshAutoScroll();
  };
  const onWindowScroll = () => {
    scheduleRender();
    refreshAutoScroll();
  };
  const onMouseMove = (event) => {
    pointerState.inside = true;
    pointerState.x = event.clientX;
    pointerState.y = event.clientY;
    if (condition === "B" || condition === "C") {
      overlaySuppressedByTyping = false;
      lastRevealCause = "pointer";
      updateOverlayFromPoint(event.clientX, event.clientY);
      refreshAutoScroll();
    }
  };
  const onMouseEnter = (event) => {
    pointerState.inside = true;
    pointerState.x = event.clientX;
    pointerState.y = event.clientY;
    scheduleRender();
    refreshAutoScroll();
  };
  const onMouseLeave = () => {
    pointerState.inside = false;
    pointerState.x = null;
    pointerState.y = null;
    stopAutoScroll();
    if (condition === "B" || condition === "C") {
      hideOverlay();
    }
  };
  const onSelectionChange = () => {
    if (condition === "D" && document.activeElement !== editor) {
      scheduleRender();
      refreshAutoScroll();
      return;
    }
    if (condition === "D") {
      scheduleRender();
      refreshAutoScroll();
    }
  };
  const onKeyDown = (event) => {
    const isArrowUp = event.key === "ArrowUp";
    const isArrowDown = event.key === "ArrowDown";
    if (!isArrowUp && !isArrowDown) {
      return;
    }

    if (condition !== "D" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      scheduleRender();
      return;
    }

    event.preventDefault();
    const moved = moveCaretByVisualLine(isArrowUp ? -1 : 1);
    if (moved) {
      ensureCaretVisible();
      overlaySuppressedByTyping = false;
      lastRevealCause = "arrow";
    }
    scheduleRender();
    refreshAutoScroll();
  };

  editor.addEventListener("input", onInput);
  surface.addEventListener("scroll", onScroll);
  editor.addEventListener("focus", onFocus);
  editor.addEventListener("blur", onBlur);
  editor.addEventListener("click", onPointer);
  editor.addEventListener("keyup", onPointer);
  editor.addEventListener("mouseup", onPointer);
  editor.addEventListener("keydown", onKeyDown);
  surface.addEventListener("mousemove", onMouseMove);
  surface.addEventListener("mouseenter", onMouseEnter);
  surface.addEventListener("mouseleave", onMouseLeave);
  document.addEventListener("selectionchange", onSelectionChange);
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onWindowScroll, { passive: true });

  scheduleRender();

  return {
    applyCondition(nextCondition) {
      condition = VALID_CONDITIONS.includes(nextCondition) ? nextCondition : "A";
      if (condition === "A") {
        overlaySuppressedByTyping = false;
        lastRevealCause = "none";
      }
      scheduleRender();
      refreshAutoScroll();
    },
    destroy() {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      stopAutoScroll();
      editor.removeEventListener("input", onInput);
      surface.removeEventListener("scroll", onScroll);
      editor.removeEventListener("focus", onFocus);
      editor.removeEventListener("blur", onBlur);
      editor.removeEventListener("click", onPointer);
      editor.removeEventListener("keyup", onPointer);
      editor.removeEventListener("mouseup", onPointer);
      editor.removeEventListener("keydown", onKeyDown);
      surface.removeEventListener("mousemove", onMouseMove);
      surface.removeEventListener("mouseenter", onMouseEnter);
      surface.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onWindowScroll);
      hideOverlay();
    },
  };
}

function renderDesktopEditor(meta, content) {
  app.innerHTML = renderScreen(
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

  const editor = app.querySelector("#desktop-editor");
  const overlay = app.querySelector("#desktop-line-overlay");
  const saveButton = app.querySelector("#desktop-save");
  const exportButton = app.querySelector("#desktop-export");
  const statusNode = app.querySelector("#desktop-status");
  if (!editor || !overlay || !saveButton || !exportButton || !statusNode) {
    return;
  }

  let savedContent = normalizeLineBreaks(content);
  setEditorText(editor, savedContent);
  if (editor.contentEditable !== "plaintext-only") {
    editor.contentEditable = "true";
  }
  savedContent = getEditorText(editor);

  const modeController = createEditorModeController(editor, overlay);
  const unsubscribeSettings = subscribeSettings(({ condition }) => {
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
      const result = await campusDocFilesApi.saveDoc(meta.docId, currentContent);
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
  };
  exportButton.addEventListener("click", onExport);

  state.screenCleanup = () => {
    saveButton.removeEventListener("click", doSave);
    exportButton.removeEventListener("click", onExport);
    editor.removeEventListener("input", onInput);
    editor.removeEventListener("paste", onPaste);
    editor.removeEventListener("keydown", onKeyDown);
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
