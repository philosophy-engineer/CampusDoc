const app = document.getElementById("app");

const CONDITION_KEY = "hci_reader_condition";
const THEME_KEY = "hci_reader_theme";
const STUDY_SESSION_KEY = "hci_study_session_v1";
const STUDY_RECORDS_KEY = "hci_study_records_v1";
const STUDY_RECORDS_META_KEY = "hci_study_records_meta_v1";

const VALID_CONDITIONS = ["A", "B", "C", "D"];
const VALID_THEMES = ["light", "dark"];

const TEXT_FILES = {
  T0: "서랍에-저녁을-넣어-두었다.txt",
  T1: "수면과-기억-공고화.txt",
  T2: "표준시-제도의-역사.txt",
  T3: "꿀벌-수분과-생태계.txt",
  T4: "도시-열섬-현상.txt",
};

const GROUP_SEQUENCES = {
  "1": [
    { condition: "A", taskId: "T1" },
    { condition: "B", taskId: "T2" },
    { condition: "D", taskId: "T4" },
    { condition: "C", taskId: "T3" },
  ],
  "2": [
    { condition: "B", taskId: "T3" },
    { condition: "C", taskId: "T4" },
    { condition: "A", taskId: "T2" },
    { condition: "D", taskId: "T1" },
  ],
  "3": [
    { condition: "C", taskId: "T1" },
    { condition: "D", taskId: "T2" },
    { condition: "B", taskId: "T4" },
    { condition: "A", taskId: "T3" },
  ],
  "4": [
    { condition: "D", taskId: "T3" },
    { condition: "A", taskId: "T4" },
    { condition: "C", taskId: "T2" },
    { condition: "B", taskId: "T1" },
  ],
};

const CONDITION_INSTRUCTION = {
  A: "조건 A: 기본 읽기 인터페이스입니다. 일반적인 방식으로 본문을 읽어 주세요.",
  B: "조건 B: 마우스를 움직이면 현재 줄 아래에 밑줄이 표시됩니다.",
  C: "조건 C: 마우스를 움직이면 현재 줄이 하이라이트됩니다.",
  D: "조건 D: 위/아래 방향키로 줄 단위 이동합니다. 마우스 휠 스크롤은 제한됩니다.",
};

const CONDITION_SHORT_LABEL = {
  A: "A(기본 읽기)",
  B: "B(밑줄 안내)",
  C: "C(줄 강조)",
  D: "D(키보드 이동)",
};

const LIKERT_ITEMS = [
  "이 인터페이스는 줄을 놓치지 않도록 도와주었다.",
  "이 인터페이스는 내용 이해에 도움이 되었다.",
  "이 인터페이스는 원하는 위치를 다시 찾기 쉽게 해주었다.",
  "이 인터페이스는 읽기 흐름이 자연스러웠다.",
  "이 인터페이스를 조작하는 것은 부담스러웠다.",
  "긴 문서를 읽을 때 이 인터페이스를 사용할 의향이 있다.",
];

const PHASES = {
  TUTORIAL: "tutorial",
  MAIN_READING: "main_reading",
  QUIZ: "quiz",
  LIKERT: "likert",
  FINAL_SURVEY: "final_survey",
  COMPLETED: "completed",
};

const state = {
  manifest: null,
  manifestPromise: null,
  quizzes: null,
  quizzesPromise: null,
  readerCleanup: null,
};

function isSafeTxtFilename(name) {
  return typeof name === "string" && /^[^/\\]+\.txt$/i.test(name);
}

function basename(path) {
  return String(path || "").split("/").pop() || "";
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

function safeParseJSON(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function diffSeconds(startIso, endIso) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }
  return Number(((end - start) / 1000).toFixed(3));
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

function loadStudySession() {
  const raw = localStorage.getItem(STUDY_SESSION_KEY);
  if (!raw) {
    return null;
  }
  const parsed = safeParseJSON(raw, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function saveStudySession(session) {
  localStorage.setItem(STUDY_SESSION_KEY, JSON.stringify(session));
}

function clearStudySession() {
  localStorage.removeItem(STUDY_SESSION_KEY);
}

function loadStudyRecords() {
  const raw = localStorage.getItem(STUDY_RECORDS_KEY);
  const parsed = safeParseJSON(raw, []);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((record) => normalizeStudyRecord(record))
    .filter((record) => record != null);
}

function saveStudyRecords(records) {
  const normalized = Array.isArray(records)
    ? records
        .map((record) => normalizeStudyRecord(record))
        .filter((record) => record != null)
    : [];
  localStorage.setItem(STUDY_RECORDS_KEY, JSON.stringify(normalized));
}

function resetStudyStorage() {
  clearStudySession();
  localStorage.removeItem(STUDY_RECORDS_KEY);
  localStorage.removeItem(STUDY_RECORDS_META_KEY);
}

function normalizeStudyRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }
  return {
    ...record,
    download_count: Number.isFinite(Number(record.download_count)) ? Number(record.download_count) : 0,
    last_downloaded_at: typeof record.last_downloaded_at === "string" ? record.last_downloaded_at : "",
  };
}

function loadStudyRecordsMeta() {
  const raw = localStorage.getItem(STUDY_RECORDS_META_KEY);
  const parsedRaw = safeParseJSON(raw, {});
  const parsed = parsedRaw && typeof parsedRaw === "object" ? parsedRaw : {};
  return {
    total_download_count: Number.isFinite(Number(parsed.total_download_count))
      ? Number(parsed.total_download_count)
      : 0,
    last_bulk_downloaded_at:
      typeof parsed.last_bulk_downloaded_at === "string" ? parsed.last_bulk_downloaded_at : "",
  };
}

function saveStudyRecordsMeta(meta) {
  const next = {
    total_download_count: Number.isFinite(Number(meta?.total_download_count))
      ? Number(meta.total_download_count)
      : 0,
    last_bulk_downloaded_at:
      typeof meta?.last_bulk_downloaded_at === "string" ? meta.last_bulk_downloaded_at : "",
  };
  localStorage.setItem(STUDY_RECORDS_META_KEY, JSON.stringify(next));
}

function incrementTotalDownloadCount({ bulk = false } = {}) {
  const meta = loadStudyRecordsMeta();
  meta.total_download_count += 1;
  if (bulk) {
    meta.last_bulk_downloaded_at = nowIso();
  }
  saveStudyRecordsMeta(meta);
  return meta;
}

function incrementSessionDownloadCount(sessionId) {
  const records = loadStudyRecords();
  const index = records.findIndex((record) => record.session_id === sessionId);
  if (index < 0) {
    return null;
  }

  const next = {
    ...records[index],
    download_count: Number(records[index].download_count || 0) + 1,
    last_downloaded_at: nowIso(),
  };
  records[index] = next;
  saveStudyRecords(records);
  incrementTotalDownloadCount();
  return next;
}

function renderTopbar(leadingHtml = "") {
  const theme = applyTheme(getTheme());
  const value = theme === "dark" ? "Dark" : "Light";
  return `
    <header class="topbar">
      <div class="topbar-leading">${leadingHtml}</div>
      <button class="theme-toggle" type="button" id="theme-toggle" aria-pressed="${theme === "dark"}">
        <span class="theme-toggle__value">${value}</span>
      </button>
    </header>
  `;
}

function renderScreen(contentHtml, { screenClass = "", leadingHtml = "" } = {}) {
  return `
    <section class="screen ${screenClass}">
      ${renderTopbar(leadingHtml)}
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

  if (hash === "#/study") {
    return { type: "study" };
  }

  if (hash === "#/records") {
    return { type: "records" };
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

function renderLoading(message) {
  app.innerHTML = renderScreen(
    `
    <h1>HCI Study Reader</h1>
    <p class="muted">${escapeHtml(message)}</p>
  `,
    {
      screenClass: "status-screen",
      leadingHtml: '<span class="app-mark">HCI TXT Reader</span>',
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
      leadingHtml: '<span class="app-mark">HCI TXT Reader</span>',
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
    const y = Math.max(scrollRect.top + lineState.lineHeight, textRect.top + 2);
    updateHighlightFromPoint(x, y, false);
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
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (typeof onArrow === "function") {
          onArrow(-1);
        }
        stepByArrow(-1);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (typeof onArrow === "function") {
          onArrow(1);
        }
        stepByArrow(1);
        return;
      }

      if (event.key === " " || event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
      }
    };

    const onWheel = (event) => {
      event.preventDefault();
    };

    readerScroll.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });

    try {
      readerScroll.focus({ preventScroll: true });
    } catch {
      readerScroll.focus();
    }

    initializeDStartLine();

    cleanups.push(() => readerScroll.removeEventListener("keydown", onKeyDown));
    cleanups.push(() => window.removeEventListener("wheel", onWheel, { capture: true }));
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

function buildReaderBlock({ title, content, condition, idPrefix = "reader" }) {
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
          <legend>실험 조건 선택</legend>
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
      content,
      condition,
      idPrefix: "basic-reader",
    })}
  `,
    {
      screenClass: "reader-screen",
      leadingHtml: '<a class="button back-button" href="#/browse">뒤로가기</a>',
    }
  );
  bindThemeToggle();

  state.readerCleanup = mountReader({
    content,
    condition,
    idPrefix: "basic-reader",
  });
}

function createStudySession({ participantId, groupId }) {
  const sequence = GROUP_SEQUENCES[groupId];
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const stages = sequence.map((item, idx) => ({
    stageIndex: idx,
    stageNumber: idx + 1,
    condition: item.condition,
    taskId: item.taskId,
    textFile: TEXT_FILES[item.taskId],
    tutorial: {
      popupClosed: false,
      completedAt: null,
    },
    mainReading: {
      startedAt: null,
      completedAt: null,
      readingTimeSec: 0,
      mouseDownMoves: 0,
      mouseUpMoves: 0,
      arrowUpKeydowns: 0,
      arrowDownKeydowns: 0,
    },
    quiz: {
      view: "quiz",
      startedAt: null,
      submittedAt: null,
      answers: {},
      totalQuestions: 0,
      correctCount: 0,
      accuracy: 0,
      problemSolvingTimeSec: 0,
      revisitCount: 0,
      firstRevisitAt: null,
      firstRevisitToSubmitSec: "",
      researchAccuracy: 0,
    },
    likert: {
      responses: LIKERT_ITEMS.map(() => ({ score: null, reason: "" })),
      completedAt: null,
    },
  }));

  return {
    version: 1,
    sessionId,
    participantId,
    groupId,
    startedAt: nowIso(),
    completedAt: null,
    status: "in_progress",
    currentStageIndex: 0,
    currentPhase: PHASES.TUTORIAL,
    stages,
    finalSurvey: null,
  };
}

function persistSession(session) {
  saveStudySession(session);
}

function getActiveSession() {
  const session = loadStudySession();
  if (!session || typeof session !== "object") {
    return null;
  }
  return session;
}

function startStudy(groupId, participantId) {
  const trimmed = String(participantId || "").trim();
  if (!trimmed) {
    window.alert("참가자 ID를 입력해 주세요.");
    return;
  }
  const session = createStudySession({ participantId: trimmed, groupId });
  persistSession(session);
  window.location.hash = "#/study";
}

function renderStartHome() {
  app.innerHTML = renderScreen(
    `
    <section class="home-grid" aria-label="시작 옵션">
      <a class="home-card home-card-action" href="#/browse">
        <span class="home-card-title">기본 사용</span>
      </a>

      <section class="home-card home-card-study" aria-labelledby="study-card-title">
        <h2 id="study-card-title">유저 스터디</h2>
        <label class="field-label" for="participant-id">참가자 ID</label>
        <input id="participant-id" class="text-input" placeholder="예: P001">
        <div class="group-buttons">
          <button class="button" data-group-start="1">그룹 1</button>
          <button class="button" data-group-start="2">그룹 2</button>
          <button class="button" data-group-start="3">그룹 3</button>
          <button class="button" data-group-start="4">그룹 4</button>
        </div>
      </section>

      <a class="home-card home-card-action" href="#/records">
        <span class="home-card-title">유저 스터디 결과</span>
      </a>
    </section>
  `,
    {
      screenClass: "home-screen",
      leadingHtml: "",
    }
  );

  bindThemeToggle();

  const participantInput = app.querySelector("#participant-id");
  app.querySelectorAll("[data-group-start]").forEach((button) => {
    button.addEventListener("click", () => {
      const groupId = button.getAttribute("data-group-start");
      const participantId = participantInput ? participantInput.value : "";
      startStudy(groupId, participantId);
    });
  });
}

function getStage(session) {
  return session.stages[session.currentStageIndex];
}

function nextPhase(session) {
  const stage = getStage(session);
  if (!stage) {
    session.currentPhase = PHASES.FINAL_SURVEY;
    return;
  }

  if (session.currentPhase === PHASES.TUTORIAL) {
    session.currentPhase = PHASES.MAIN_READING;
  } else if (session.currentPhase === PHASES.MAIN_READING) {
    session.currentPhase = PHASES.QUIZ;
  } else if (session.currentPhase === PHASES.QUIZ) {
    session.currentPhase = PHASES.LIKERT;
  } else if (session.currentPhase === PHASES.LIKERT) {
    if (session.currentStageIndex < session.stages.length - 1) {
      session.currentStageIndex += 1;
      session.currentPhase = PHASES.TUTORIAL;
    } else {
      session.currentPhase = PHASES.FINAL_SURVEY;
    }
  }
}

function getStageLeadingHtml(session, stage) {
  return `<span class="app-mark">그룹 ${escapeHtml(session.groupId)} · 단계 ${stage.stageNumber}/4 · 조건 ${stage.condition}</span>`;
}

function ensureQuizMap(quizzesJson) {
  const map = new Map();
  const texts = Array.isArray(quizzesJson?.texts) ? quizzesJson.texts : [];
  texts.forEach((entry) => {
    const key = basename(entry.source_file);
    if (key) {
      map.set(key, entry);
    }
  });
  return map;
}

function computeComprehensionEfficiency(accuracy, readingTimeSec) {
  if (!Number.isFinite(readingTimeSec) || readingTimeSec <= 0) {
    return 0;
  }
  return Number((accuracy / readingTimeSec).toFixed(6));
}

function sanitizeNumeric(value, digits = 6) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(digits));
}

function formatDateTimeDisplay(iso) {
  if (!iso) {
    return "-";
  }
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return String(iso);
  }
  return parsed.toLocaleString();
}

function markSessionCompleted(session) {
  session.completedAt = nowIso();
  session.status = "completed";
  session.currentPhase = PHASES.COMPLETED;

  const records = loadStudyRecords();
  const row = sessionToWideRow(session);
  const existingIndex = records.findIndex((item) => item.session_id === row.session_id);
  if (existingIndex >= 0) {
    const existing = normalizeStudyRecord(records[existingIndex]);
    row.download_count = existing ? existing.download_count : 0;
    row.last_downloaded_at = existing ? existing.last_downloaded_at : "";
    records[existingIndex] = row;
  } else {
    records.push(row);
  }
  saveStudyRecords(records);
}

function renderStudyTutorial(session, stage, tutorialText) {
  app.innerHTML = renderScreen(
    `
    <div class="study-meta">
      <span class="badge">연습 단계 (T0)</span>
      <p class="muted">지금부터 조건 ${stage.condition} 인터페이스를 T0 지문으로 먼저 학습합니다.</p>
    </div>

    ${buildReaderBlock({
      title: `연습 지문: ${formatFilenameForDisplay(TEXT_FILES.T0)}`,
      content: tutorialText,
      condition: stage.condition,
      idPrefix: "study-tutorial",
    })}

    <div class="study-next-wrap">
      <button class="button button-primary next-button" id="study-next" disabled>다음</button>
    </div>

    <div class="modal-backdrop" id="tutorial-modal">
      <div class="modal-card">
        <h2>조건 ${stage.condition} 사용 안내</h2>
        <p>${escapeHtml(CONDITION_INSTRUCTION[stage.condition])}</p>
        <button class="button button-primary" id="close-tutorial-modal">확인</button>
      </div>
    </div>
  `,
    {
      screenClass: "reader-screen",
      leadingHtml: getStageLeadingHtml(session, stage),
    }
  );

  bindThemeToggle();

  teardownReaderSession();
  state.readerCleanup = mountReader({
    content: tutorialText,
    condition: stage.condition,
    idPrefix: "study-tutorial",
  });

  const closeModal = app.querySelector("#close-tutorial-modal");
  const modal = app.querySelector("#tutorial-modal");
  const nextBtn = app.querySelector("#study-next");

  const enableNext = () => {
    stage.tutorial.popupClosed = true;
    persistSession(session);
    if (modal) {
      modal.classList.add("hidden");
    }
    if (nextBtn) {
      nextBtn.disabled = false;
    }
  };

  if (stage.tutorial.popupClosed) {
    enableNext();
  }

  if (closeModal) {
    closeModal.addEventListener("click", () => {
      enableNext();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      stage.tutorial.completedAt = nowIso();
      nextPhase(session);
      persistSession(session);
      renderRoute();
    });
  }
}

function renderStudyMainReading(session, stage, content) {
  const metrics = stage.mainReading;
  if (!metrics.startedAt) {
    metrics.startedAt = nowIso();
    persistSession(session);
  }

  app.innerHTML = renderScreen(
    `
    <div class="study-meta">
      <span class="badge">본 읽기 단계 (${escapeHtml(stage.taskId)})</span>
      <p class="muted">지문을 읽은 뒤 우하단의 다음 버튼으로 문제 풀이로 이동합니다.</p>
    </div>

    ${buildReaderBlock({
      title: `${escapeHtml(stage.taskId)}: ${formatFilenameForDisplay(stage.textFile)}`,
      content,
      condition: stage.condition,
      idPrefix: "study-main",
    })}

    <div class="study-next-wrap">
      <button class="button button-primary next-button" id="reading-next">다음</button>
    </div>
  `,
    {
      screenClass: "reader-screen",
      leadingHtml: getStageLeadingHtml(session, stage),
    }
  );

  bindThemeToggle();

  teardownReaderSession();

  const cleanupInteraction = mountReader({
    content,
    condition: stage.condition,
    idPrefix: "study-main",
  });

  const readerScroll = app.querySelector("#study-main-scroll");

  let lastY = null;

  const onMouseMoveMetric = (event) => {
    if (lastY == null) {
      lastY = event.clientY;
      return;
    }
    if (event.clientY > lastY) {
      metrics.mouseDownMoves += 1;
    } else if (event.clientY < lastY) {
      metrics.mouseUpMoves += 1;
    }
    lastY = event.clientY;
  };

  const onKeyMetric = (event) => {
    if (event.key === "ArrowUp") {
      metrics.arrowUpKeydowns += 1;
    } else if (event.key === "ArrowDown") {
      metrics.arrowDownKeydowns += 1;
    }
  };

  if (readerScroll) {
    readerScroll.addEventListener("mousemove", onMouseMoveMetric);
    readerScroll.addEventListener("keydown", onKeyMetric);
  }

  state.readerCleanup = () => {
    cleanupInteraction();
    if (readerScroll) {
      readerScroll.removeEventListener("mousemove", onMouseMoveMetric);
      readerScroll.removeEventListener("keydown", onKeyMetric);
    }
  };

  const nextBtn = app.querySelector("#reading-next");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      metrics.completedAt = nowIso();
      metrics.readingTimeSec = diffSeconds(metrics.startedAt, metrics.completedAt);
      nextPhase(session);
      persistSession(session);
      renderRoute();
    });
  }
}

function renderQuizQuestionCards(quizEntry, answers) {
  return quizEntry.questions
    .map((question, qIndex) => {
      const selected = answers[question.id] || "";
      const options = question.options
        .map(
          (option) => `
          <label class="quiz-option">
            <input type="radio" name="q_${escapeHtml(question.id)}" value="${escapeHtml(option.id)}" ${selected === option.id ? "checked" : ""}>
            <span>${escapeHtml(option.id)}. ${escapeHtml(option.text)}</span>
          </label>
        `
        )
        .join("");

      return `
        <article class="quiz-card" data-question-id="${escapeHtml(question.id)}">
          <h3>문제 ${qIndex + 1}</h3>
          <p>${escapeHtml(question.prompt)}</p>
          <div class="quiz-options">${options}</div>
        </article>
      `;
    })
    .join("");
}

function renderStudyQuiz(session, stage, content, quizEntry) {
  const quizState = stage.quiz;
  if (!quizState.startedAt) {
    quizState.startedAt = nowIso();
    persistSession(session);
  }

  const view = quizState.view === "text" ? "text" : "quiz";
  const quizTabClass = view === "quiz" ? "button button-primary" : "button";
  const textTabClass = view === "text" ? "button button-primary" : "button";

  const bodyHtml =
    view === "quiz"
      ? `
      <form id="quiz-form">
        ${renderQuizQuestionCards(quizEntry, quizState.answers)}
      </form>
      <div class="study-next-wrap">
        <button class="button button-primary next-button" id="quiz-submit">답안 제출</button>
      </div>
    `
      : `
      ${buildReaderBlock({
        title: `본문 재확인: ${formatFilenameForDisplay(stage.textFile)}`,
        content,
        condition: stage.condition,
        idPrefix: "quiz-text",
      })}
      <div class="study-next-wrap">
        <button class="button button-primary next-button" id="back-to-quiz">문제로 돌아가기</button>
      </div>
    `;

  app.innerHTML = renderScreen(
    `
    <div class="study-meta">
      <span class="badge">문제 풀이 (${escapeHtml(stage.taskId)})</span>
      <p class="muted">필요하면 본문 보기로 이동해 다시 탐색할 수 있습니다.</p>
    </div>

    <div class="tab-buttons">
      <button class="${quizTabClass}" id="view-quiz" ${view === "quiz" ? "disabled" : ""}>문제 보기</button>
      <button class="${textTabClass}" id="view-text" ${view === "text" ? "disabled" : ""}>본문 보기</button>
    </div>

    ${bodyHtml}
  `,
    {
      screenClass: view === "text" ? "reader-screen" : "list-screen",
      leadingHtml: getStageLeadingHtml(session, stage),
    }
  );

  bindThemeToggle();
  teardownReaderSession();

  if (view === "text") {
    state.readerCleanup = mountReader({
      content,
      condition: stage.condition,
      idPrefix: "quiz-text",
    });
  }

  const switchToView = (nextView) => {
    if (quizState.view === "quiz" && nextView === "text") {
      quizState.revisitCount += 1;
      if (!quizState.firstRevisitAt) {
        quizState.firstRevisitAt = nowIso();
      }
    }
    quizState.view = nextView;
    persistSession(session);
    renderRoute();
  };

  const viewQuizBtn = app.querySelector("#view-quiz");
  const viewTextBtn = app.querySelector("#view-text");

  if (viewQuizBtn) {
    viewQuizBtn.addEventListener("click", () => switchToView("quiz"));
  }
  if (viewTextBtn) {
    viewTextBtn.addEventListener("click", () => switchToView("text"));
  }

  const backToQuizBtn = app.querySelector("#back-to-quiz");
  if (backToQuizBtn) {
    backToQuizBtn.addEventListener("click", () => {
      switchToView("quiz");
    });
  }

  const quizForm = app.querySelector("#quiz-form");
  if (quizForm) {
    quizForm.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      if (!target.name.startsWith("q_")) {
        return;
      }
      const qid = target.name.slice(2);
      quizState.answers[qid] = target.value;
      persistSession(session);
    });
  }

  const submitBtn = app.querySelector("#quiz-submit");
  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      const questions = quizEntry.questions;
      const unanswered = questions.find((q) => !quizState.answers[q.id]);
      if (unanswered) {
        window.alert("모든 문항에 답변해 주세요.");
        return;
      }

      quizState.submittedAt = nowIso();
      quizState.totalQuestions = questions.length;

      let correctCount = 0;
      questions.forEach((q) => {
        if (quizState.answers[q.id] === q.correct_option_id) {
          correctCount += 1;
        }
      });

      const accuracy = questions.length > 0 ? correctCount / questions.length : 0;

      quizState.correctCount = correctCount;
      quizState.accuracy = sanitizeNumeric(accuracy);
      quizState.researchAccuracy = sanitizeNumeric(accuracy);
      quizState.problemSolvingTimeSec = diffSeconds(quizState.startedAt, quizState.submittedAt);
      quizState.firstRevisitToSubmitSec = quizState.firstRevisitAt
        ? diffSeconds(quizState.firstRevisitAt, quizState.submittedAt)
        : "";

      nextPhase(session);
      persistSession(session);
      renderRoute();
    });
  }
}

function renderLikertForm(session, stage) {
  const rows = LIKERT_ITEMS.map((item, idx) => {
    const response = stage.likert.responses[idx] || { score: null, reason: "" };
    const options = [1, 2, 3, 4, 5]
      .map(
        (n) => `
        <label class="likert-option">
          <input type="radio" name="likert_score_${idx}" value="${n}" ${Number(response.score) === n ? "checked" : ""}>
          <span>${n}</span>
        </label>
      `
      )
      .join("");

    return `
      <article class="likert-card" data-likert-index="${idx}">
        <p><strong>${idx + 1}.</strong> ${escapeHtml(item)}</p>
        <div class="likert-options">${options}</div>
        <label class="field-label" for="likert_reason_${idx}">이유</label>
        <textarea class="text-area" id="likert_reason_${idx}" data-likert-reason="${idx}" rows="2">${escapeHtml(response.reason || "")}</textarea>
      </article>
    `;
  }).join("");

  app.innerHTML = renderScreen(
    `
    <h1>단계 설문 (조건 ${escapeHtml(stage.condition)})</h1>
    <p class="muted">각 문항에 1~5점을 선택하고 이유를 작성해 주세요.</p>
    <div class="likert-list">${rows}</div>
    <div class="study-next-wrap">
      <button class="button button-primary next-button" id="likert-next">다음</button>
    </div>
  `,
    {
      screenClass: "list-screen",
      leadingHtml: getStageLeadingHtml(session, stage),
    }
  );

  bindThemeToggle();

  app.querySelectorAll("input[type='radio'][name^='likert_score_']").forEach((node) => {
    node.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      const idx = Number(target.name.replace("likert_score_", ""));
      if (!Number.isInteger(idx)) {
        return;
      }
      stage.likert.responses[idx] = stage.likert.responses[idx] || { score: null, reason: "" };
      stage.likert.responses[idx].score = Number(target.value);
      persistSession(session);
    });
  });

  app.querySelectorAll("[data-likert-reason]").forEach((node) => {
    node.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement)) {
        return;
      }
      const idx = Number(target.getAttribute("data-likert-reason"));
      if (!Number.isInteger(idx)) {
        return;
      }
      stage.likert.responses[idx] = stage.likert.responses[idx] || { score: null, reason: "" };
      stage.likert.responses[idx].reason = target.value;
      persistSession(session);
    });
  });

  const nextBtn = app.querySelector("#likert-next");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      for (let i = 0; i < LIKERT_ITEMS.length; i += 1) {
        const response = stage.likert.responses[i];
        if (!response || !Number.isFinite(Number(response.score))) {
          window.alert(`Likert ${i + 1}번 점수를 선택해 주세요.`);
          return;
        }
        if (!String(response.reason || "").trim()) {
          window.alert(`Likert ${i + 1}번 이유를 입력해 주세요.`);
          return;
        }
      }

      stage.likert.completedAt = nowIso();
      nextPhase(session);
      persistSession(session);
      renderRoute();
    });
  }
}

function renderFinalSurvey(session) {
  const current = session.finalSurvey || {
    mostNaturalCondition: "",
    mouseFollowBurden: "",
    arrowKeyFlow: "",
    conditionPreferenceRank: "",
    leastFatigueCondition: "",
    easiestRefindCondition: "",
  };

  const optionHtml = ['<option value="">선택</option>', ...VALID_CONDITIONS.map((c) => `<option value="${c}">조건 ${c}</option>`)].join("");

  app.innerHTML = renderScreen(
    `
    <h1>최종 설문</h1>
    <div class="survey-form">
      <label class="field-label" for="final-natural">어떤 조건이 가장 자연스러웠나?</label>
      <select class="text-input" id="final-natural">${optionHtml}</select>

      <label class="field-label" for="final-mouse-burden">마우스를 따라 가는 것이 부담이었나?</label>
      <textarea class="text-area" id="final-mouse-burden" rows="3">${escapeHtml(current.mouseFollowBurden)}</textarea>

      <label class="field-label" for="final-arrow-flow">방향키 이동이 안정감을 줬나, 아니면 흐름을 깨뜨렸나?</label>
      <textarea class="text-area" id="final-arrow-flow" rows="3">${escapeHtml(current.arrowKeyFlow)}</textarea>

      <label class="field-label" for="final-rank">네 조건 선호도 정렬 및 이유 서술</label>
      <textarea class="text-area" id="final-rank" rows="4">${escapeHtml(current.conditionPreferenceRank)}</textarea>

      <label class="field-label" for="final-least-fatigue">어떤 조건에서 가장 덜 피로했나?</label>
      <select class="text-input" id="final-least-fatigue">${optionHtml}</select>

      <label class="field-label" for="final-easiest-refind">어떤 조건에서 정보를 다시 찾기 가장 쉬웠나?</label>
      <select class="text-input" id="final-easiest-refind">${optionHtml}</select>
    </div>

    <div class="study-next-wrap">
      <button class="button button-primary next-button" id="final-submit">설문 제출</button>
    </div>
  `,
    {
      screenClass: "list-screen",
      leadingHtml: `<span class="app-mark">그룹 ${escapeHtml(session.groupId)} · 최종 설문</span>`,
    }
  );

  bindThemeToggle();

  const natural = app.querySelector("#final-natural");
  const mouseBurden = app.querySelector("#final-mouse-burden");
  const arrowFlow = app.querySelector("#final-arrow-flow");
  const rank = app.querySelector("#final-rank");
  const leastFatigue = app.querySelector("#final-least-fatigue");
  const easiestRefind = app.querySelector("#final-easiest-refind");

  if (natural) natural.value = current.mostNaturalCondition || "";
  if (leastFatigue) leastFatigue.value = current.leastFatigueCondition || "";
  if (easiestRefind) easiestRefind.value = current.easiestRefindCondition || "";

  const captureFinal = () => {
    session.finalSurvey = {
      mostNaturalCondition: natural ? natural.value : "",
      mouseFollowBurden: mouseBurden ? mouseBurden.value : "",
      arrowKeyFlow: arrowFlow ? arrowFlow.value : "",
      conditionPreferenceRank: rank ? rank.value : "",
      leastFatigueCondition: leastFatigue ? leastFatigue.value : "",
      easiestRefindCondition: easiestRefind ? easiestRefind.value : "",
    };
    persistSession(session);
  };

  [natural, mouseBurden, arrowFlow, rank, leastFatigue, easiestRefind].forEach((node) => {
    if (!node) {
      return;
    }
    node.addEventListener("change", captureFinal);
    node.addEventListener("input", captureFinal);
  });

  const submitBtn = app.querySelector("#final-submit");
  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      captureFinal();
      const f = session.finalSurvey || {};
      if (!f.mostNaturalCondition || !f.leastFatigueCondition || !f.easiestRefindCondition) {
        window.alert("조건 선택 문항을 모두 입력해 주세요.");
        return;
      }
      if (!String(f.mouseFollowBurden || "").trim()) {
        window.alert("마우스 부담 문항을 작성해 주세요.");
        return;
      }
      if (!String(f.arrowKeyFlow || "").trim()) {
        window.alert("방향키 이동 문항을 작성해 주세요.");
        return;
      }
      if (!String(f.conditionPreferenceRank || "").trim()) {
        window.alert("조건 선호도 정렬/이유를 작성해 주세요.");
        return;
      }

      markSessionCompleted(session);
      persistSession(session);
      renderRoute();
    });
  }
}

function csvEscape(value) {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function sessionToWideRow(session) {
  const row = {
    session_id: session.sessionId,
    participant_id: session.participantId,
    group_id: session.groupId,
    session_started_at: session.startedAt || "",
    session_completed_at: session.completedAt || "",
    download_count: 0,
    last_downloaded_at: "",
  };

  session.stages.forEach((stage, idx) => {
    const n = idx + 1;
    const reading = stage.mainReading || {};
    const quiz = stage.quiz || {};
    const likert = stage.likert || {};

    row[`stage${n}_condition`] = stage.condition;
    row[`stage${n}_task`] = stage.taskId;
    row[`stage${n}_text_file`] = stage.textFile;

    row[`stage${n}_reading_time_sec`] = sanitizeNumeric(Number(reading.readingTimeSec || 0), 3);
    row[`stage${n}_mouse_down_moves`] = Number(reading.mouseDownMoves || 0);
    row[`stage${n}_mouse_up_moves`] = Number(reading.mouseUpMoves || 0);
    row[`stage${n}_arrow_up_keydowns`] = Number(reading.arrowUpKeydowns || 0);
    row[`stage${n}_arrow_down_keydowns`] = Number(reading.arrowDownKeydowns || 0);

    const accuracy = sanitizeNumeric(Number(quiz.accuracy || 0));
    row[`stage${n}_quiz_total`] = Number(quiz.totalQuestions || 0);
    row[`stage${n}_quiz_correct`] = Number(quiz.correctCount || 0);
    row[`stage${n}_accuracy`] = accuracy;
    row[`stage${n}_problem_solving_time_sec`] = sanitizeNumeric(Number(quiz.problemSolvingTimeSec || 0), 3);
    row[`stage${n}_revisit_count`] = Number(quiz.revisitCount || 0);
    row[`stage${n}_first_revisit_to_submit_sec`] = quiz.firstRevisitToSubmitSec === "" ? "" : sanitizeNumeric(Number(quiz.firstRevisitToSubmitSec || 0), 3);
    row[`stage${n}_research_accuracy`] = sanitizeNumeric(Number(quiz.researchAccuracy || 0));

    row[`stage${n}_comprehension_efficiency`] = computeComprehensionEfficiency(accuracy, Number(reading.readingTimeSec || 0));

    LIKERT_ITEMS.forEach((_, likertIndex) => {
      const item = (likert.responses || [])[likertIndex] || {};
      row[`stage${n}_likert_${likertIndex + 1}_score`] = item.score == null ? "" : Number(item.score);
      row[`stage${n}_likert_${likertIndex + 1}_reason`] = item.reason || "";
    });
  });

  const final = session.finalSurvey || {};
  row.final_most_natural_condition = final.mostNaturalCondition || "";
  row.final_mouse_follow_burden = final.mouseFollowBurden || "";
  row.final_arrow_key_stability_or_flow = final.arrowKeyFlow || "";
  row.final_condition_preference_rank_reason = final.conditionPreferenceRank || "";
  row.final_least_fatigue_condition = final.leastFatigueCondition || "";
  row.final_easiest_refind_condition = final.easiestRefindCondition || "";

  return row;
}

function buildCsvFromRows(rows) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvEscape).join(",")];

  rows.forEach((row) => {
    const line = headers.map((key) => csvEscape(row[key])).join(",");
    lines.push(line);
  });

  return lines.join("\n");
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderCompletedStudy(session) {
  const row = sessionToWideRow(session);
  const records = loadStudyRecords();
  const csvRows = records.length ? records : [row];

  app.innerHTML = renderScreen(
    `
    <h1>스터디 완료</h1>
    <p class="muted">참가자 ${escapeHtml(session.participantId)} · 그룹 ${escapeHtml(session.groupId)}의 스터디가 완료되었습니다.</p>

    <div class="study-resume-box">
      <p><strong>측정 요약</strong></p>
      <p class="muted">단계 수: ${session.stages.length} / 완료 시각: ${escapeHtml(session.completedAt || "")}</p>
    </div>

    <div class="start-actions">
      <button class="button button-primary" id="download-csv-btn">CSV 다운로드</button>
      <a class="button" href="#/records">저장 데이터</a>
      <a class="button" href="#/start">시작 화면으로</a>
    </div>
  `,
    {
      screenClass: "list-screen",
      leadingHtml: `<span class="app-mark">그룹 ${escapeHtml(session.groupId)} · 완료</span>`,
    }
  );

  bindThemeToggle();

  const downloadBtn = app.querySelector("#download-csv-btn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      const content = buildCsvFromRows(csvRows);
      if (!content) {
        window.alert("다운로드할 CSV 데이터가 없습니다.");
        return;
      }
      const timestamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
      downloadCsv(`hci-study-results-${timestamp}.csv`, content);
      incrementTotalDownloadCount({ bulk: true });
    });
  }
}

function renderRecordStageSummary(record) {
  const stages = [1, 2, 3, 4]
    .map((n) => {
      const condition = record[`stage${n}_condition`] || "-";
      const accuracy = record[`stage${n}_accuracy`] ?? "-";
      const readingTime = record[`stage${n}_reading_time_sec`] ?? "-";
      const solvingTime = record[`stage${n}_problem_solving_time_sec`] ?? "-";
      const revisitCount = record[`stage${n}_revisit_count`] ?? "-";
      return `<li>단계 ${n} · 조건 ${escapeHtml(condition)} · 정답률 ${escapeHtml(
        String(accuracy)
      )} · 읽기 ${escapeHtml(String(readingTime))}s · 문제 ${escapeHtml(
        String(solvingTime)
      )}s · 재방문 ${escapeHtml(String(revisitCount))}회</li>`;
    })
    .join("");

  return `<ul class="record-stage-list">${stages}</ul>`;
}

function renderRecordsScreen() {
  const records = loadStudyRecords().sort((a, b) => {
    const aTime = Date.parse(a.session_completed_at || a.session_started_at || "");
    const bTime = Date.parse(b.session_completed_at || b.session_started_at || "");
    if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) {
      return 0;
    }
    if (!Number.isFinite(aTime)) {
      return 1;
    }
    if (!Number.isFinite(bTime)) {
      return -1;
    }
    return bTime - aTime;
  });
  const meta = loadStudyRecordsMeta();

  const recordItems = records.length
    ? records
        .map((record) => {
          const sessionId = record.session_id || "";
          return `
            <article class="record-item">
              <div class="record-head">
                <p><strong>${escapeHtml(record.participant_id || "-")}</strong> · 그룹 ${escapeHtml(
                  record.group_id || "-"
                )}</p>
                <span class="badge">다운로드 ${Number(record.download_count || 0)}회</span>
              </div>
              <p class="muted">완료: ${escapeHtml(
                formatDateTimeDisplay(record.session_completed_at || record.session_started_at || "")
              )}</p>
              <p class="muted">세션 ID: ${escapeHtml(sessionId)}</p>
              <p class="muted">마지막 세션 다운로드: ${escapeHtml(
                formatDateTimeDisplay(record.last_downloaded_at || "")
              )}</p>

              <details class="record-details">
                <summary>상세 보기</summary>
                ${renderRecordStageSummary(record)}
              </details>

              <div class="record-actions">
                <button class="button" data-record-download="${escapeHtml(sessionId)}" ${
                  sessionId ? "" : "disabled"
                }>세션 CSV 다운로드</button>
                <button class="button" data-record-delete="${escapeHtml(sessionId)}" ${
                  sessionId ? "" : "disabled"
                }>삭제</button>
              </div>
            </article>
          `;
        })
        .join("")
    : '<div class="empty-state"><p class="muted">저장된 완료 세션이 없습니다.</p></div>';

  app.innerHTML = renderScreen(
    `
    <h1>저장 데이터 관리</h1>
    <div class="study-resume-box">
      <p><strong>기록 수:</strong> ${records.length}건</p>
      <p><strong>전체 다운로드 횟수:</strong> ${meta.total_download_count}회</p>
      <p class="muted">마지막 전체 다운로드: ${escapeHtml(
        formatDateTimeDisplay(meta.last_bulk_downloaded_at || "")
      )}</p>
    </div>

    <div class="start-actions">
      <button class="button button-primary" id="download-all-records-btn">전체 CSV 다운로드</button>
      <button class="button" id="clear-all-records-btn">세션+기록 전체 초기화</button>
      <a class="button" href="#/start">시작 화면으로</a>
    </div>

    <section class="records-list">
      ${recordItems}
    </section>
  `,
    {
      screenClass: "list-screen",
      leadingHtml: '<span class="app-mark">HCI TXT Reader</span>',
    }
  );

  bindThemeToggle();

  const bulkButton = app.querySelector("#download-all-records-btn");
  if (bulkButton) {
    bulkButton.addEventListener("click", () => {
      if (!records.length) {
        window.alert("다운로드할 저장 데이터가 없습니다.");
        return;
      }
      const csvContent = buildCsvFromRows(records);
      const timestamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
      downloadCsv(`hci-study-all-records-${timestamp}.csv`, csvContent);
      incrementTotalDownloadCount({ bulk: true });
      renderRecordsScreen();
    });
  }

  const clearAllButton = app.querySelector("#clear-all-records-btn");
  if (clearAllButton) {
    clearAllButton.addEventListener("click", () => {
      const ok = window.confirm("저장된 세션/기록/카운트를 모두 초기화할까요?");
      if (!ok) {
        return;
      }
      resetStudyStorage();
      renderRecordsScreen();
    });
  }

  app.querySelectorAll("[data-record-download]").forEach((button) => {
    button.addEventListener("click", () => {
      const sessionId = button.getAttribute("data-record-download");
      if (!sessionId) {
        return;
      }
      const targetRecord = loadStudyRecords().find((record) => record.session_id === sessionId);
      if (!targetRecord) {
        window.alert("해당 세션 기록을 찾을 수 없습니다.");
        return;
      }
      const csvContent = buildCsvFromRows([targetRecord]);
      const safeParticipant = String(targetRecord.participant_id || "participant").replace(/[^a-zA-Z0-9_-]+/g, "_");
      downloadCsv(`hci-study-${safeParticipant}-${sessionId}.csv`, csvContent);
      incrementSessionDownloadCount(sessionId);
      renderRecordsScreen();
    });
  });

  app.querySelectorAll("[data-record-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const sessionId = button.getAttribute("data-record-delete");
      if (!sessionId) {
        return;
      }
      const ok = window.confirm("이 세션 기록을 삭제할까요?");
      if (!ok) {
        return;
      }
      const nextRecords = loadStudyRecords().filter((record) => record.session_id !== sessionId);
      saveStudyRecords(nextRecords);

      const activeSession = getActiveSession();
      if (activeSession && activeSession.sessionId === sessionId && activeSession.status === "completed") {
        clearStudySession();
      }
      renderRecordsScreen();
    });
  });
}

async function renderStudy() {
  const session = getActiveSession();
  if (!session) {
    renderError("스터디 세션이 없습니다.", "시작 화면에서 그룹을 선택해 세션을 시작해 주세요.");
    return;
  }

  if (session.status === "completed" || session.currentPhase === PHASES.COMPLETED) {
    renderCompletedStudy(session);
    return;
  }

  const stage = getStage(session);
  if (!stage) {
    session.currentPhase = PHASES.FINAL_SURVEY;
    persistSession(session);
    renderRoute();
    return;
  }

  if (session.currentPhase === PHASES.TUTORIAL) {
    try {
      const tutorialText = await loadTxtFile(TEXT_FILES.T0);
      renderStudyTutorial(session, stage, tutorialText);
    } catch (error) {
      renderError("T0 파일 로딩 실패", error.message);
    }
    return;
  }

  if (session.currentPhase === PHASES.MAIN_READING) {
    try {
      const content = await loadTxtFile(stage.textFile);
      renderStudyMainReading(session, stage, content);
    } catch (error) {
      renderError("본문 로딩 실패", error.message);
    }
    return;
  }

  if (session.currentPhase === PHASES.QUIZ) {
    try {
      const [content, quizJson] = await Promise.all([loadTxtFile(stage.textFile), loadQuizBank()]);
      const quizMap = ensureQuizMap(quizJson);
      const quizEntry = quizMap.get(stage.textFile);
      if (!quizEntry || !Array.isArray(quizEntry.questions) || quizEntry.questions.length === 0) {
        throw new Error(`퀴즈를 찾을 수 없습니다: ${stage.textFile}`);
      }
      renderStudyQuiz(session, stage, content, quizEntry);
    } catch (error) {
      renderError("퀴즈 로딩 실패", error.message);
    }
    return;
  }

  if (session.currentPhase === PHASES.LIKERT) {
    renderLikertForm(session, stage);
    return;
  }

  if (session.currentPhase === PHASES.FINAL_SURVEY) {
    renderFinalSurvey(session);
    return;
  }

  renderError("알 수 없는 스터디 단계", "세션 상태를 확인해 주세요.");
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

async function loadQuizBank() {
  if (state.quizzes) {
    return state.quizzes;
  }

  if (!state.quizzesPromise) {
    state.quizzesPromise = fetch("./files/hci-reading-quizzes.json", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`퀴즈 파일 요청 실패 (${res.status})`);
        }
        const data = await res.json();
        state.quizzes = data;
        return data;
      })
      .catch((error) => {
        state.quizzesPromise = null;
        throw error;
      });
  }

  return state.quizzesPromise;
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
  const session = getActiveSession();

  if (route.type === "invalid") {
    renderError("잘못된 경로입니다.", "시작 화면으로 이동해 주세요.");
    return;
  }

  if (
    session &&
    session.status === "in_progress" &&
    route.type !== "study" &&
    route.type !== "start" &&
    route.type !== "records"
  ) {
    window.location.hash = "#/study";
    return;
  }

  if (route.type === "start") {
    renderStartHome();
    return;
  }

  if (route.type === "records") {
    renderRecordsScreen();
    return;
  }

  if (route.type === "study") {
    renderLoading("스터디 화면 로딩 중...");
    await renderStudy();
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
