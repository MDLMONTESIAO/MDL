(() => {
  const MODES = [
    {
      id: "list",
      label: "Lista",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path></svg>'
    },
    {
      id: "small",
      label: "Icones pequenos",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>'
    },
    {
      id: "large",
      label: "Icones grandes",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M8 9h8"></path><path d="M8 13h5"></path></svg>'
    }
  ];

  const STORAGE_KEY = "mdl.songViewMode";
  const DEFAULT_MODE = "large";
  let songListObserver = null;
  let artistListObserver = null;
  let appShellObserver = null;
  let syncTimer = null;

  function isDesktopLike() {
    return window.matchMedia("(min-width: 700px)").matches;
  }

  function appIsAuthenticated() {
    const appShell = document.getElementById("appShell");
    return Boolean(appShell && !appShell.hidden);
  }

  function getMode() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return MODES.some((mode) => mode.id === saved) ? saved : DEFAULT_MODE;
  }

  function setMode(modeId) {
    const next = MODES.some((mode) => mode.id === modeId) ? modeId : DEFAULT_MODE;
    localStorage.setItem(STORAGE_KEY, next);

    if (isDesktopLike() && appIsAuthenticated()) {
      document.body.classList.add("mdl-authenticated");
      document.body.dataset.mdlSongViewMode = next;
    } else {
      document.body.classList.remove("mdl-authenticated");
      delete document.body.dataset.mdlSongViewMode;
    }

    updateButtons(next);
    applyCoverBackgrounds();
  }

  function updateButtons(activeMode) {
    document.querySelectorAll(".mdl-view-mode-button").forEach((button) => {
      const active = button.dataset.mode === activeMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function removeOldToolbars() {
    document.querySelectorAll(
      "#artistViewModeToolbar, #viewModeToolbar, .artist-view-mode-toolbar, .artist-view-modes, .view-mode-toolbar, .view-modes-toolbar, .library-view-mode-toolbar"
    ).forEach((el) => {
      if (el.id !== "mdlSongViewModeBar") el.remove();
    });
  }

  function createToolbar() {
    const bar = document.createElement("div");
    bar.id = "mdlSongViewModeBar";
    bar.setAttribute("aria-label", "Modo de visualizacao");

    MODES.forEach((mode) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mdl-view-mode-button";
      button.dataset.mode = mode.id;
      button.innerHTML = mode.icon + "<span>" + mode.label + "</span>";
      button.addEventListener("click", () => setMode(mode.id));
      bar.appendChild(button);
    });

    return bar;
  }

  function placeToolbar(bar) {
    const activeView = document.querySelector(".view.active");
    const acervoView = document.getElementById("view-acervo");
    const songList = document.getElementById("songList");
    const artistView = document.getElementById("view-artistas");
    const artistList = document.getElementById("artistList");
    if (!acervoView || !songList || !artistView || !artistList) return;

    if (activeView?.id === "view-artistas") {
      const artistHead = artistView.querySelector(".section-head");
      if (artistHead) {
        if (bar.previousElementSibling !== artistHead || bar.parentElement !== artistHead.parentElement) {
          artistHead.insertAdjacentElement("afterend", bar);
        }
      } else if (artistList.previousElementSibling !== bar) {
        artistList.insertAdjacentElement("beforebegin", bar);
      }
      return;
    }

    const libraryToolbar = acervoView.querySelector(".library-toolbar");
    if (libraryToolbar) {
      if (bar.previousElementSibling !== libraryToolbar || bar.parentElement !== libraryToolbar.parentElement) {
        libraryToolbar.insertAdjacentElement("afterend", bar);
      }
    } else if (songList.previousElementSibling !== bar) {
      songList.insertAdjacentElement("beforebegin", bar);
    }
  }

  function ensureToolbar() {
    if (!appIsAuthenticated() || !isDesktopLike()) {
      const bar = document.getElementById("mdlSongViewModeBar");
      if (bar) bar.remove();
      document.body.classList.remove("mdl-authenticated");
      delete document.body.dataset.mdlSongViewMode;
      return;
    }

    removeOldToolbars();

    let bar = document.getElementById("mdlSongViewModeBar");
    if (!bar) bar = createToolbar();

    placeToolbar(bar);
    setMode(getMode());
    attachSongListObserver();
    attachArtistListObserver();
  }

  function extractImageUrl(value) {
    const text = String(value || "");
    const match = text.match(/url\(["']?([^"')]+)["']?\)/i);
    return match ? match[1] : "";
  }

  function syncCardBackgrounds(listId, cardSelector, imageSelector) {
    const list = document.getElementById(listId);
    if (!list) return;

    const mode = document.body.dataset.mdlSongViewMode;
    const useBackground = mode === "small" || mode === "large";

    list.querySelectorAll(cardSelector).forEach((card) => {
      const img = card.querySelector(imageSelector);
      const imgUrl = img?.getAttribute("src") || img?.src || "";
      const inlineBg = extractImageUrl(card.style.backgroundImage);
      const existing = imgUrl || card.dataset.mdlCover || inlineBg || "";

      if (existing) card.dataset.mdlCover = existing;

      if (useBackground && existing) {
        card.style.backgroundImage = `url("${existing}")`;
      } else if (card.dataset.mdlCover) {
        card.style.backgroundImage = "";
      }
    });
  }

  function applyCoverBackgrounds() {
    if (!appIsAuthenticated()) return;
    syncCardBackgrounds("songList", ".song-card", "img");
    syncCardBackgrounds("artistList", ".artist-card", ".artist-thumb img");
  }

  function attachSongListObserver() {
    if (songListObserver) return;

    const songList = document.getElementById("songList");
    if (!songList) return;

    songListObserver = new MutationObserver(() => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        updateButtons(getMode());
        applyCoverBackgrounds();
      }, 80);
    });

    songListObserver.observe(songList, {
      childList: true,
      subtree: true
    });
  }

  function attachArtistListObserver() {
    if (artistListObserver) return;

    const artistList = document.getElementById("artistList");
    if (!artistList) return;

    artistListObserver = new MutationObserver(() => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        updateButtons(getMode());
        applyCoverBackgrounds();
      }, 80);
    });

    artistListObserver.observe(artistList, {
      childList: true,
      subtree: true
    });
  }

  function sync() {
    ensureToolbar();
    setMode(getMode());
  }

  function boot() {
    const appShell = document.getElementById("appShell");

    if (appShell) {
      appShellObserver = new MutationObserver(() => {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(sync, 100);
      });

      appShellObserver.observe(appShell, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["hidden", "class"]
      });
    }

    sync();

    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      sync();
      if (attempts > 20 || appIsAuthenticated()) clearInterval(interval);
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
