export function renderLoading({ appRoot, renderScreen, bindTopbarActions, escapeHtml }, message) {
  appRoot.innerHTML = renderScreen(
    `
      <h1>CampusDoc</h1>
      <p class="muted">${escapeHtml(message)}</p>
    `,
    {
      screenClass: "status-screen",
      leadingHtml: '<span class="app-mark">CampusDoc Desktop</span>',
    }
  );
  bindTopbarActions();
}

export function renderError({ appRoot, renderScreen, bindTopbarActions, escapeHtml }, title, message) {
  appRoot.innerHTML = renderScreen(
    `
      <h1>${escapeHtml(title)}</h1>
      <p class="muted">${escapeHtml(message)}</p>
      <p><a class="button" href="#/start">시작 화면으로</a></p>
    `,
    {
      screenClass: "error-screen",
      leadingHtml: '<span class="app-mark">CampusDoc Desktop</span>',
    }
  );
  bindTopbarActions();
}

export function renderElectronOnlyNotice({ appRoot, renderScreen, bindTopbarActions }) {
  appRoot.innerHTML = renderScreen(
    `
      <h1>Electron 실행이 필요합니다.</h1>
      <p class="muted">이 앱은 Desktop(Electron) 전용으로 동작합니다.</p>
      <p class="muted">프로젝트 루트에서 <code>npm run dev</code> 또는 <code>npm start</code>로 실행해 주세요.</p>
    `,
    {
      screenClass: "status-screen",
      leadingHtml: '<span class="app-mark">CampusDoc Desktop</span>',
    }
  );
  bindTopbarActions();
}

export function renderStartHome({ appRoot, renderScreen, bindTopbarActions }) {
  appRoot.innerHTML = renderScreen(
    `
      <section class="home-grid" aria-label="시작 옵션">
        <a class="home-card home-card-action" href="#/browse">
          <span class="home-card-title">문서 작업 시작</span>
        </a>
      </section>
    `,
    {
      screenClass: "home-screen",
      leadingHtml: '<span class="app-mark">CampusDoc Desktop</span>',
    }
  );

  bindTopbarActions();
}
