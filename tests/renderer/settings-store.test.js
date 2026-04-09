import { describe, expect, it, vi } from "vitest";

import { createSettingsStore } from "../../renderer/settings/store.js";

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

describe("settings store", () => {
  it("유효하지 않은 값은 기본값으로 보정한다", () => {
    const storage = createMemoryStorage({
      hci_reader_theme: "invalid",
      hci_reader_condition: "X",
    });
    const body = { dataset: {} };
    const store = createSettingsStore({ storage, body });

    expect(store.getTheme()).toBe("dark");
    expect(store.getCondition()).toBe("A");
  });

  it("setTheme/setCondition은 저장과 구독 알림을 수행한다", () => {
    const storage = createMemoryStorage();
    const body = { dataset: {} };
    const store = createSettingsStore({ storage, body });
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.setTheme("light")).toBe("light");
    expect(store.setCondition("D")).toBe("D");

    expect(body.dataset.theme).toBe("light");
    expect(storage.getItem("hci_reader_theme")).toBe("light");
    expect(storage.getItem("hci_reader_condition")).toBe("D");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
