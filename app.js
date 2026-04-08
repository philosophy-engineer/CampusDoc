const app = document.getElementById("app");

const CONDITION_KEY = "hci_reader_condition";
const THEME_KEY = "hci_reader_theme";

const VALID_CONDITIONS = ["A", "B", "C", "D"];
const VALID_THEMES = ["light", "dark"];

const CONDITION_SHORT_LABEL = {
  A: "A(기본 읽기)",
  B: "B(밑줄 안내)",
  C: "C(줄 강조)",
  D: "D(키보드 이동)",
};

const state = {
  manifest: null,
  manifestPromise: null,
  readerCleanup: null,
};

function isSafeTxtFilename(name) {
  return typeof name === "string" && /^[^/\\]+\.txt$/i.test(name);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatFilenameForDisplay(name) {
  return String(name).replace(/\.txt$/i, "").replaceAll("-", " ");
}

function getCondition() {
  const raw = localStorage.getItem(CONDITION_KEY);
  return VALID_CONDITIONS.includes(raw) ? raw : "A";
}

function setCondition(next) {
  const value = VALID_CONDITIONS.includes(next) ? next : "A";
  localStorage.setItem(CONDITION_KEY, value);
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
}

function renderTopbar(leadingHtml = "", { showThemeToggle = true } = {}) {
  const theme = applyTheme(getTheme());
  const value = theme === "dark" ? "Dark" : "Light";
  return `
    <header class="topbar">
      <div class="topbar-leading">${leadingHtml}</div>
      ${
        showThemeToggle
          ? `<button class="theme-toggle" type="button" id="theme-toggle" aria-pressed="${theme === "dark"}">
              <span class="theme-toggle__value">${value}</span>
            </button>`
          : ""
      }
    </header>
  `;
}

function renderScreen(contentHtml, { screenClass = "", leadingHtml = "", showThemeToggle = true } = {}) {
  return `
    <section class="screen ${screenClass}">
      ${renderTopbar(leadingHtml, { showThemeToggle })}
      ${contentHtml}
    </section>
  `;
}

function bindThemeToggle() {
  const toggle = app.querySelector("#theme-toggle");
  if (!toggle) {
    return;
  }

  const valueNode = toggle.querySelector(".theme-toggle__value");

  const syncLabel = () => {
    const current = applyTheme(getTheme());
    const next = current === "dark" ? "light" : "dark";
    const currentText = current === "dark" ? "Dark" : "Light";
    const nextTextKorean = next === "dark" ? "다크" : "라이트";

    if (valueNode) {
      valueNode.textContent = currentText;
    }
    toggle.setAttribute("aria-pressed", String(current === "dark"));
    toggle.setAttribute("aria-label", `현재 ${currentText} 모드. 클릭하면 ${nextTextKorean} 모드로 전환됩니다.`);
  };

  syncLabel();

  toggle.addEventListener("click", () => {
    const next = getTheme() === "dark" ? "light" : "dark";
    setTheme(next);
    syncLabel();
  });
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

function teardownReaderSession() {
  if (typeof state.readerCleanup === "function") {
    state.readerCleanup();
    state.readerCleanup = null;
  }
}

function renderLoading(message, { showThemeToggle = true } = {}) {
  app.innerHTML = renderScreen(
    `
    <h1>CampusDoc Reader</h1>
    <p class="muted">${escapeHtml(message)}</p>
  `,
    {
      screenClass: "status-screen",
      leadingHtml: '<span class="app-mark">CampusDoc TXT Reader</span>',
      showThemeToggle,
    }
  );
  bindThemeToggle();
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
      leadingHtml: '<span class="app-mark">CampusDoc TXT Reader</span>',
    }
  );
  bindThemeToggle();
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
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
  if (rects.length > 0) {
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

function setupConditionInteraction(readerScroll, readerText, lineOverlay, condition, { onArrow } = {}) {
  const lineState = {
    anchorX: null,
    lastClientY: null,
    contentTop: null,
    lineHeight: estimateLineHeight(readerText),
  };
  let dInitFrame1 = 0;
  let dInitFrame2 = 0;

  function hideHighlight() {
    lineOverlay.style.display = "none";
  }

  function isRangeInsideReader(range) {
    const node = range.startContainer;
    return readerText.contains(node) || node === readerText;
  }

  function getExpandedRect(range, clientY) {
    const direct = getRangeRect(range, clientY);
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
        probe.setStart(node, start);
        probe.setEnd(node, end);
        const rect = getRangeRect(probe, clientY);
        if (rect && rect.width >= 1) {
          return rect;
        }
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

  function measureLineSpan(seedRect, clientY) {
    const textRect = readerText.getBoundingClientRect();
    const leftLimit = Math.max(textRect.left, 0);
    const rightLimit = textRect.right;
    const step = 4;

    let minLeft = seedRect.left;
    let maxRight = seedRect.right;

    let misses = 0;
    for (let x = seedRect.left - step; x >= leftLimit; x -= step) {
      const probeRange = getCaretRangeFromPoint(x, clientY);
      if (!probeRange || !isRangeInsideReader(probeRange)) {
        misses += 1;
        if (misses > 10) {
          break;
        }
        continue;
      }

      const probeRect = getExpandedRect(probeRange, clientY);
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
      if (!probeRange || !isRangeInsideReader(probeRange)) {
        misses += 1;
        if (misses > 10) {
          break;
        }
        continue;
      }

      const probeRect = getExpandedRect(probeRange, clientY);
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

  function showHighlightAtRange(range, clientY, preserveOnFail = false) {
    if (!isRangeInsideReader(range)) {
      if (!preserveOnFail) {
        hideHighlight();
      }
      return false;
    }

    const rect = getExpandedRect(range, clientY);
    if (!rect || rect.width < 1) {
      if (!preserveOnFail) {
        hideHighlight();
      }
      return false;
    }

    const samplingY = rect.top + rect.height / 2;
    const span = measureLineSpan(rect, samplingY);
    const spanWidth = Math.max(1, span.right - span.left);

    const scrollRect = readerScroll.getBoundingClientRect();
    const top = rect.top - scrollRect.top + readerScroll.scrollTop;
    const left = span.left - scrollRect.left + readerScroll.scrollLeft;
    const height = rect.height || lineState.lineHeight;
    const textRect = readerText.getBoundingClientRect();
    const textLeft = textRect.left - scrollRect.left + readerScroll.scrollLeft;
    const textRight = textRect.right - scrollRect.left + readerScroll.scrollLeft;

    const paddedLeft = Math.max(textLeft, left - 1);
    const paddedRight = Math.min(textRight, left + spanWidth + 1);
    const finalWidth = Math.max(1, paddedRight - paddedLeft);

    lineOverlay.style.left = `${Math.max(0, paddedLeft)}px`;
    lineOverlay.style.width = `${finalWidth}px`;
    lineOverlay.style.top = `${Math.max(0, top)}px`;
    lineOverlay.style.height = `${Math.max(8, height)}px`;
    lineOverlay.style.display = "block";

    lineState.anchorX = lineState.anchorX ?? rect.left + 6;
    lineState.lastClientY = rect.top + rect.height / 2;
    lineState.contentTop = top;

    return true;
  }

  function updateHighlightFromPoint(clientX, clientY, preserveOnFail = false) {
    const textRect = readerText.getBoundingClientRect();
    if (textRect.height <= 0) {
      if (!preserveOnFail) {
        hideHighlight();
      }
      return false;
    }

    const minTextY = textRect.top + 1;
    const maxTextY = textRect.bottom - 1;
    const safeY = maxTextY > minTextY ? Math.min(maxTextY, Math.max(minTextY, clientY)) : clientY;

    const range = getCaretRangeFromPoint(clientX, safeY);
    if (!range) {
      if (!preserveOnFail) {
        hideHighlight();
      }
      return false;
    }

    const node = range.startContainer;
    if (!readerText.contains(node) && node !== readerText) {
      if (!preserveOnFail) {
        hideHighlight();
      }
      return false;
    }

    lineState.anchorX = clientX;
    return showHighlightAtRange(range, safeY, preserveOnFail);
  }

  function scrollPageBy(deltaY) {
    if (!Number.isFinite(deltaY) || deltaY === 0) {
      return 0;
    }

    const before = window.scrollY;
    window.scrollBy(0, deltaY);
    const actual = window.scrollY - before;

    if (actual !== 0 && lineState.lastClientY != null) {
      lineState.lastClientY -= actual;
    }

    return actual;
  }

  function ensureVisible(top, height) {
    const margin = 84;
    const scrollRect = readerScroll.getBoundingClientRect();
    const lineTop = scrollRect.top + top;
    const lineBottom = lineTop + height;
    let delta = 0;

    if (lineTop < margin) {
      delta = lineTop - margin;
    } else if (lineBottom > window.innerHeight - margin) {
      delta = lineBottom - (window.innerHeight - margin);
    }

    if (Math.abs(delta) >= 1) {
      scrollPageBy(delta);
    }
  }

  function stepByArrow(direction) {
    let scrollRect = readerScroll.getBoundingClientRect();
    let textRect = readerText.getBoundingClientRect();
    const x = lineState.anchorX ?? scrollRect.left + 30;

    let baseY;
    if (lineState.lastClientY == null) {
      baseY = scrollRect.top + lineState.lineHeight;
    } else {
      baseY = lineState.lastClientY + direction * lineState.lineHeight;
    }

    const previousTop = lineState.contentTop;
    let minY = Math.max(8, scrollRect.top + 6, textRect.top + 2);
    let maxY = Math.min(window.innerHeight - 8, scrollRect.bottom - 6, textRect.bottom - 2);
    if (minY >= maxY) {
      return;
    }

    let probeY = Math.min(maxY, Math.max(minY, baseY));
    let moved = false;

    for (let attempt = 0; attempt < 14; attempt += 1) {
      const ok = updateHighlightFromPoint(x, probeY, true);
      const progressed =
        previousTop == null || lineState.contentTop == null || Math.abs(lineState.contentTop - previousTop) >= 1;

      if (ok && progressed) {
        moved = true;
        break;
      }

      probeY += direction * lineState.lineHeight;

      if (probeY < minY || probeY > maxY) {
        const actualScroll = scrollPageBy(direction * lineState.lineHeight);
        if (actualScroll === 0) {
          break;
        }
        scrollRect = readerScroll.getBoundingClientRect();
        textRect = readerText.getBoundingClientRect();
        minY = Math.max(8, scrollRect.top + 6, textRect.top + 2);
        maxY = Math.min(window.innerHeight - 8, scrollRect.bottom - 6, textRect.bottom - 2);
        if (minY >= maxY) {
          break;
        }
      }

      probeY = Math.min(maxY, Math.max(minY, probeY));
    }

    if (!moved && lineState.contentTop == null) {
      hideHighlight();
      return;
    }

    if (lineState.contentTop != null) {
      ensureVisible(lineState.contentTop, lineOverlay.getBoundingClientRect().height || lineState.lineHeight);
    }
  }

  function initializeDStartLine() {
    window.scrollTo(0, 0);

    const scrollRect = readerScroll.getBoundingClientRect();
    const textRect = readerText.getBoundingClientRect();
    const x = scrollRect.left + 30;
    const y = Math.max(scrollRect.top + 12, textRect.top + 2);
    updateHighlightFromPoint(x, y, false);
  }

  function scheduleDStartLine() {
    if (dInitFrame1) {
      cancelAnimationFrame(dInitFrame1);
    }
    if (dInitFrame2) {
      cancelAnimationFrame(dInitFrame2);
    }

    dInitFrame1 = requestAnimationFrame(() => {
      dInitFrame1 = 0;
      dInitFrame2 = requestAnimationFrame(() => {
        dInitFrame2 = 0;
        initializeDStartLine();
      });
    });
  }

  const cleanups = [];

  if (condition === "B" || condition === "C") {
    const onMove = (event) => {
      updateHighlightFromPoint(event.clientX, event.clientY);
    };

    readerScroll.addEventListener("mousemove", onMove);
    cleanups.push(() => readerScroll.removeEventListener("mousemove", onMove));
  } else if (condition === "D") {
    const onKeyDown = (event) => {
      if (event.__hciDKeyHandled) {
        return;
      }

      if (event.key === "ArrowUp") {
        event.__hciDKeyHandled = true;
        event.preventDefault();
        if (typeof onArrow === "function") {
          onArrow(-1);
        }
        stepByArrow(-1);
        return;
      }

      if (event.key === "ArrowDown") {
        event.__hciDKeyHandled = true;
        event.preventDefault();
        if (typeof onArrow === "function") {
          onArrow(1);
        }
        stepByArrow(1);
        return;
      }

      if (event.key === " " || event.key === "PageUp" || event.key === "PageDown") {
        event.__hciDKeyHandled = true;
        event.preventDefault();
      }
    };

    const onWheel = (event) => {
      event.preventDefault();
    };

    readerScroll.addEventListener("keydown", onKeyDown);
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });

    try {
      readerScroll.focus({ preventScroll: true });
    } catch {
      readerScroll.focus();
    }

    scheduleDStartLine();

    cleanups.push(() => readerScroll.removeEventListener("keydown", onKeyDown));
    cleanups.push(() => window.removeEventListener("keydown", onKeyDown, { capture: true }));
    cleanups.push(() => window.removeEventListener("wheel", onWheel, { capture: true }));
    cleanups.push(() => {
      if (dInitFrame1) {
        cancelAnimationFrame(dInitFrame1);
      }
      if (dInitFrame2) {
        cancelAnimationFrame(dInitFrame2);
      }
    });
  } else {
    hideHighlight();
  }

  const onClickFocus = () => {
    try {
      readerScroll.focus({ preventScroll: true });
    } catch {
      readerScroll.focus();
    }
  };
  readerScroll.addEventListener("click", onClickFocus);
  cleanups.push(() => readerScroll.removeEventListener("click", onClickFocus));

  return () => {
    cleanups.forEach((fn) => fn());
  };
}

function buildReaderBlock({ title, condition, idPrefix = "reader" }) {
  const modeClass = condition === "B" ? "mode-b" : condition === "C" ? "mode-c" : condition === "D" ? "mode-d" : "";
  return `
    <div class="reader-stage">
      <article class="reader-paper">
        <div class="reader-paper-head">
          <h1>${escapeHtml(title)}</h1>
        </div>
        <div class="reader-frame">
          <div class="reader-scroll ${condition === "D" ? "mode-d" : ""}" id="${idPrefix}-scroll" tabindex="0">
            <div class="line-overlay ${modeClass}" id="${idPrefix}-overlay"></div>
            <div class="reader-text" id="${idPrefix}-text"></div>
          </div>
        </div>
      </article>
    </div>
  `;
}

function mountReader({ content, condition, idPrefix = "reader", onArrow }) {
  const readerScroll = app.querySelector(`#${idPrefix}-scroll`);
  const readerText = app.querySelector(`#${idPrefix}-text`);
  const lineOverlay = app.querySelector(`#${idPrefix}-overlay`);

  if (!readerScroll || !readerText || !lineOverlay) {
    return () => {};
  }

  readerText.textContent = content;
  return setupConditionInteraction(readerScroll, readerText, lineOverlay, condition, { onArrow });
}

function renderStartHome() {
  app.innerHTML = renderScreen(
    `
    <section class="home-grid" aria-label="시작 옵션">
      <a class="home-card home-card-action" href="#/browse">
        <span class="home-card-title">기본 사용</span>
      </a>
    </section>
  `,
    {
      screenClass: "home-screen",
      leadingHtml: "",
    }
  );
  bindThemeToggle();
}

function renderList(files) {
  const current = getCondition();
  const items =
    files.length === 0
      ? '<p class="muted">표시할 txt 파일이 없습니다.</p>'
      : `<ul class="file-list">${files
          .map((name) => {
            const encoded = encodeURIComponent(name);
            const displayName = formatFilenameForDisplay(name);
            return `<li><a class="file-link" href="#/file/${encoded}">${escapeHtml(displayName)}</a></li>`;
          })
          .join("")}</ul>`;

  app.innerHTML = renderScreen(
    `
    <section class="browse-layout">
      <section class="browse-section">
        <fieldset class="controls">
          <legend>읽기 모드 선택</legend>
          <div class="radio-group">
            ${VALID_CONDITIONS.map(
              (mode) => `
                <label class="radio-item">
                  <input type="radio" name="condition" value="${mode}" ${current === mode ? "checked" : ""}>
                  <span class="radio-label">
                    <span class="radio-label__text">${escapeHtml(CONDITION_SHORT_LABEL[mode] || mode)}</span>
                    <span class="radio-label__check" aria-hidden="true">✓</span>
                  </span>
                </label>
              `
            ).join("")}
          </div>
        </fieldset>

        <p class="browse-file-guide">읽을 파일 선택</p>
        ${items}
      </section>
    </section>
  `,
    {
      screenClass: "browse-screen",
      leadingHtml: '<a class="browse-home-button" href="#/start">시작으로</a>',
    }
  );
  bindThemeToggle();

  app.querySelectorAll('input[name="condition"]').forEach((radio) => {
    radio.addEventListener("change", (event) => {
      const value = event.target.value;
      setCondition(value);
      renderList(files);
    });
  });
}

function renderBasicReader(name, content, condition) {
  app.innerHTML = renderScreen(
    `
    ${buildReaderBlock({
      title: formatFilenameForDisplay(name),
      condition,
      idPrefix: "basic-reader",
    })}
  `,
    {
      screenClass: "reader-screen",
      leadingHtml: '<a class="browse-home-button" href="#/start">시작으로</a>',
    }
  );
  bindThemeToggle();

  state.readerCleanup = mountReader({
    content,
    condition,
    idPrefix: "basic-reader",
  });
}

async function loadManifest() {
  if (state.manifest) {
    return state.manifest;
  }

  if (!state.manifestPromise) {
    state.manifestPromise = fetch("./files/manifest.json", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`manifest 요청 실패 (${res.status})`);
        }
        const data = await res.json();
        if (!data || !Array.isArray(data.files)) {
          throw new Error("manifest 형식이 올바르지 않습니다. (files 배열 필요)");
        }
        const sanitized = [...new Set(data.files.filter(isSafeTxtFilename))];
        state.manifest = sanitized;
        return sanitized;
      })
      .catch((error) => {
        state.manifestPromise = null;
        throw error;
      });
  }

  return state.manifestPromise;
}

async function loadTxtFile(name) {
  const res = await fetch(`./files/${encodeURIComponent(name)}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`파일을 불러오지 못했습니다. (${res.status})`);
  }
  return res.text();
}

async function renderRoute() {
  teardownReaderSession();

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

  renderLoading("로딩 중...");

  let files;
  try {
    files = await loadManifest();
  } catch (error) {
    renderError("목록을 불러올 수 없습니다.", error.message);
    return;
  }

  if (route.type === "browse") {
    renderList(files);
    return;
  }

  if (!isSafeTxtFilename(route.name)) {
    renderError("잘못된 파일명입니다.", "요청한 파일명을 확인해 주세요.");
    return;
  }

  if (!files.includes(route.name)) {
    renderError("파일을 찾을 수 없습니다.", "manifest 목록에 없는 파일입니다.");
    return;
  }

  try {
    const text = await loadTxtFile(route.name);
    renderBasicReader(route.name, text, getCondition());
  } catch (error) {
    renderError("파일 로딩 실패", error.message);
  }
}

window.addEventListener("hashchange", renderRoute);
window.addEventListener("DOMContentLoaded", () => {
  applyTheme(getTheme());

  if (!window.location.hash || window.location.hash === "#/" || window.location.hash === "#") {
    window.location.hash = "#/start";
    return;
  }

  renderRoute();
});
