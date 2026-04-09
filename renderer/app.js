import { routeFromHash } from "./routing.js";
import { createSettingsStore } from "./settings/store.js";
import { createSettingsModalController } from "./settings/modal.js";
import { bindTopbarActions, renderScreen } from "./ui/layout.js";
import { renderDesktopList } from "./screens/browse.js";
import { renderDesktopEditor } from "./screens/editor.js";
import { renderElectronOnlyNotice, renderError, renderLoading } from "./screens/basic.js";
import { escapeHtml, formatDateTimeForDisplay } from "./utils/common.js";

function normalizeHash(hash) {
  if (!hash || hash === "#" || hash === "#/" || hash === "#/start" || hash === "#/study" || hash === "#/records") {
    return "#/browse";
  }
  return hash;
}

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

  let screenSession = null;
  let activeHash = "";
  let isNavigating = false;
  let suppressNextHashChange = false;

  function teardownScreenSession() {
    if (screenSession && typeof screenSession.cleanup === "function") {
      screenSession.cleanup();
    }
    screenSession = null;
  }

  const uiContext = {
    appRoot,
    renderScreen,
    bindTopbarActions: () => bindTopbarActions(appRoot, { onOpenSettings: settingsModal.open }),
    escapeHtml,
    formatDateTimeForDisplay,
    filesApi,
    settingsStore,
    renderRoute: (hash) => handleNavigation(hash || window.location.hash),
    renderError: (title, message) => renderError(uiContext, title, message),
  };

  const setHashWithoutLoop = (nextHash) => {
    if (window.location.hash === nextHash) {
      return;
    }
    suppressNextHashChange = true;
    window.location.hash = nextHash;
  };

  const canLeaveCurrentEditor = async () => {
    if (!screenSession || typeof screenSession.isDirty !== "function" || !screenSession.isDirty()) {
      return true;
    }

    const decision = await filesApi.confirmUnsavedChanges(screenSession.getTitle?.() || "Untitled");
    if (decision?.action === "save") {
      return screenSession.save();
    }
    if (decision?.action === "discard") {
      return true;
    }
    return false;
  };

  async function renderRouteForHash(hash) {
    teardownScreenSession();

    if (!isElectronDesktop) {
      renderElectronOnlyNotice(uiContext);
      return;
    }

    const route = routeFromHash(hash);
    if (route.type === "invalid") {
      renderError(uiContext, "잘못된 경로입니다.", "최근 파일 화면으로 이동해 주세요.");
      return;
    }

    if (route.type === "browse") {
      renderLoading(uiContext, "최근 파일 목록을 불러오는 중...");
      try {
        let recent = await filesApi.listRecentFiles();
        if (recent.missing.length > 0) {
          const shouldCleanup = window.confirm(
            `없는 최근 파일 ${recent.missing.length}개가 있습니다. 목록에서 정리할까요?`
          );
          if (shouldCleanup) {
            await filesApi.removeRecentMissing(recent.missing);
            recent = await filesApi.listRecentFiles();
          }
        }
        renderDesktopList(uiContext, recent.existing);
      } catch (error) {
        renderError(uiContext, "최근 파일 로딩 실패", error.message || "최근 파일 목록을 가져오지 못했습니다.");
      }
      return;
    }

    if (route.type === "new") {
      renderLoading(uiContext, "새 파일을 준비하는 중...");
      try {
        const untitled = await filesApi.createUntitled();
        screenSession = renderDesktopEditor(uiContext, untitled.meta, untitled.content);
      } catch (error) {
        renderError(uiContext, "새 파일 생성 실패", error.message || "새 파일 편집기를 열 수 없습니다.");
      }
      return;
    }

    renderLoading(uiContext, "파일을 여는 중...");
    try {
      const result = await filesApi.openFileByPath(route.filePath);
      screenSession = renderDesktopEditor(uiContext, result.meta, result.content);
    } catch (error) {
      if (error?.code === "NOT_SUPPORTED_FORMAT") {
        renderError(
          uiContext,
          "포맷 준비 중",
          `${String(error.format || "unknown").toUpperCase()} 포맷 ${error.action || "작업"}은 아직 준비 중입니다.`
        );
        return;
      }
      renderError(uiContext, "파일 열기 실패", error.message || "파일을 열 수 없습니다.");
    }
  }

  async function handleNavigation(nextHash) {
    const normalizedHash = normalizeHash(nextHash);
    if (isNavigating) {
      return;
    }

    isNavigating = true;
    try {
      const movingToNewRoute = Boolean(activeHash) && normalizedHash !== activeHash;
      if (movingToNewRoute) {
        const canLeave = await canLeaveCurrentEditor();
        if (!canLeave) {
          setHashWithoutLoop(activeHash);
          return;
        }
      }

      await renderRouteForHash(normalizedHash);
      activeHash = normalizedHash;
      setHashWithoutLoop(normalizedHash);
    } finally {
      isNavigating = false;
    }
  }

  window.addEventListener("hashchange", () => {
    if (suppressNextHashChange) {
      suppressNextHashChange = false;
      return;
    }
    handleNavigation(window.location.hash);
  });

  window.addEventListener("beforeunload", (event) => {
    if (!screenSession || typeof screenSession.isDirty !== "function" || !screenSession.isDirty()) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

  window.addEventListener("DOMContentLoaded", () => {
    settingsStore.applyTheme(settingsStore.getTheme());
    settingsModal.ensure();

    const initialHash = normalizeHash(window.location.hash);
    if (window.location.hash !== initialHash) {
      setHashWithoutLoop(initialHash);
    }
    handleNavigation(initialHash);
  });
}
