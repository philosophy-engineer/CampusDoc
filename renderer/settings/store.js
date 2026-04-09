import { CONDITION_KEY, THEME_KEY, VALID_CONDITIONS, VALID_THEMES } from "../constants.js";

export function createSettingsStore({ storage = window.localStorage, body = document.body } = {}) {
  const listeners = new Set();

  function getCondition() {
    const raw = storage.getItem(CONDITION_KEY);
    return VALID_CONDITIONS.includes(raw) ? raw : "A";
  }

  function getTheme() {
    const raw = storage.getItem(THEME_KEY);
    return VALID_THEMES.includes(raw) ? raw : "dark";
  }

  function notifySettingsChanged() {
    const payload = {
      condition: getCondition(),
      theme: getTheme(),
    };

    listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch {
        // ignore listener errors and keep the app responsive
      }
    });
  }

  function applyTheme(theme) {
    const value = VALID_THEMES.includes(theme) ? theme : "dark";
    if (body) {
      body.dataset.theme = value;
    }
    return value;
  }

  function setTheme(next) {
    const value = applyTheme(next);
    storage.setItem(THEME_KEY, value);
    notifySettingsChanged();
    return value;
  }

  function setCondition(next) {
    const value = VALID_CONDITIONS.includes(next) ? next : "A";
    storage.setItem(CONDITION_KEY, value);
    notifySettingsChanged();
    return value;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getCondition,
    setCondition,
    getTheme,
    applyTheme,
    setTheme,
    subscribe,
  };
}
