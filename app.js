const app = document.getElementById("app");

const state = {
  manifest: null,
  manifestPromise: null,
};

function isSafeTxtFilename(name) {
  return typeof name === "string" && /^[^/\\]+\.txt$/i.test(name);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function routeFromHash() {
  const hash = window.location.hash;
  if (!hash || hash === "#" || hash === "#/") {
    return { type: "list" };
  }

  if (hash.startsWith("#/file/")) {
    const encodedName = hash.slice("#/file/".length);
    try {
      const name = decodeURIComponent(encodedName);
      return { type: "file", name };
    } catch {
      return { type: "invalid" };
    }
  }

  return { type: "invalid" };
}

function renderLoading(message) {
  app.innerHTML = `
    <h1>TXT 파일 목록</h1>
    <p class="muted">${escapeHtml(message)}</p>
  `;
}

function renderError(title, message) {
  app.innerHTML = `
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">${escapeHtml(message)}</p>
    <p><a class="button" href="#/">목록으로 돌아가기</a></p>
  `;
}

function renderList(files) {
  if (files.length === 0) {
    app.innerHTML = `
      <h1>TXT 파일 목록</h1>
      <p class="muted">표시할 txt 파일이 없습니다.</p>
    `;
    return;
  }

  const items = files
    .map((name) => {
      const encoded = encodeURIComponent(name);
      return `<li><a class="file-link" href="#/file/${encoded}">${escapeHtml(name)}</a></li>`;
    })
    .join("");

  app.innerHTML = `
    <h1>TXT 파일 목록</h1>
    <ul class="file-list">${items}</ul>
  `;
}

function renderFile(name, content) {
  app.innerHTML = `
    <div class="actions">
      <a class="button" href="#/">뒤로가기</a>
    </div>
    <h1>${escapeHtml(name)}</h1>
    <div class="content">
      <pre>${escapeHtml(content)}</pre>
    </div>
  `;
}

async function loadManifest() {
  if (state.manifest) {
    return state.manifest;
  }

  if (!state.manifestPromise) {
    state.manifestPromise = fetch("./files/manifest.json", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`manifest 요청 실패 (${res.status})`);
        }
        const data = await res.json();
        if (!data || !Array.isArray(data.files)) {
          throw new Error("manifest 형식이 올바르지 않습니다. (files 배열 필요)");
        }
        const sanitized = [...new Set(data.files.filter(isSafeTxtFilename))];
        state.manifest = sanitized;
        return sanitized;
      })
      .catch((error) => {
        state.manifestPromise = null;
        throw error;
      });
  }

  return state.manifestPromise;
}

async function loadTxtFile(name) {
  const res = await fetch(`./files/${encodeURIComponent(name)}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`파일을 불러오지 못했습니다. (${res.status})`);
  }
  return res.text();
}

async function renderRoute() {
  const route = routeFromHash();

  if (route.type === "invalid") {
    renderError("잘못된 경로입니다.", "목록 화면으로 이동해 주세요.");
    return;
  }

  renderLoading("로딩 중...");

  let files;
  try {
    files = await loadManifest();
  } catch (error) {
    renderError("목록을 불러올 수 없습니다.", error.message);
    return;
  }

  if (route.type === "list") {
    renderList(files);
    return;
  }

  if (!isSafeTxtFilename(route.name)) {
    renderError("잘못된 파일명입니다.", "요청한 파일명을 확인해 주세요.");
    return;
  }

  if (!files.includes(route.name)) {
    renderError("파일을 찾을 수 없습니다.", "manifest 목록에 없는 파일입니다.");
    return;
  }

  try {
    const text = await loadTxtFile(route.name);
    renderFile(route.name, text);
  } catch (error) {
    renderError("파일 로딩 실패", error.message);
  }
}

window.addEventListener("hashchange", renderRoute);
window.addEventListener("DOMContentLoaded", () => {
  if (!window.location.hash) {
    window.location.hash = "#/";
    return;
  }
  renderRoute();
});
