(() => {
  if (typeof state !== "object" || typeof dom !== "object" || typeof LOGIN_USERS !== "object") return;

  LOGIN_USERS.desenvolvedor = { label: "Desenvolvedor", role: "developer", initial: "D" };

  Object.assign(state, {
    chordOverrides: state.chordOverrides instanceof Map ? state.chordOverrides : new Map(),
    loginDeveloperVisible: Boolean(state.auth?.user?.id === "desenvolvedor"),
    developerTapCount: 0,
    developerTapAt: 0,
    developerLoaded: Boolean(state.developerLoaded),
    developerPanel: state.developerPanel || "songs",
    developerSongDraft: state.developerSongDraft || null,
    developerSongOriginal: state.developerSongOriginal || null,
    developerChordName: state.developerChordName || "",
    developerChordDraft: state.developerChordDraft || null
  });

  Object.assign(dom, {
    developerRevealHint: document.getElementById("developerRevealHint"),
    developerCard: document.querySelector(".developer-card"),
    developerWorkspace: document.getElementById("developerWorkspace"),
    developerSongPanel: document.getElementById("developerSongPanel"),
    developerChordPanel: document.getElementById("developerChordPanel"),
    developerSongSearch: document.getElementById("developerSongSearch"),
    developerSongList: document.getElementById("developerSongList"),
    developerSongForm: document.getElementById("developerSongForm"),
    developerSongTitle: document.getElementById("developerSongTitle"),
    developerSongArtist: document.getElementById("developerSongArtist"),
    developerSongKey: document.getElementById("developerSongKey"),
    developerSongCollection: document.getElementById("developerSongCollection"),
    developerSongHtml: document.getElementById("developerSongHtml"),
    developerSongStatus: document.getElementById("developerSongStatus"),
    developerSongPreview: document.getElementById("developerSongPreview"),
    developerChordSearch: document.getElementById("developerChordSearch"),
    developerChordList: document.getElementById("developerChordList"),
    developerChordForm: document.getElementById("developerChordForm"),
    developerChordNameInput: document.getElementById("developerChordNameInput"),
    developerChordLabel: document.getElementById("developerChordLabel"),
    developerChordBaseFret: document.getElementById("developerChordBaseFret"),
    developerChordBarreFret: document.getElementById("developerChordBarreFret"),
    developerChordBarreStart: document.getElementById("developerChordBarreStart"),
    developerChordBarreEnd: document.getElementById("developerChordBarreEnd"),
    developerChordApproximate: document.getElementById("developerChordApproximate"),
    developerChordHandlesBass: document.getElementById("developerChordHandlesBass"),
    developerChordStatus: document.getElementById("developerChordStatus"),
    developerChordPreview: document.getElementById("developerChordPreview")
  });

  const adminViewRoot = document.getElementById("view-admin");
  if (dom.developerWorkspace && adminViewRoot && !adminViewRoot.contains(dom.developerWorkspace)) {
    adminViewRoot.appendChild(dom.developerWorkspace);
  }
  const developerSongSearchLabel = document.querySelector('label[for="developerSongSearch"] span');
  const currentSongButton = document.querySelector('[data-action="load-current-song-to-editor"]');
  if (developerSongSearchLabel) developerSongSearchLabel.textContent = "Buscar musica";
  if (currentSongButton) currentSongButton.textContent = "Musica atual";

  const devChordInputs = Array.from(document.querySelectorAll("[data-chord-string]"));
  const originalSyncLoginSelection = syncLoginSelection;
  const originalSyncAuthUi = syncAuthUi;
  const originalRenderAll = renderAll;
  const originalShowView = showView;
  const originalLogout = logout;
  const originalResolveChordShape = resolveChordShape;

  syncLoginSelection = function syncLoginSelectionWithDeveloper() {
    if (!canShowDeveloperLogin() && state.selectedLoginUser === "desenvolvedor") {
      state.selectedLoginUser = "lider";
      localStorage.setItem("mdl.lastLoginUser", "lider");
    }
    originalSyncLoginSelection();
    updateDeveloperLoginVisibility();
  };

  syncAuthUi = function syncAuthUiWithDeveloper() {
    originalSyncAuthUi();
    document.body.classList.toggle("role-developer", isDeveloper());
    if (dom.developerCard) dom.developerCard.hidden = !isDeveloper();
    if (dom.developerWorkspace) dom.developerWorkspace.hidden = !isDeveloper();
    if (dom.accountName && isDeveloper()) {
      dom.accountName.textContent = "Pode editar cifras, acordes e diagramas neste aparelho";
    }
    if (isDeveloper()) {
      state.loginDeveloperVisible = true;
      void ensureDeveloperLoaded();
    } else if (state.currentView === "admin") {
      originalShowView("acervo");
    }
    updateDeveloperLoginVisibility();
  };

  renderAll = function renderAllWithDeveloper() {
    originalRenderAll();
    renderDeveloperWorkspace();
  };

  showView = function showViewWithDeveloper(viewName) {
    if (viewName === "admin" && !isDeveloper()) {
      toast("Area restrita ao desenvolvedor");
      const result = originalShowView("acervo");
      renderDeveloperWorkspace();
      return result;
    }
    const result = originalShowView(viewName);
    renderDeveloperWorkspace();
    return result;
  };

  logout = function logoutWithDeveloper() {
    clearDeveloperStatus();
    state.developerLoaded = false;
    state.developerSongDraft = null;
    state.developerSongOriginal = null;
    state.developerChordName = "";
    state.developerChordDraft = null;
    state.chordOverrides = new Map();
    return originalLogout();
  };

  adminRefresh = async function adminRefreshWithDeveloper() {
    if (!isDeveloper()) {
      toast("Apenas o desenvolvedor pode atualizar o acervo");
      return;
    }
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: authHeaders()
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "import-failed");
      toast("Atualizando acervo");
      setTimeout(refreshLibrary, 1600);
    } catch {
      toast("Nao foi possivel atualizar");
    }
  };

  resolveChordShape = function resolveChordShapeWithOverrides(parsed) {
    const exactKey = `${parsed.root}${parsed.familyMeta.lookup}${parsed.bass ? `/${parsed.bass}` : ""}`;
    const exactOverride = getOverrideShape(exactKey);
    if (exactOverride) return exactOverride;

    const baseKey = `${parsed.root}${parsed.familyMeta.lookup}`;
    const baseOverride = getOverrideShape(baseKey, {
      approximate: Boolean(parsed.bass) || Boolean(parsed.familyMeta.approximate),
      handlesBass: !parsed.bass
    });
    if (baseOverride) return baseOverride;

    return originalResolveChordShape(parsed);
  };

  document.addEventListener("click", handleDeveloperClick, true);
  dom.developerSongForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveDeveloperSong();
  });
  dom.developerChordForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveDeveloperChord();
  });
  dom.developerSongSearch?.addEventListener("input", renderDeveloperSongList);
  dom.developerChordSearch?.addEventListener("input", renderDeveloperChordList);
  [
    dom.developerSongTitle,
    dom.developerSongArtist,
    dom.developerSongKey,
    dom.developerSongCollection,
    dom.developerSongHtml
  ].forEach((input) => input?.addEventListener("input", renderDeveloperSongPreview));
  [
    dom.developerChordNameInput,
    dom.developerChordLabel,
    dom.developerChordBaseFret,
    dom.developerChordBarreFret,
    dom.developerChordBarreStart,
    dom.developerChordBarreEnd,
    dom.developerChordApproximate,
    dom.developerChordHandlesBass,
    ...devChordInputs
  ].forEach((input) => input?.addEventListener("input", renderDeveloperChordPreview));

  syncLoginSelection();
  syncAuthUi();
  renderDeveloperWorkspace();

  function isDeveloper() {
    return state.auth?.user?.role === "developer";
  }

  function canShowDeveloperLogin() {
    return Boolean(state.loginDeveloperVisible || isDeveloper());
  }

  function updateDeveloperLoginVisibility() {
    const button = document.querySelector('[data-user-id="desenvolvedor"]');
    if (!button) return;
    button.hidden = !canShowDeveloperLogin();
    if (dom.developerRevealHint) {
      dom.developerRevealHint.textContent = canShowDeveloperLogin()
        ? "Perfil desenvolvedor liberado neste aparelho."
        : "";
    }
  }

  function handleDeveloperClick(event) {
    const trigger = event.target.closest('[data-action="reveal-developer"]');
    if (trigger) {
      event.preventDefault();
      event.stopPropagation();
      registerDeveloperTap();
      return;
    }

    const button = event.target.closest("button");
    if (!button) return;

    const action = button.dataset.action;
    if (action === "select-dev-panel") {
      event.preventDefault();
      event.stopPropagation();
      selectDeveloperPanel(button.dataset.panel || "songs");
      return;
    }
    if (action === "load-current-song-to-editor") {
      event.preventDefault();
      event.stopPropagation();
      void loadCurrentSongIntoEditor();
      return;
    }
    if (action === "dev-wrap-selection") {
      event.preventDefault();
      event.stopPropagation();
      wrapSongSelection(button.dataset.tag || "i");
      return;
    }
    if (action === "select-dev-song") {
      event.preventDefault();
      event.stopPropagation();
      void loadSongIntoEditor(button.dataset.id);
      return;
    }
    if (action === "select-dev-chord") {
      event.preventDefault();
      event.stopPropagation();
      selectDeveloperChord(button.dataset.chord || "");
      return;
    }
    if (action === "remove-dev-chord") {
      event.preventDefault();
      event.stopPropagation();
      void removeDeveloperChord();
    }
  }

  function registerDeveloperTap() {
    const now = Date.now();
    state.developerTapCount = now - state.developerTapAt > 1800 ? 1 : state.developerTapCount + 1;
    state.developerTapAt = now;
    if (state.developerTapCount < 5) return;
    state.developerTapCount = 0;

    if (!state.auth?.user) {
      state.loginDeveloperVisible = !state.loginDeveloperVisible;
      syncLoginSelection();
      if (state.loginDeveloperVisible) {
        selectLoginUser("desenvolvedor");
        toast("Perfil desenvolvedor liberado");
      } else {
        toast("Perfil desenvolvedor ocultado");
      }
      return;
    }

    if (isDeveloper()) {
      showView("admin");
      toast("Modo desenvolvedor aberto");
    } else {
      toast("Perfil restrito ao desenvolvedor");
    }
  }

  async function ensureDeveloperLoaded(force = false) {
    if (!isDeveloper()) return;
    if (state.developerLoaded && !force) {
      renderDeveloperWorkspace();
      return;
    }
    try {
      const response = await fetch("/api/dev/chords", {
        headers: authHeaders()
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "dev-load-failed");
      state.chordOverrides = new Map(Object.entries(data.chords || {}));
      state.developerLoaded = true;
      if (!state.developerSongDraft) {
        const initialSongId = state.currentSongId || state.songs[0]?.id || "";
        if (initialSongId) await loadSongIntoEditor(initialSongId, { silent: true });
      }
      if (!state.developerChordName) {
        const firstChord = getDeveloperChordNames()[0] || "C";
        selectDeveloperChord(firstChord);
      }
      renderDeveloperWorkspace();
    } catch {
      setDeveloperSongStatus("Nao foi possivel carregar as ferramentas de edicao.");
    }
  }

  function renderDeveloperWorkspace() {
    if (!dom.developerWorkspace) return;
    dom.developerWorkspace.hidden = !isDeveloper() || state.currentView !== "admin";
    if (!isDeveloper()) return;

    dom.developerSongPanel?.classList.toggle("active", state.developerPanel === "songs");
    dom.developerChordPanel?.classList.toggle("active", state.developerPanel === "chords");
    document.querySelectorAll('[data-action="select-dev-panel"]').forEach((button) => {
      const active = button.dataset.panel === state.developerPanel;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    renderDeveloperSongList();
    renderDeveloperChordList();
    renderDeveloperSongPreview();
    renderDeveloperChordPreview();
  }

  function selectDeveloperPanel(panel) {
    state.developerPanel = panel === "chords" ? "chords" : "songs";
    renderDeveloperWorkspace();
  }

  function getDeveloperSongMatches() {
    const query = normalize(dom.developerSongSearch?.value || "");
    const songs = query
      ? state.songs.filter((song) => normalize(`${song.title} ${song.artist} ${song.collection || ""}`).includes(query))
      : state.songs.slice(0, 40);
    return songs.slice(0, 60);
  }

  function renderDeveloperSongList() {
    if (!isDeveloper() || !dom.developerSongList) return;
    const songs = getDeveloperSongMatches();
    dom.developerSongList.innerHTML = songs.length
      ? songs.map((song) => {
          const active = state.developerSongOriginal?.id === song.id;
          return `
            <button class="developer-song-item${active ? " active" : ""}" type="button" data-action="select-dev-song" data-id="${escapeAttr(song.id)}">
              <strong>${escapeHtml(song.title)}</strong>
              <span>${escapeHtml(getSongMetaLabel(song) || song.artist)}</span>
            </button>
          `;
        }).join("")
      : emptyState("Nenhuma musica encontrada para editar.");
  }

  async function loadCurrentSongIntoEditor() {
    if (!state.currentSongId) {
      toast("Abra uma musica antes");
      return;
    }
    state.developerPanel = "songs";
    renderDeveloperWorkspace();
    showView("admin");
    await loadSongIntoEditor(state.currentSongId);
  }

  async function loadSongIntoEditor(id, options = {}) {
    if (!isDeveloper() || !id) return;
    const song = findSong(id);
    if (!song) return;
    if (!options.silent) setDeveloperSongStatus("Carregando cifra...");

    try {
      const response = await fetch(`/api/songs/${encodeURIComponent(id)}?v=${Date.now()}`);
      if (!response.ok) throw new Error("song-not-found");
      const data = await response.json();
      state.developerSongOriginal = data;
      state.developerSongDraft = buildDeveloperSongDraft(data);
      syncDeveloperSongForm();
      renderDeveloperSongList();
      renderDeveloperSongPreview();
      if (!options.silent) setDeveloperSongStatus(`Editando ${data.title}`);
    } catch {
      setDeveloperSongStatus("Nao foi possivel carregar a cifra.");
    }
  }

  function buildDeveloperSongDraft(song) {
    return {
      id: song.id,
      title: song.title || "",
      artist: song.artist || "",
      collection: song.collection || "",
      key: song.key || "",
      html: normalizeSheetContent(song.html || "")
    };
  }

  function syncDeveloperSongForm() {
    const draft = state.developerSongDraft;
    if (!draft) return;
    if (dom.developerSongTitle) dom.developerSongTitle.value = draft.title || "";
    if (dom.developerSongArtist) dom.developerSongArtist.value = draft.artist || "";
    if (dom.developerSongCollection) dom.developerSongCollection.value = draft.collection || "";
    if (dom.developerSongKey) dom.developerSongKey.value = draft.key || "";
    if (dom.developerSongHtml) dom.developerSongHtml.value = draft.html || "";
  }

  function readDeveloperSongDraft() {
    if (!state.developerSongOriginal?.id) return null;
    return {
      id: state.developerSongOriginal.id,
      title: String(dom.developerSongTitle?.value || "").trim(),
      artist: String(dom.developerSongArtist?.value || "").trim(),
      collection: String(dom.developerSongCollection?.value || "").trim(),
      key: String(dom.developerSongKey?.value || "").trim(),
      html: String(dom.developerSongHtml?.value || "").trim()
    };
  }

  function renderDeveloperSongPreview() {
    if (!isDeveloper() || !dom.developerSongPreview) return;
    const draft = readDeveloperSongDraft() || state.developerSongDraft;
    if (!draft?.html) {
      dom.developerSongPreview.innerHTML = emptyState("Selecione uma musica para editar.");
      return;
    }
    dom.developerSongPreview.innerHTML = `<pre>${decorateChordHtml(normalizeSheetContent(draft.html))}</pre>`;
  }

  async function saveDeveloperSong() {
    if (!isDeveloper()) return;
    const draft = readDeveloperSongDraft();
    if (!draft) {
      setDeveloperSongStatus("Selecione uma musica para editar.");
      return;
    }

    setDeveloperSongStatus("Salvando cifra...");
    try {
      const response = await fetch(`/api/dev/songs/${encodeURIComponent(draft.id)}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(draft)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "save-song-failed");

      state.developerSongOriginal = data.song;
      state.developerSongDraft = buildDeveloperSongDraft(data.song);
      syncDeveloperSongForm();
      upsertSongSummary(data.summary || data.song);
      filterSongs();
      renderAll();

      if (state.currentSongId === data.song.id) {
        const current = findSong(data.song.id);
        if (dom.readerTitle) dom.readerTitle.textContent = data.song.title;
        if (dom.readerArtist) dom.readerArtist.textContent = data.song.artist;
        state.currentSheetHtml = normalizeSheetContent(data.song.html || "");
        state.baseKey = current?.key || inferKeyFromHtml(state.currentSheetHtml);
        renderCurrentSheet();
      }

      await idbSaveSong(data.song).catch(() => {});
      setDeveloperSongStatus("Cifra salva neste servidor.");
      toast("Cifra atualizada");
    } catch (error) {
      setDeveloperSongStatus(describeDeveloperSongError(error));
    }
  }

  function describeDeveloperSongError(error) {
    const code = error?.message || "";
    if (code === "invalid-title") return "Informe o titulo da musica.";
    if (code === "invalid-artist") return "Informe o artista.";
    if (code === "invalid-html") return "A cifra nao pode ficar vazia.";
    if (code === "developer-only") return "Perfil sem permissao para editar.";
    return "Nao foi possivel salvar a cifra agora.";
  }

  function setDeveloperSongStatus(text) {
    if (dom.developerSongStatus) dom.developerSongStatus.textContent = text || "";
  }

  function wrapSongSelection(tag) {
    if (!dom.developerSongHtml) return;
    const openTag = `<${tag}>`;
    const closeTag = `</${tag}>`;
    const start = dom.developerSongHtml.selectionStart || 0;
    const end = dom.developerSongHtml.selectionEnd || 0;
    const current = dom.developerSongHtml.value || "";
    const selected = current.slice(start, end) || (tag === "i" ? "C" : "Parte");
    dom.developerSongHtml.value = `${current.slice(0, start)}${openTag}${selected}${closeTag}${current.slice(end)}`;
    dom.developerSongHtml.focus();
    dom.developerSongHtml.selectionStart = start + openTag.length;
    dom.developerSongHtml.selectionEnd = start + openTag.length + selected.length;
    renderDeveloperSongPreview();
  }

  function getDeveloperChordNames() {
    return Array.from(new Set([
      ...Object.keys(CHORD_SHAPE_LIBRARY),
      ...state.chordOverrides.keys()
    ])).sort((left, right) => left.localeCompare(right, "pt-BR"));
  }

  function renderDeveloperChordList() {
    if (!isDeveloper() || !dom.developerChordList) return;
    const query = normalize(dom.developerChordSearch?.value || "");
    const names = getDeveloperChordNames()
      .filter((name) => !query || normalize(name).includes(query))
      .slice(0, 60);
    dom.developerChordList.innerHTML = names.length
      ? names.map((name) => `
          <button class="developer-chord-item${state.developerChordName === name ? " active" : ""}" type="button" data-action="select-dev-chord" data-chord="${escapeAttr(name)}">
            <strong>${escapeHtml(name)}</strong>
            <span>${state.chordOverrides.has(name) ? "Personalizado" : "Biblioteca base"}</span>
          </button>
        `).join("")
      : emptyState("Nenhum acorde encontrado.");
  }

  function normalizeDeveloperChordName(value) {
    const parsed = parseChordName(String(value || "").trim());
    return parsed ? parsed.name : "";
  }

  function selectDeveloperChord(name) {
    if (!isDeveloper()) return;
    const chordName = normalizeDeveloperChordName(name);
    if (!chordName) {
      setDeveloperChordStatus("Digite um acorde valido.");
      return;
    }
    const sourceShape = cloneShape(state.chordOverrides.get(chordName) || CHORD_SHAPE_LIBRARY[chordName] || null);
    state.developerChordName = chordName;
    state.developerChordDraft = {
      name: chordName,
      label: sourceShape?.label || "",
      baseFret: sourceShape?.baseFret || 1,
      frets: normalizeFrets(sourceShape?.frets),
      barres: cloneBarres(sourceShape?.barres),
      approximate: Boolean(sourceShape?.approximate),
      handlesBass: sourceShape?.handlesBass !== false
    };
    syncDeveloperChordForm();
    renderDeveloperChordList();
    renderDeveloperChordPreview();
    setDeveloperChordStatus(state.chordOverrides.has(chordName) ? "Acorde personalizado carregado." : "Acorde base carregado.");
  }

  function normalizeFrets(frets) {
    const values = Array.isArray(frets) ? frets.slice(0, 6) : [];
    while (values.length < 6) values.push("x");
    return values.map((value) => value === "x" || value === "X" ? "x" : Number.isInteger(value) ? value : Number(value) >= 0 ? Number(value) : "x");
  }

  function cloneShape(shape) {
    return shape ? JSON.parse(JSON.stringify(shape)) : null;
  }

  function cloneBarres(barres) {
    return Array.isArray(barres) ? barres.map((barre) => ({ ...barre })) : [];
  }

  function syncDeveloperChordForm() {
    const draft = state.developerChordDraft;
    if (!draft) return;
    if (dom.developerChordNameInput) dom.developerChordNameInput.value = draft.name;
    if (dom.developerChordLabel) dom.developerChordLabel.value = draft.label || "";
    if (dom.developerChordBaseFret) dom.developerChordBaseFret.value = String(draft.baseFret || 1);
    devChordInputs.forEach((input) => {
      const index = Number(input.dataset.chordString);
      input.value = String(draft.frets[index] ?? "x");
    });
    const firstBarre = draft.barres[0] || null;
    if (dom.developerChordBarreFret) dom.developerChordBarreFret.value = firstBarre?.fret ? String(firstBarre.fret) : "";
    if (dom.developerChordBarreStart) dom.developerChordBarreStart.value = Number.isInteger(firstBarre?.fromString) ? String(firstBarre.fromString) : "";
    if (dom.developerChordBarreEnd) dom.developerChordBarreEnd.value = Number.isInteger(firstBarre?.toString) ? String(firstBarre.toString) : "";
    if (dom.developerChordApproximate) dom.developerChordApproximate.checked = Boolean(draft.approximate);
    if (dom.developerChordHandlesBass) dom.developerChordHandlesBass.checked = draft.handlesBass !== false;
  }

  function readDeveloperChordDraft() {
    const chordName = normalizeDeveloperChordName(dom.developerChordNameInput?.value || "");
    if (!chordName) throw new Error("invalid-chord-name");

    const frets = devChordInputs.map((input) => {
      const value = String(input.value || "").trim();
      if (!value || /^x$/i.test(value)) return "x";
      const fret = Number(value);
      if (!Number.isInteger(fret) || fret < 0 || fret > 24) throw new Error("invalid-fret");
      return fret;
    });

    const barreFret = String(dom.developerChordBarreFret?.value || "").trim();
    const barreStart = String(dom.developerChordBarreStart?.value || "").trim();
    const barreEnd = String(dom.developerChordBarreEnd?.value || "").trim();
    const barres = [];
    if (barreFret || barreStart || barreEnd) {
      const fret = Number(barreFret);
      const fromString = Number(barreStart);
      const toString = Number(barreEnd);
      if (!Number.isInteger(fret) || fret < 1 || fret > 24) throw new Error("invalid-barre");
      if (!Number.isInteger(fromString) || fromString < 0 || fromString > 5) throw new Error("invalid-barre");
      if (!Number.isInteger(toString) || toString < 0 || toString > 5) throw new Error("invalid-barre");
      barres.push({ fret, fromString, toString });
    }

    return {
      name: chordName,
      label: String(dom.developerChordLabel?.value || "").trim(),
      baseFret: Math.max(1, Math.min(24, Number(dom.developerChordBaseFret?.value || 1) || 1)),
      frets,
      barres,
      approximate: Boolean(dom.developerChordApproximate?.checked),
      handlesBass: dom.developerChordHandlesBass?.checked !== false
    };
  }

  function renderDeveloperChordPreview() {
    if (!isDeveloper() || !dom.developerChordPreview) return;
    try {
      const draft = readDeveloperChordDraft();
      state.developerChordDraft = draft;
      state.developerChordName = draft.name;
      const parsed = parseChordName(draft.name);
      const normalizedShape = normalizeChordShape({
        frets: draft.frets,
        label: draft.label,
        baseFret: draft.baseFret,
        barres: draft.barres
      }, {
        approximate: draft.approximate,
        handlesBass: draft.handlesBass
      });
      const guide = {
        name: draft.name,
        meta: [parsed?.familyMeta?.label || "Personalizado", draft.label].filter(Boolean).join(" - "),
        notes: parsed ? buildChordNotes(parsed) : [],
        shape: normalizedShape,
        hint: state.chordOverrides.has(draft.name) ? "Forma personalizada ativa neste servidor." : "Preview do diagrama antes de salvar."
      };
      dom.developerChordPreview.innerHTML = `
        ${renderChordGuideDiagram(guide)}
        <p class="chord-guide-hint">${escapeHtml(guide.hint)}</p>
      `;
    } catch {
      dom.developerChordPreview.innerHTML = emptyState("Preencha um acorde valido para ver o diagrama.");
    }
  }

  async function saveDeveloperChord() {
    if (!isDeveloper()) return;
    setDeveloperChordStatus("Salvando acorde...");
    try {
      const draft = readDeveloperChordDraft();
      const response = await fetch(`/api/dev/chords/${encodeURIComponent(draft.name)}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          frets: draft.frets,
          label: draft.label,
          baseFret: draft.baseFret,
          barres: draft.barres,
          approximate: draft.approximate,
          handlesBass: draft.handlesBass
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "save-chord-failed");

      state.chordOverrides = new Map(Object.entries(data.chords || {}));
      state.developerChordName = draft.name;
      state.developerChordDraft = draft;
      renderDeveloperWorkspace();
      if (state.chordGuideOpen) refreshChordGuide();
      setDeveloperChordStatus("Acorde salvo neste servidor.");
      toast(`Acorde ${draft.name} atualizado`);
    } catch (error) {
      setDeveloperChordStatus(describeDeveloperChordError(error));
    }
  }

  async function removeDeveloperChord() {
    if (!isDeveloper()) return;
    const chordName = normalizeDeveloperChordName(dom.developerChordNameInput?.value || state.developerChordName || "");
    if (!chordName) {
      setDeveloperChordStatus("Selecione um acorde antes.");
      return;
    }
    setDeveloperChordStatus("Removendo personalizacao...");
    try {
      const response = await fetch(`/api/dev/chords/${encodeURIComponent(chordName)}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "delete-chord-failed");

      state.chordOverrides = new Map(Object.entries(data.chords || {}));
      selectDeveloperChord(chordName);
      if (state.chordGuideOpen) refreshChordGuide();
      setDeveloperChordStatus("Personalizacao removida.");
      toast(`Acorde ${chordName} voltou para a biblioteca base`);
    } catch {
      setDeveloperChordStatus("Nao foi possivel remover a personalizacao.");
    }
  }

  function describeDeveloperChordError(error) {
    const code = error?.message || "";
    if (code === "invalid-chord-name") return "Digite um nome de acorde valido.";
    if (code === "invalid-fret") return "Use apenas X ou casas entre 0 e 24.";
    if (code === "invalid-barre") return "Confira os dados da pestana.";
    return "Nao foi possivel salvar o acorde agora.";
  }

  function setDeveloperChordStatus(text) {
    if (dom.developerChordStatus) dom.developerChordStatus.textContent = text || "";
  }

  function clearDeveloperStatus() {
    setDeveloperSongStatus("");
    setDeveloperChordStatus("");
  }

  function upsertSongSummary(song) {
    const nextSong = {
      ...(findSong(song.id) || {}),
      ...song
    };
    const nextSongs = state.songs.filter((entry) => entry.id !== nextSong.id);
    nextSongs.push(nextSong);
    nextSongs.sort((left, right) => {
      const artistCompare = String(left.artist || "").localeCompare(String(right.artist || ""), "pt-BR");
      if (artistCompare) return artistCompare;
      return String(left.title || "").localeCompare(String(right.title || ""), "pt-BR");
    });
    state.songs = nextSongs;
  }

  function getOverrideShape(name, options = {}) {
    const stored = state.chordOverrides.get(name);
    if (!stored) return null;
    return normalizeChordShape(stored, {
      approximate: Boolean(stored.approximate) || Boolean(options.approximate),
      handlesBass: options.handlesBass ?? (stored.handlesBass !== false)
    });
  }
})();
