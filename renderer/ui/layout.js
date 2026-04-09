export function renderTopbar(leadingHtml = "", { showSettingsButton = true } = {}) {
  return `
    <header class="topbar">
      <div class="topbar-leading">${leadingHtml}</div>
      <div class="topbar-actions">
        ${
          showSettingsButton
            ? '<button class="topbar-action" type="button" id="open-settings-button">설정</button>'
            : ""
        }
      </div>
    </header>
  `;
}

export function renderScreen(contentHtml, { screenClass = "", leadingHtml = "", showSettingsButton = true } = {}) {
  return `
    <section class="screen ${screenClass}">
      ${renderTopbar(leadingHtml, { showSettingsButton })}
      ${contentHtml}
    </section>
  `;
}

export function bindTopbarActions(root, { onOpenSettings }) {
  const settingsButton = root.querySelector("#open-settings-button");
  if (settingsButton && typeof onOpenSettings === "function") {
    settingsButton.addEventListener("click", onOpenSettings);
  }
}
