const app = document.getElementById("app");

const CONDITION_KEY = "hci_reader_condition";
const LOGS_KEY = "hci_reader_logs";
const VALID_CONDITIONS = ["A", "B", "C", "D"];

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

function getCondition() {
  const raw = localStorage.getItem(CONDITION_KEY);
  return VALID_CONDITIONS.includes(raw) ? raw : "A";
}

function setCondition(next) {
  const value = VALID_CONDITIONS.includes(next) ? next : "A";
  localStorage.setItem(CONDITION_KEY, value);
}

function readLogs() {
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLogs(logs) {
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
}

function appendLog(record) {
  const logs = readLogs();
  logs.push(record);
  writeLogs(logs);
}

function clearLogs() {
  writeLogs([]);
}

function routeFromHash() {
  const hash = window.location.hash;
  if (!hash || hash === "#" || hash === "#/") {
    return { type: "list" };
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
  app.innerHTML = `
    <h1>TXT 파일 목록</h1>
    <p class="muted">${escapeHtml(message)}</p>
  `;
}

function renderError(title, message) {
  app.innerHTML = `
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">${escapeHtml(message)}</p>
    <p><a class="button" href="#/">목록으로 돌아가기</a></p>
  `;
}

function renderList(files) {
  const current = getCondition();
  const logsCount = readLogs().length;

  const items =
    files.length === 0
      ? '<p class="muted">표시할 txt 파일이 없습니다.</p>'
      : `<ul class="file-list">${files
          .map((name) => {
            const encoded = encodeURIComponent(name);
            return `<li><a class="file-link" href="#/file/${encoded}">${escapeHtml(name)}</a></li>`;
          })
          .join("")}</ul>`;

  app.innerHTML = `
    <h1>HCI TXT Reader</h1>
    <fieldset class="controls">
      <legend>실험 조건 선택</legend>
      <div class="radio-group">
        ${VALID_CONDITIONS.map(
          (mode) => `
            <label class="radio-item">
              <input type="radio" name="condition" value="${mode}" ${current === mode ? "checked" : ""}>
              <span>조건 ${mode}</span>
            </label>
          `
        ).join("")}
      </div>
      <p class="muted">현재 선택: 조건 ${current}</p>
    </fieldset>

    <div class="actions">
      <button class="button" type="button" id="download-logs">로그 다운로드 (${logsCount})</button>
      <button class="button" type="button" id="clear-logs">로그 초기화</button>
    </div>

    <h1>TXT 파일 목록</h1>
    ${items}
  `;

  app.querySelectorAll('input[name="condition"]').forEach((radio) => {
    radio.addEventListener("change", (event) => {
      const value = event.target.value;
      setCondition(value);
      renderList(files);
    });
  });

  const downloadButton = app.querySelector("#download-logs");
  const clearButton = app.querySelector("#clear-logs");

  if (downloadButton) {
    downloadButton.addEventListener("click", () => {
      const payload = JSON.stringify(readLogs(), null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replaceAll(":", "-");
      a.href = url;
      a.download = `hci-reader-logs-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      clearLogs();
      renderList(files);
    });
  }
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

function renderReader(name, content, condition) {
  const conditionLabel = `Condition ${condition}`;
  const modeClass = condition === "B" ? "mode-b" : condition === "C" ? "mode-c" : condition === "D" ? "mode-d" : "";

  app.innerHTML = `
    <div class="actions">
      <a class="button" href="#/">뒤로가기</a>
    </div>
    <span class="badge">${conditionLabel}</span>
    <h1>${escapeHtml(name)}</h1>
    <p class="muted">리더 화면에서는 조건 변경이 잠금됩니다.</p>

    <div class="reader-frame">
      <div class="reader-scroll ${condition === "D" ? "mode-d" : ""}" id="reader-scroll" tabindex="0">
        <div class="line-overlay ${modeClass}" id="line-overlay"></div>
        <div class="reader-text" id="reader-text"></div>
      </div>
    </div>
  `;

  const readerScroll = app.querySelector("#reader-scroll");
  const readerText = app.querySelector("#reader-text");
  const lineOverlay = app.querySelector("#line-overlay");

  readerText.textContent = content;

  const session = {
    sessionId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    condition,
    file: name,
    startAt: new Date().toISOString(),
    mouseMoveCount: 0,
    arrowUpCount: 0,
    arrowDownCount: 0,
    scrollAttemptBlockedCount: 0,
    ended: false,
  };

  const lineState = {
    anchorX: null,
    lastClientY: null,
    contentTop: null,
    lineHeight: estimateLineHeight(readerText),
  };

  function finalizeSession() {
    if (session.ended) {
      return;
    }
    session.ended = true;

    const endAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.parse(endAt) - Date.parse(session.startAt));

    const record = {
      sessionId: session.sessionId,
      condition: session.condition,
      file: session.file,
      startAt: session.startAt,
      endAt,
      durationMs,
    };

    if (session.condition === "B" || session.condition === "C") {
      record.mouseMoveCount = session.mouseMoveCount;
    }

    if (session.condition === "D") {
      record.arrowUpCount = session.arrowUpCount;
      record.arrowDownCount = session.arrowDownCount;
      record.scrollAttemptBlockedCount = session.scrollAttemptBlockedCount;
    }

    appendLog(record);
  }

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

  function ensureVisible(top, height) {
    const margin = 28;
    const currentTop = readerScroll.scrollTop;
    const viewTop = currentTop + margin;
    const viewBottom = currentTop + readerScroll.clientHeight - margin;

    if (top < viewTop) {
      readerScroll.scrollTop = Math.max(0, top - margin);
      return;
    }

    const bottom = top + height;
    if (bottom > viewBottom) {
      readerScroll.scrollTop = Math.max(0, bottom - readerScroll.clientHeight + margin);
    }
  }

  function stepByArrow(direction) {
    let scrollRect = readerScroll.getBoundingClientRect();
    let textRect = readerText.getBoundingClientRect();
    const x = lineState.anchorX ?? scrollRect.left + 30;

    let baseY;
    if (lineState.lastClientY == null) {
      baseY = scrollRect.top + Math.min(lineState.lineHeight, scrollRect.height - 8);
    } else {
      baseY = lineState.lastClientY + direction * lineState.lineHeight;
    }

    const previousTop = lineState.contentTop;
    let minY = Math.max(scrollRect.top + 6, textRect.top + 2);
    let maxY = Math.min(scrollRect.bottom - 6, textRect.bottom - 2);
    if (minY >= maxY) {
      return;
    }

    let probeY = Math.min(maxY, Math.max(minY, baseY));
    let moved = false;

    // 빈 줄(폭 0 caret)에서 멈추지 않도록 인접한 다음 줄까지 탐색한다.
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
        readerScroll.scrollTop = Math.max(0, readerScroll.scrollTop + direction * lineState.lineHeight);
        scrollRect = readerScroll.getBoundingClientRect();
        textRect = readerText.getBoundingClientRect();
        minY = Math.max(scrollRect.top + 6, textRect.top + 2);
        maxY = Math.min(scrollRect.bottom - 6, textRect.bottom - 2);
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

  const cleanups = [];

  if (condition === "B" || condition === "C") {
    const onMove = (event) => {
      session.mouseMoveCount += 1;
      updateHighlightFromPoint(event.clientX, event.clientY);
    };

    readerScroll.addEventListener("mousemove", onMove);
    cleanups.push(() => readerScroll.removeEventListener("mousemove", onMove));
  } else if (condition === "D") {
    const onKeyDown = (event) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        session.arrowUpCount += 1;
        stepByArrow(-1);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        session.arrowDownCount += 1;
        stepByArrow(1);
        return;
      }

      if (event.key === " " || event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        session.scrollAttemptBlockedCount += 1;
      }
    };

    const onWheel = (event) => {
      event.preventDefault();
      session.scrollAttemptBlockedCount += 1;
    };

    readerScroll.addEventListener("keydown", onKeyDown);
    readerScroll.addEventListener("wheel", onWheel, { passive: false });

    readerScroll.focus();
    stepByArrow(1);

    cleanups.push(() => readerScroll.removeEventListener("keydown", onKeyDown));
    cleanups.push(() => readerScroll.removeEventListener("wheel", onWheel));
  } else {
    hideHighlight();
  }

  const onBeforeUnload = () => {
    finalizeSession();
  };

  window.addEventListener("beforeunload", onBeforeUnload);
  cleanups.push(() => window.removeEventListener("beforeunload", onBeforeUnload));

  state.readerCleanup = () => {
    finalizeSession();
    cleanups.forEach((fn) => fn());
  };
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

  if (route.type === "invalid") {
    renderError("잘못된 경로입니다.", "목록 화면으로 이동해 주세요.");
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

  if (route.type === "list") {
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
    renderReader(route.name, text, getCondition());
  } catch (error) {
    renderError("파일 로딩 실패", error.message);
  }
}

window.addEventListener("hashchange", renderRoute);
window.addEventListener("DOMContentLoaded", () => {
  if (!window.location.hash) {
    window.location.hash = "#/";
    return;
  }
  renderRoute();
});
