/** @vitest-environment jsdom */

import { getByRole } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEditorModeController } from "../../renderer/editor/mode-controller.js";

function createRect({ left, top, width, height }) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {
      return this;
    },
  };
}

function createCollapsedRange(node, offset, rect) {
  return {
    collapsed: true,
    startContainer: node,
    startOffset: offset,
    getBoundingClientRect: () => rect,
    getClientRects: () => [rect],
  };
}

function createFixture() {
  document.body.innerHTML = `
    <div id="surface" class="editor-textarea-wrap">
      <div id="overlay" class="line-overlay editor-line-overlay" aria-hidden="true"></div>
      <div
        id="editor"
        class="editor-textarea"
        role="textbox"
        aria-multiline="true"
        aria-label="문서 내용 편집"
        contenteditable="plaintext-only"
      ></div>
    </div>
  `;

  const surface = document.getElementById("surface");
  const overlay = document.getElementById("overlay");
  const editor = getByRole(document.body, "textbox", { name: "문서 내용 편집" });
  const textNode = document.createTextNode("a\n\nhello world");
  editor.append(textNode);

  const surfaceRect = createRect({ left: 10, top: 20, width: 300, height: 200 });
  const editorRect = createRect({ left: 10, top: 20, width: 300, height: 200 });
  surface.getBoundingClientRect = () => surfaceRect;
  editor.getBoundingClientRect = () => editorRect;
  Object.defineProperty(surface, "scrollTop", { value: 0, writable: true, configurable: true });
  Object.defineProperty(surface, "scrollLeft", { value: 0, writable: true, configurable: true });
  Object.defineProperty(surface, "scrollHeight", { value: 200, configurable: true });
  Object.defineProperty(surface, "clientHeight", { value: 200, configurable: true });

  return { surface, overlay, editor, textNode };
}

function createRafHarness() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    requestFrame: vi.fn((callback) => {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    }),
    cancelFrame: vi.fn((id) => {
      callbacks.delete(id);
    }),
    runSteps(maxSteps = 12) {
      for (let step = 0; step < maxSteps; step += 1) {
        const iterator = callbacks.entries().next();
        if (iterator.done) {
          break;
        }
        const [id, callback] = iterator.value;
        callbacks.delete(id);
        callback();
      }
    },
  };
}

function setSurfaceScrollability(surface, scrollHeight, clientHeight) {
  Object.defineProperty(surface, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(surface, "clientHeight", { value: clientHeight, configurable: true });
}

function setSelectionAt(node, offset) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function mockRangeRect(rect) {
  vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(() => rect);
  vi.spyOn(Range.prototype, "getClientRects").mockImplementation(() => [rect]);
}

function mockSelectionWithModify(textNode, offset = 1) {
  const selection = {
    rangeCount: 1,
    focusNode: textNode,
    focusOffset: offset,
    anchorNode: textNode,
    anchorOffset: offset,
    modify: vi.fn(),
    removeAllRanges: vi.fn(),
    addRange: vi.fn(),
  };
  vi.spyOn(window, "getSelection").mockImplementation(() => selection);
  return selection;
}

function mockWindowScroll(initialY = 0, scrollHeight = 5000) {
  Object.defineProperty(window, "scrollY", { value: initialY, writable: true, configurable: true });
  Object.defineProperty(document.documentElement, "scrollHeight", { value: scrollHeight, configurable: true });
  vi.spyOn(window, "scrollTo").mockImplementation((_x, y) => {
    window.scrollY = Number(y) || 0;
  });
}

const SCROLL_CONTEXT_CASES = [
  {
    name: "window",
    prepare() {
      mockWindowScroll();
    },
    setManualPosition() {
      window.scrollY = 180;
    },
    dispatchScroll() {
      window.dispatchEvent(new Event("scroll"));
    },
    setNearEdgeRect() {
      mockRangeRect(createRect({ left: 120, top: window.innerHeight - 8, width: 1, height: 22 }));
    },
    getScrollPosition() {
      return window.scrollY;
    },
    expectProgrammaticStartMoved() {
      expect(window.scrollY).toBeGreaterThan(0);
    },
  },
  {
    name: "surface",
    prepare(surface) {
      setSurfaceScrollability(surface, 1200, 200);
    },
    setManualPosition(surface) {
      surface.scrollTop = 160;
    },
    dispatchScroll(surface) {
      surface.dispatchEvent(new Event("scroll"));
    },
    setNearEdgeRect() {
      mockRangeRect(createRect({ left: 120, top: 208, width: 1, height: 22 }));
    },
    getScrollPosition(surface) {
      return surface.scrollTop;
    },
    expectProgrammaticStartMoved(surface) {
      expect(surface.scrollTop).toBeGreaterThan(0);
    },
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  delete document.caretRangeFromPoint;
  document.body.innerHTML = "";
});

beforeEach(() => {
  if (typeof Range !== "undefined") {
    if (!Range.prototype.getBoundingClientRect) {
      Range.prototype.getBoundingClientRect = () => createRect({ left: 120, top: 60, width: 8, height: 22 });
    }
    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = () => [createRect({ left: 120, top: 60, width: 8, height: 22 })];
    }
  }
});

describe("createEditorModeController", () => {
  it("D 모드 빈 줄에서는 오버레이를 숨긴다", () => {
    const { overlay, editor, textNode } = createFixture();
    const controller = createEditorModeController(editor, overlay, {
      getCondition: () => "D",
      requestFrame: () => 1,
      cancelFrame: () => {},
    });

    const blankLineRange = createCollapsedRange(textNode, 2, createRect({ left: 110, top: 60, width: 0, height: 22 }));
    const shown = controller.renderForRange(blankLineRange);

    expect(shown).toBe(false);
    expect(overlay.style.display).toBe("none");

    controller.destroy();
  });

  it("D 모드 텍스트 줄은 전체 폭으로 강조한다", () => {
    const { overlay, editor, textNode } = createFixture();
    const controller = createEditorModeController(editor, overlay, {
      getCondition: () => "D",
      requestFrame: () => 1,
      cancelFrame: () => {},
    });

    const seedRange = createCollapsedRange(textNode, 1, createRect({ left: 120, top: 60, width: 8, height: 22 }));
    document.caretRangeFromPoint = vi.fn((x) => {
      const left = Math.max(10, Math.min(302, Number(x)));
      return createCollapsedRange(textNode, 1, createRect({ left, top: 60, width: 8, height: 22 }));
    });

    const shown = controller.renderForRange(seedRange);

    expect(shown).toBe(true);
    expect(parseFloat(overlay.style.width)).toBeGreaterThan(100);
    expect(overlay.classList.contains("mode-d")).toBe(true);

    controller.destroy();
  });

  it("모드 적용 시 C 클래스가 반영된다", () => {
    const { overlay, editor, textNode } = createFixture();
    const controller = createEditorModeController(editor, overlay, {
      getCondition: () => "A",
      requestFrame: () => 1,
      cancelFrame: () => {},
    });

    const range = createCollapsedRange(textNode, 1, createRect({ left: 120, top: 60, width: 8, height: 22 }));
    document.caretRangeFromPoint = vi.fn((x) => {
      const left = Math.max(10, Math.min(302, Number(x)));
      return createCollapsedRange(textNode, 1, createRect({ left, top: 60, width: 8, height: 22 }));
    });

    controller.applyCondition("C");
    controller.renderForRange(range);

    expect(overlay.classList.contains("mode-c")).toBe(true);
    expect(overlay.classList.contains("mode-d")).toBe(false);

    controller.destroy();
  });

  it("D 모드 ArrowDown에서 selection.modify를 사용한다", () => {
    const { overlay, editor, textNode } = createFixture();
    const selection = {
      rangeCount: 1,
      focusNode: textNode,
      focusOffset: 1,
      anchorNode: textNode,
      anchorOffset: 1,
      modify: vi.fn(),
      removeAllRanges: vi.fn(),
      addRange: vi.fn(),
    };

    vi.spyOn(window, "getSelection").mockImplementation(() => selection);

    const controller = createEditorModeController(editor, overlay, {
      getCondition: () => "D",
      requestFrame: () => 1,
      cancelFrame: () => {},
    });

    editor.focus();
    const event = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    editor.dispatchEvent(event);

    expect(selection.modify).toHaveBeenCalledWith("move", "forward", "line");
    expect(event.defaultPrevented).toBe(true);

    controller.destroy();
  });

  describe.each(SCROLL_CONTEXT_CASES)("D 모드 스크롤 컨텍스트: $name", (contextCase) => {
    it("수동 스크롤 후 자동 추적을 재시작하지 않는다", () => {
      const { surface, overlay, editor, textNode } = createFixture();
      const raf = createRafHarness();
      contextCase.prepare(surface);
      setSelectionAt(textNode, 1);
      mockRangeRect(createRect({ left: 120, top: 80, width: 1, height: 22 }));

      const controller = createEditorModeController(editor, overlay, {
        getCondition: () => "D",
        requestFrame: raf.requestFrame,
        cancelFrame: raf.cancelFrame,
      });

      editor.focus();
      contextCase.setManualPosition(surface);
      contextCase.dispatchScroll(surface);
      contextCase.setNearEdgeRect();

      document.dispatchEvent(new Event("selectionchange"));
      const before = contextCase.getScrollPosition(surface);
      raf.runSteps(10);

      expect(contextCase.getScrollPosition(surface)).toBe(before);
      controller.destroy();
    });

    it("프로그램 스크롤 이벤트는 수동 스크롤로 오인되지 않는다", () => {
      const { surface, overlay, editor, textNode } = createFixture();
      const raf = createRafHarness();
      contextCase.prepare(surface);
      contextCase.setNearEdgeRect();
      mockSelectionWithModify(textNode, 1);

      const controller = createEditorModeController(editor, overlay, {
        getCondition: () => "D",
        requestFrame: raf.requestFrame,
        cancelFrame: raf.cancelFrame,
      });

      editor.focus();
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      contextCase.expectProgrammaticStartMoved(surface);

      contextCase.dispatchScroll(surface);
      const before = contextCase.getScrollPosition(surface);
      document.dispatchEvent(new Event("selectionchange"));
      raf.runSteps(10);

      expect(contextCase.getScrollPosition(surface)).toBeGreaterThan(before);
      controller.destroy();
    });
  });

  it("중단 상태에서 ArrowDown 입력으로 자동 추적을 재개한다", () => {
    const { overlay, editor, textNode } = createFixture();
    const raf = createRafHarness();
    mockWindowScroll();
    mockRangeRect(createRect({ left: 120, top: 80, width: 1, height: 22 }));
    mockSelectionWithModify(textNode, 1);

    const controller = createEditorModeController(editor, overlay, {
      getCondition: () => "D",
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
    });

    editor.focus();
    window.scrollY = 200;
    window.dispatchEvent(new Event("scroll"));
    mockRangeRect(createRect({ left: 120, top: window.innerHeight - 8, width: 1, height: 22 }));

    document.dispatchEvent(new Event("selectionchange"));
    raf.runSteps(8);
    const paused = window.scrollY;
    expect(window.scrollY).toBe(paused);

    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    const afterKeydown = window.scrollY;
    raf.runSteps(8);

    expect(window.scrollY).toBeGreaterThan(afterKeydown);
    controller.destroy();
  });

  it("중단 상태에서 클릭 입력으로 자동 추적을 재개한다", () => {
    const { surface, overlay, editor, textNode } = createFixture();
    const raf = createRafHarness();
    setSurfaceScrollability(surface, 1200, 200);
    setSelectionAt(textNode, 1);
    mockRangeRect(createRect({ left: 120, top: 80, width: 1, height: 22 }));

    const controller = createEditorModeController(editor, overlay, {
      getCondition: () => "D",
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
    });

    editor.focus();
    surface.scrollTop = 140;
    surface.dispatchEvent(new Event("scroll"));
    mockRangeRect(createRect({ left: 120, top: 208, width: 1, height: 22 }));

    document.dispatchEvent(new Event("selectionchange"));
    raf.runSteps(8);
    const paused = surface.scrollTop;
    expect(surface.scrollTop).toBe(paused);

    editor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const afterClick = surface.scrollTop;
    raf.runSteps(8);

    expect(surface.scrollTop).toBeGreaterThan(afterClick);
    controller.destroy();
  });

  it("중단 상태에서 커서 줄이 화면 밖이면 오버레이를 숨긴다", () => {
    const { surface, overlay, editor, textNode } = createFixture();
    const raf = createRafHarness();
    setSurfaceScrollability(surface, 1200, 200);
    setSelectionAt(textNode, 1);

    const controller = createEditorModeController(editor, overlay, {
      getCondition: () => "D",
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
    });

    const visible = createCollapsedRange(textNode, 1, createRect({ left: 120, top: 80, width: 8, height: 22 }));
    controller.renderForRange(visible);
    expect(overlay.style.display).toBe("block");

    editor.focus();
    surface.scrollTop = 140;
    surface.dispatchEvent(new Event("scroll"));
    mockRangeRect(createRect({ left: 120, top: -120, width: 1, height: 22 }));

    document.dispatchEvent(new Event("selectionchange"));
    raf.runSteps(8);

    expect(overlay.style.display).toBe("none");
    controller.destroy();
  });

  it("wheel 의도 입력만으로도 D 모드 자동 추적을 즉시 중단한다", () => {
    const { overlay, editor, textNode } = createFixture();
    const raf = createRafHarness();
    mockWindowScroll();
    setSelectionAt(textNode, 1);
    mockRangeRect(createRect({ left: 120, top: window.innerHeight - 8, width: 1, height: 22 }));

    const controller = createEditorModeController(editor, overlay, {
      getCondition: () => "D",
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
    });

    editor.focus();
    document.dispatchEvent(new Event("selectionchange"));
    raf.runSteps(6);

    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 120 }));
    const before = window.scrollY;
    document.dispatchEvent(new Event("selectionchange"));
    raf.runSteps(10);

    expect(window.scrollY).toBe(before);
    controller.destroy();
  });

  it("프로그램 스크롤 가드가 다음 프레임에 해제되어 이후 사용자 스크롤을 정상 감지한다", () => {
    const { overlay, editor, textNode } = createFixture();
    const raf = createRafHarness();
    mockWindowScroll();
    mockRangeRect(createRect({ left: 120, top: window.innerHeight - 8, width: 1, height: 22 }));
    mockSelectionWithModify(textNode, 1);

    const controller = createEditorModeController(editor, overlay, {
      getCondition: () => "D",
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
    });

    editor.focus();
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(window.scrollY).toBeGreaterThan(0);

    // scroll 이벤트가 없더라도 가드가 프레임 경계에서 해제되어야 한다.
    raf.runSteps(4);

    window.scrollY = 220;
    window.dispatchEvent(new Event("scroll"));
    const before = window.scrollY;
    document.dispatchEvent(new Event("selectionchange"));
    raf.runSteps(10);

    expect(window.scrollY).toBe(before);
    controller.destroy();
  });
});
