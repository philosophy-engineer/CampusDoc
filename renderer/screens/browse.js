export function renderDesktopList(
  { appRoot, renderScreen, bindTopbarActions, escapeHtml, formatDateTimeForDisplay, filesApi, renderRoute, renderError },
  docs
) {
  const items =
    docs.length === 0
      ? '<p class="muted">아직 문서가 없습니다. TXT를 가져오거나 새 문서를 만들어 주세요.</p>'
      : `<ul class="doc-list">${docs
          .map((doc) => {
            return `
              <li class="doc-list-item">
                <a class="doc-open-link" href="#/file/${encodeURIComponent(doc.docId)}">${escapeHtml(doc.title)}</a>
                <p class="doc-list-meta">수정: ${escapeHtml(formatDateTimeForDisplay(doc.updatedAt))}</p>
              </li>
            `;
          })
          .join("")}</ul>`;

  appRoot.innerHTML = renderScreen(
    `
      <section class="browse-layout">
        <section class="browse-section">
          <header class="browse-header">
            <p class="browse-file-guide">내 작업 문서</p>
            <div class="desktop-actions">
              <button class="button" type="button" id="desktop-import">TXT 가져오기</button>
              <button class="button button-primary" type="button" id="desktop-create">새 문서</button>
            </div>
          </header>
          ${items}
        </section>
      </section>
    `,
    {
      screenClass: "browse-screen",
      leadingHtml: '<a class="browse-home-button" href="#/start">시작으로</a>',
    }
  );

  bindTopbarActions();

  const importButton = appRoot.querySelector("#desktop-import");
  if (importButton) {
    importButton.addEventListener("click", async () => {
      importButton.setAttribute("disabled", "true");
      try {
        const imported = await filesApi.importTxt();
        if (imported && imported.docId) {
          window.location.hash = `#/file/${encodeURIComponent(imported.docId)}`;
          return;
        }
        await renderRoute();
      } catch (error) {
        renderError("TXT 가져오기 실패", error.message || "파일을 가져오지 못했습니다.");
      } finally {
        importButton.removeAttribute("disabled");
      }
    });
  }

  const createButton = appRoot.querySelector("#desktop-create");
  if (createButton) {
    createButton.addEventListener("click", async () => {
      const titleInput = window.prompt("새 문서 제목을 입력해 주세요.", "새 문서");
      if (titleInput === null) {
        return;
      }

      createButton.setAttribute("disabled", "true");
      try {
        const created = await filesApi.createDoc(titleInput);
        if (created?.docId) {
          window.location.hash = `#/file/${encodeURIComponent(created.docId)}`;
          return;
        }
        await renderRoute();
      } catch (error) {
        renderError("문서 생성 실패", error.message || "새 문서를 만들지 못했습니다.");
      } finally {
        createButton.removeAttribute("disabled");
      }
    });
  }
}
