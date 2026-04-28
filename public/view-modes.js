(() => {
  const MODE_KEY = "mdl.songViewMode";
  const DEFAULT_MODE = "large";
  const MODES = [
    { id: "list", label: "Lista" },
    { id: "compact", label: "Ícones pequenos" },
    { id: "large", label: "Ícones grandes" }
  ];

  function isTabletOrPc() {
    return window.matchMedia("(min-width: 768px)").matches;
  }

  function getStoredMode() {
    const mode = localStorage.getItem(MODE_KEY) || DEFAULT_MODE;
    return MODES.some((item) => item.id === mode) ? mode : DEFAULT_MODE;
  }

  function applyMode() {
    const mode = isTabletOrPc() ? getStoredMode() : DEFAULT_MODE;
    document.documentElement.dataset.songViewMode = mode;

    ["songList", "favoriteList", "playList"].forEach((id) => {
      const list = document.getElementById(id);
      if (!list) return;
      list.classList.remove("mdl-mode-list", "mdl-mode-compact", "mdl-mode-large");
      list.classList.add(`mdl-mode-${mode}`);
    });

    document.querySelectorAll(".mdl-view-mode-button").forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function setMode(mode) {
    if (!MODES.some((item) => item.id === mode)) return;
    localStorage.setItem(MODE_KEY, mode);
    applyMode();
  }

  function makeToolbar() {
    if (document.getElementById("mdlViewModeToolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.className = "mdl-view-mode-toolbar";
    toolbar.id = "mdlViewModeToolbar";
    toolbar.setAttribute("aria-label", "Modo de visualização das músicas");

    const label = document.createElement("span");
    label.className = "mdl-view-mode-label";
    label.textContent = "Visualização";
    toolbar.appendChild(label);

    MODES.forEach((mode) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mdl-view-mode-button";
      button.dataset.mode = mode.id;
      button.textContent = mode.label;
      button.addEventListener("click", () => setMode(mode.id));
      toolbar.appendChild(button);
    });

    const libraryToolbar = document.querySelector(".library-toolbar");
    const libraryHead = document.querySelector(".library-head") || document.querySelector("#view-acervo .section-head");

    if (libraryToolbar) {
      libraryToolbar.insertAdjacentElement("afterbegin", toolbar);
    } else if (libraryHead) {
      libraryHead.insertAdjacentElement("afterend", toolbar);
    }
  }

  function boot() {
    makeToolbar();
    applyMode();

    const observer = new MutationObserver(() => applyMode());
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("resize", applyMode);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
