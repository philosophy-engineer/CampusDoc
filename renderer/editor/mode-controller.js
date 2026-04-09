import { VALID_CONDITIONS } from "../constants.js";
import {
  estimateLineHeight,
  getCaretRangeFromPoint,
  getExpandedRect,
  getRangeRect,
  getSelectionCaretRangeIn,
  isCollapsedCaretOnBlankLine,
  isRangeInsideElement,
  measureLineSpan,
  setSelectionAtRange,
} from "./selection.js";

const SCROLL_TARGET = Object.freeze({
  SURFACE: "surface",
  WINDOW: "window",
});

const USER_SCROLL_INTENT_EVENTS = Object.freeze(["wheel", "touchmove"]);
const D_MODE_SCROLL_KEYS = new Set(["PageUp", "PageDown", "Home", "End", " ", "Spacebar"]);

export function createEditorModeController(
  editor,
  overlay,
  {
    getCondition = () => "A",
    requestFrame = (fn) => window.requestAnimationFrame(fn),
    cancelFrame = (id) => window.cancelAnimationFrame(id),
  } = {}
) {
  const surface = overlay.parentElement || editor.parentElement || editor;
  let condition = getCondition();
  let rafId = 0;
  let autoScrollRafId = 0;
  let overlaySuppressedByTyping = false;
  let dFollowSuspendedByUser = false;
  const programmaticScrollGuard = {
    [SCROLL_TARGET.SURFACE]: false,
    [SCROLL_TARGET.WINDOW]: false,
  };
  const programmaticScrollGuardResetRafId = {
    [SCROLL_TARGET.SURFACE]: 0,
    [SCROLL_TARGET.WINDOW]: 0,
  };
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
    cancelFrame(autoScrollRafId);
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
      const moved = surface.scrollTop - before;
      if (Math.abs(moved) >= 0.01) {
        markProgrammaticScrollGuard(SCROLL_TARGET.SURFACE);
      }
      return moved;
    }

    const scroller = document.scrollingElement || document.documentElement;
    const before = window.scrollY;
    const maxTop = Math.max(0, scroller.scrollHeight - window.innerHeight);
    const next = Math.max(0, Math.min(maxTop, before + delta));
    window.scrollTo(0, next);
    const moved = window.scrollY - before;
    if (Math.abs(moved) >= 0.01) {
      markProgrammaticScrollGuard(SCROLL_TARGET.WINDOW);
    }
    return moved;
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
    if (overlaySuppressedByTyping || document.activeElement !== editor || dFollowSuspendedByUser) {
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
    autoScrollRafId = requestFrame(runAutoScrollFrame);
  }

  function refreshAutoScroll() {
    const delta = getAutoScrollDelta();
    if (Math.abs(delta) < 0.01) {
      stopAutoScroll();
      return;
    }
    if (!autoScrollRafId) {
      autoScrollRafId = requestFrame(runAutoScrollFrame);
    }
  }

  function suspendDFollowByUserScroll() {
    if (condition !== "D") {
      return;
    }
    dFollowSuspendedByUser = true;
    stopAutoScroll();
  }

  function resumeDFollowByInteraction() {
    if (condition !== "D") {
      return;
    }
    dFollowSuspendedByUser = false;
  }

  function clearDFollowSuspension() {
    dFollowSuspendedByUser = false;
  }

  function markProgrammaticScrollGuard(target) {
    programmaticScrollGuard[target] = true;
    if (programmaticScrollGuardResetRafId[target]) {
      cancelFrame(programmaticScrollGuardResetRafId[target]);
    }
    programmaticScrollGuardResetRafId[target] = requestFrame(() => {
      programmaticScrollGuard[target] = false;
      programmaticScrollGuardResetRafId[target] = 0;
    });
  }

  function consumeProgrammaticScrollGuard(target) {
    if (!programmaticScrollGuard[target]) {
      return false;
    }
    programmaticScrollGuard[target] = false;
    if (programmaticScrollGuardResetRafId[target]) {
      cancelFrame(programmaticScrollGuardResetRafId[target]);
      programmaticScrollGuardResetRafId[target] = 0;
    }
    return true;
  }

  function isRectVisibleInScrollContext(rect) {
    if (!rect || rect.height <= 0) {
      return false;
    }
    const contextRect = getScrollContextRect();
    return rect.bottom > contextRect.top && rect.top < contextRect.bottom;
  }

  function handleScrollEvent(target) {
    if (!consumeProgrammaticScrollGuard(target)) {
      suspendDFollowByUserScroll();
    }
    scheduleRender();
    refreshAutoScroll();
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

    if (condition === "D" && dFollowSuspendedByUser) {
      const rect = getRangeRect(range, lineState.lastClientY ?? 0);
      if (!isRectVisibleInScrollContext(rect)) {
        hideOverlay();
        return false;
      }
    }

    return showOverlayAtRange(range);
  }

  function scheduleRender() {
    if (rafId) {
      return;
    }
    rafId = requestFrame(() => {
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
    handleScrollEvent(SCROLL_TARGET.SURFACE);
  };
  const onFocus = () => {
    scheduleRender();
    refreshAutoScroll();
  };
  const onBlur = () => {
    scheduleRender();
    refreshAutoScroll();
  };
  const onPointer = (event) => {
    if (condition === "D" && event?.type === "click") {
      resumeDFollowByInteraction();
    }
    scheduleRender();
    refreshAutoScroll();
  };
  const onResize = () => {
    scheduleRender();
    refreshAutoScroll();
  };
  const onWindowScroll = () => {
    handleScrollEvent(SCROLL_TARGET.WINDOW);
  };
  const onUserScrollIntent = () => {
    suspendDFollowByUserScroll();
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
    const isScrollKey = D_MODE_SCROLL_KEYS.has(event.key);
    if (condition === "D" && isScrollKey) {
      suspendDFollowByUserScroll();
      scheduleRender();
      refreshAutoScroll();
    }
    if (!isArrowUp && !isArrowDown) {
      return;
    }

    if (condition !== "D" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      scheduleRender();
      return;
    }

    resumeDFollowByInteraction();
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

  const userScrollIntentTargets = [surface, window];
  const userScrollIntentOptions = { passive: true };
  function bindUserScrollIntentListeners() {
    for (const target of userScrollIntentTargets) {
      for (const eventType of USER_SCROLL_INTENT_EVENTS) {
        target.addEventListener(eventType, onUserScrollIntent, userScrollIntentOptions);
      }
    }
  }

  function unbindUserScrollIntentListeners() {
    for (const target of userScrollIntentTargets) {
      for (const eventType of USER_SCROLL_INTENT_EVENTS) {
        target.removeEventListener(eventType, onUserScrollIntent, userScrollIntentOptions);
      }
    }
  }

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
  bindUserScrollIntentListeners();
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
      if (condition !== "D") {
        clearDFollowSuspension();
      }
      scheduleRender();
      refreshAutoScroll();
    },
    renderForRange(range, preserveOnFail = false) {
      return showOverlayAtRange(range, preserveOnFail);
    },
    destroy() {
      if (rafId) {
        cancelFrame(rafId);
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
      unbindUserScrollIntentListeners();
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onWindowScroll);
      if (programmaticScrollGuardResetRafId[SCROLL_TARGET.SURFACE]) {
        cancelFrame(programmaticScrollGuardResetRafId[SCROLL_TARGET.SURFACE]);
      }
      if (programmaticScrollGuardResetRafId[SCROLL_TARGET.WINDOW]) {
        cancelFrame(programmaticScrollGuardResetRafId[SCROLL_TARGET.WINDOW]);
      }
      hideOverlay();
    },
  };
}
