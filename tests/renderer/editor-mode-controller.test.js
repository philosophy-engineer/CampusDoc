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
});
