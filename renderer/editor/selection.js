export function getCaretRangeFromPoint(x, y) {
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

export function getRangeRect(range, preferredY) {
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

export function estimateLineHeight(element) {
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

export function isTextNode(node) {
  return node && node.nodeType === Node.TEXT_NODE;
}

export function isRangeInsideElement(range, root) {
  const node = range?.startContainer;
  return Boolean(node && (node === root || root.contains(node)));
}

export function getSelectionCaretRangeIn(root) {
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

export function isCollapsedCaretOnBlankLine(range) {
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

export function getExpandedRect(range, preferredY, root) {
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

  const rootRect = root.getBoundingClientRect();
  const fallbackRange = getCaretRangeFromPoint(
    rootRect.left + 4,
    Math.min(rootRect.bottom - 2, Math.max(rootRect.top + 2, preferredY))
  );
  if (fallbackRange && isRangeInsideElement(fallbackRange, root)) {
    const rect = getRangeRect(fallbackRange, preferredY);
    if (rect) {
      return rect;
    }
  }

  return direct;
}

export function isSameVisualLine(a, b) {
  const midA = a.top + a.height / 2;
  const midB = b.top + b.height / 2;
  const tolerance = Math.max(4, Math.min(a.height, b.height) * 0.7);
  return Math.abs(midA - midB) <= tolerance;
}

export function measureLineSpan(seedRect, clientY, root) {
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

export function setSelectionAtRange(range) {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  selection.removeAllRanges();
  selection.addRange(range);
}
