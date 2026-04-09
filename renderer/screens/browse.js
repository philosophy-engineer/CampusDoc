export function renderDesktopList(
  { appRoot, renderScreen, bindTopbarActions, escapeHtml, formatDateTimeForDisplay, filesApi, renderError },
  recentFiles
) {
  const items =
    recentFiles.length === 0
      ? '<p class="muted">최근 연 파일이 없습니다. 아래 버튼으로 시작해 주세요.</p>'
      : `<ul class="doc-list">${recentFiles
          .map((item) => {
            return `
              <li class="doc-list-item">
                <a class="doc-open-link" href="#/file/${encodeURIComponent(item.filePath)}">${escapeHtml(item.title)}</a>
                <p class="doc-list-meta">수정: ${escapeHtml(formatDateTimeForDisplay(item.updatedAt))}</p>
                <p class="doc-list-meta">${escapeHtml(item.filePath)}</p>
              </li>
            `;
          })
          .join("")}</ul>`;

  appRoot.innerHTML = renderScreen(
    `
      <section class="browse-layout">
        <section class="browse-section">
          <header class="browse-header">
            <p class="browse-file-guide">최근 연 파일</p>
          </header>
          ${items}
          <div class="desktop-actions">
            <button class="button button-primary" type="button" id="desktop-create">새 파일 만들기</button>
            <button class="button" type="button" id="desktop-open">파일 열기</button>
          </div>
        </section>
      </section>
    `,
    {
      screenClass: "browse-screen",
      leadingHtml: '<span class="app-mark">CampusDoc Desktop</span>',
    }
  );

  bindTopbarActions();

  const openButton = appRoot.querySelector("#desktop-open");
  if (openButton) {
    openButton.addEventListener("click", async () => {
      openButton.setAttribute("disabled", "true");
      try {
        const selected = await filesApi.openFileDialog();
        if (selected?.filePath) {
          window.location.hash = `#/file/${encodeURIComponent(selected.filePath)}`;
          return;
        }
      } catch (error) {
        renderError("파일 열기 실패", error.message || "파일을 열지 못했습니다.");
      } finally {
        openButton.removeAttribute("disabled");
      }
    });
  }

  const createButton = appRoot.querySelector("#desktop-create");
  if (createButton) {
    createButton.addEventListener("click", async () => {
      createButton.setAttribute("disabled", "true");
      try {
        window.location.hash = "#/new";
      } catch (error) {
        renderError("새 파일 열기 실패", error.message || "새 파일 편집기를 열지 못했습니다.");
      } finally {
        createButton.removeAttribute("disabled");
      }
    });
  }
}
