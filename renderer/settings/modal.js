import { CONDITION_SHORT_LABEL, VALID_CONDITIONS } from "../constants.js";

export function createSettingsModalController({
  store,
  escapeHtml,
}) {
  let modalNode = null;

  function close() {
    if (!modalNode) {
      return;
    }
    modalNode.classList.add("hidden");
  }

  function ensure() {
    if (modalNode) {
      return modalNode;
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
    modalNode = node;

    node.querySelectorAll('[data-close-settings="true"]').forEach((closeTarget) => {
      closeTarget.addEventListener("click", close);
    });

    node.querySelectorAll('input[name="settings-theme"]').forEach((input) => {
      input.addEventListener("change", (event) => {
        store.setTheme(event.target.value);
      });
    });

    node.querySelectorAll('input[name="settings-condition"]').forEach((input) => {
      input.addEventListener("change", (event) => {
        store.setCondition(event.target.value);
      });
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modalNode && !modalNode.classList.contains("hidden")) {
        close();
      }
    });

    return modalNode;
  }

  function syncInputs() {
    const modal = ensure();
    const currentTheme = store.getTheme();
    const currentCondition = store.getCondition();

    modal.querySelectorAll('input[name="settings-theme"]').forEach((input) => {
      input.checked = input.value === currentTheme;
    });

    modal.querySelectorAll('input[name="settings-condition"]').forEach((input) => {
      input.checked = input.value === currentCondition;
    });
  }

  function open() {
    const modal = ensure();
    syncInputs();
    modal.classList.remove("hidden");

    const focusTarget = modal.querySelector('input[name="settings-condition"]:checked') || modal.querySelector("button");
    if (focusTarget) {
      focusTarget.focus();
    }
  }

  return {
    ensure,
    open,
    close,
  };
}
