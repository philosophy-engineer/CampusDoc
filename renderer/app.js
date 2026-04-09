import { routeFromHash } from "./routing.js";
import { createSettingsStore } from "./settings/store.js";
import { createSettingsModalController } from "./settings/modal.js";
import { bindTopbarActions, renderScreen } from "./ui/layout.js";
import { renderDesktopList } from "./screens/browse.js";
import { renderDesktopEditor } from "./screens/editor.js";
import { renderElectronOnlyNotice, renderError, renderLoading, renderStartHome } from "./screens/basic.js";
import { escapeHtml, formatDateTimeForDisplay, isLikelyDocId } from "./utils/common.js";

export function startApp() {
  const appRoot = document.getElementById("app");
  if (!appRoot) {
    throw new Error("#app 요소를 찾을 수 없습니다.");
  }

  const filesApi = window.campusDoc?.files ?? null;
  const isElectronDesktop = Boolean(filesApi);

  const settingsStore = createSettingsStore();
  const settingsModal = createSettingsModalController({
    store: settingsStore,
    escapeHtml,
  });

  let screenCleanup = null;

  function teardownScreenSession() {
    if (typeof screenCleanup === "function") {
      screenCleanup();
    }
    screenCleanup = null;
  }

  const uiContext = {
    appRoot,
    renderScreen,
    bindTopbarActions: () => bindTopbarActions(appRoot, { onOpenSettings: settingsModal.open }),
    escapeHtml,
    formatDateTimeForDisplay,
    filesApi,
    settingsStore,
    renderRoute,
    renderError: (title, message) => renderError(uiContext, title, message),
  };

  async function renderRoute() {
    teardownScreenSession();

    if (!isElectronDesktop) {
      renderElectronOnlyNotice(uiContext);
      return;
    }

    const route = routeFromHash();

    if (route.type === "legacy_redirect") {
      window.location.hash = "#/start";
      return;
    }

    if (route.type === "invalid") {
      renderError(uiContext, "잘못된 경로입니다.", "시작 화면으로 이동해 주세요.");
      return;
    }

    if (route.type === "start") {
      renderStartHome(uiContext);
      return;
    }

    if (route.type === "browse") {
      renderLoading(uiContext, "문서 목록을 불러오는 중...");
      try {
        const docs = await filesApi.listDocs();
        renderDesktopList(uiContext, docs);
      } catch (error) {
        renderError(uiContext, "문서 목록 로딩 실패", error.message || "문서 목록을 가져오지 못했습니다.");
      }
      return;
    }

    if (!isLikelyDocId(route.name)) {
      renderError(uiContext, "잘못된 문서 ID입니다.", "문서 목록으로 돌아가 다시 선택해 주세요.");
      return;
    }

    renderLoading(uiContext, "문서를 여는 중...");
    try {
      const result = await filesApi.readDoc(route.name);
      screenCleanup = renderDesktopEditor(uiContext, result.meta, result.content);
    } catch (error) {
      renderError(uiContext, "문서 열기 실패", error.message || "문서를 열 수 없습니다.");
    }
  }

  window.addEventListener("hashchange", renderRoute);
  window.addEventListener("DOMContentLoaded", () => {
    settingsStore.applyTheme(settingsStore.getTheme());
    settingsModal.ensure();

    if (!window.location.hash || window.location.hash === "#/" || window.location.hash === "#") {
      window.location.hash = "#/start";
      return;
    }

    renderRoute();
  });
}
