const el = (id) => document.getElementById(id);

const state = {
  page: 0,
  limit: 12,
  loading: false,
  usOnly: true,
  stations: [],
  lastQueryKey: "",
  autoLoadArmed: true,
  playingUuid: "",
  selectedUuid: "",
  favorites: [],
  recent: []
};

const LS_THEME = "spillnote_theme_v1";
const LS_FAVS = "sn_radio_favorites_v2";
const LS_RECENT = "sn_radio_recent_v2";

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function iconFallback(){
  return `
    <svg class="fallbackIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M10 16V8l7 4-7 4Z" fill="currentColor"/>
    </svg>
  `;
}

function firstTags(tags){
  if (!tags) return [];
  return String(tags).split(",").map(t => t.trim()).filter(Boolean).slice(0, 2);
}

function formatMeta(s){
  const parts = [];
  if (s.countrycode) parts.push(s.countrycode);
  if (s.state) parts.push(s.state);
  if (s.codec) parts.push(String(s.codec).toUpperCase());
  if (s.bitrate) parts.push(`${s.bitrate}kbps`);
  return parts.filter(Boolean).join(" · ");
}

function setStatus(text){
  el("status").textContent = text;
}

function showMessage(html){
  el("msg").innerHTML = html;
}

function queryKey(){
  return [
    el("q").value.trim(),
    el("tag").value.trim(),
    el("sort").value,
    state.usOnly ? "1" : "0"
  ].join("|");
}

function stationMinimal(s){
  return {
    uuid: s.uuid || "",
    name: s.name || "Unknown Station",
    favicon: s.favicon || "",
    tags: s.tags || "",
    countrycode: s.countrycode || "",
    state: s.state || "",
    codec: s.codec || "",
    bitrate: Number(s.bitrate || 0),
    lastcheckok: Number(s.lastcheckok || 0),
    stream: s.stream || ""
  };
}

/* theme */
function applyTheme(theme){
  const value = ["light", "dark", "glass", "night-radio"].includes(theme) ? theme : "light";
  document.documentElement.setAttribute("data-theme", value);
  localStorage.setItem(LS_THEME, value);
  el("themeSelect").value = value;

  const themeColorMap = {
    light: "#f5f7fb",
    dark: "#07111f",
    glass: "#dce8f5",
    "night-radio": "#050816"
  };

  let meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeColorMap[value] || "#f5f7fb");
}

/* local storage helpers */
function localFavsLoad(){
  try{
    const raw = localStorage.getItem(LS_FAVS);
    const data = JSON.parse(raw || "[]");
    return Array.isArray(data) ? data : [];
  }catch{
    return [];
  }
}

function localFavsSave(items){
  try{
    localStorage.setItem(LS_FAVS, JSON.stringify(items));
  }catch{}
}

function recentLoad(){
  try{
    const raw = localStorage.getItem(LS_RECENT);
    const data = JSON.parse(raw || "[]");
    return Array.isArray(data) ? data : [];
  }catch{
    return [];
  }
}

function recentSave(items){
  try{
    localStorage.setItem(LS_RECENT, JSON.stringify(items));
  }catch{}
}

function favHas(uuid){
  return state.favorites.some(f => String(f.uuid) === String(uuid));
}

function toggleFavorite(station){
  const uuid = String(station.uuid || "");
  if (!uuid) return;

  if (favHas(uuid)) {
    state.favorites = state.favorites.filter(f => String(f.uuid) !== uuid);
  } else {
    state.favorites = [stationMinimal(station), ...state.favorites.filter(f => String(f.uuid) !== uuid)];
  }

  if (state.favorites.length > 30) {
    state.favorites = state.favorites.slice(0, 30);
  }

  localFavsSave(state.favorites);
  renderFavorites();
  updateStationButtons();
}

function addRecent(station){
  const s = stationMinimal(station);
  state.recent = [s, ...state.recent.filter(x => String(x.uuid) !== String(s.uuid))];
  if (state.recent.length > 20) {
    state.recent = state.recent.slice(0, 20);
  }
  recentSave(state.recent);
  renderRecent();
}

/* render side lists */
function renderFavorites(){
  const box = el("favList");
  const hint = el("favHint");
  box.innerHTML = "";

  if (!state.favorites.length) {
    hint.style.display = "block";
    return;
  }

  hint.style.display = "none";
  const frag = document.createDocumentFragment();

  state.favorites.slice(0, 10).forEach((s) => {
    const item = document.createElement("div");
    item.className = "miniItem";
    item.tabIndex = 0;

    const art = document.createElement("div");
    art.className = "miniArtSm";

    if (s.favicon) {
      const img = document.createElement("img");
      img.src = s.favicon;
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => { art.innerHTML = iconFallback(); };
      art.appendChild(img);
    } else {
      art.innerHTML = iconFallback();
    }

    const txt = document.createElement("div");
    txt.className = "miniText";
    txt.innerHTML = `
      <div class="miniName">${escapeHtml(s.name || "Unknown Station")}</div>
      <div class="miniMeta">${escapeHtml(formatMeta(s) || "Stream")}</div>
    `;

    item.appendChild(art);
    item.appendChild(txt);

    item.addEventListener("click", () => playStationFromUserGesture(s));
    item.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        playStationFromUserGesture(s);
      }
    });

    frag.appendChild(item);
  });

  box.appendChild(frag);
}

function renderRecent(){
  const box = el("recentList");
  const hint = el("recentHint");
  box.innerHTML = "";

  if (!state.recent.length) {
    hint.style.display = "block";
    return;
  }

  hint.style.display = "none";
  const frag = document.createDocumentFragment();

  state.recent.slice(0, 10).forEach((s) => {
    const item = document.createElement("div");
    item.className = "miniItem";
    item.tabIndex = 0;

    const art = document.createElement("div");
    art.className = "miniArtSm";

    if (s.favicon) {
      const img = document.createElement("img");
      img.src = s.favicon;
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => { art.innerHTML = iconFallback(); };
      art.appendChild(img);
    } else {
      art.innerHTML = iconFallback();
    }

    const txt = document.createElement("div");
    txt.className = "miniText";
    txt.innerHTML = `
      <div class="miniName">${escapeHtml(s.name || "Unknown Station")}</div>
      <div class="miniMeta">${escapeHtml(formatMeta(s) || "Stream")}</div>
    `;

    item.appendChild(art);
    item.appendChild(txt);

    item.addEventListener("click", () => playStationFromUserGesture(s));
    item.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        playStationFromUserGesture(s);
      }
    });

    frag.appendChild(item);
  });

  box.appendChild(frag);
}

/* render station list */
function renderStations(reset = false){
  const list = el("list");
  if (reset) list.innerHTML = "";

  const frag = document.createDocumentFragment();

  state.stations.forEach((s) => {
    const row = document.createElement("div");
    row.className = "station";
    row.dataset.uuid = String(s.uuid || "");

    const left = document.createElement("div");
    left.className = "stationLeft";

    const art = document.createElement("div");
    art.className = "art";

    if (s.favicon) {
      const img = document.createElement("img");
      img.src = s.favicon;
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => { art.innerHTML = iconFallback(); };
      art.appendChild(img);
    } else {
      art.innerHTML = iconFallback();
    }

    const info = document.createElement("div");
    info.className = "info";

    const tags = firstTags(s.tags);
    const isHealthy = Number(s.lastcheckok) === 1;

    info.innerHTML = `
      <div class="name">${escapeHtml(s.name)}</div>
      <div class="chips">
        <span class="chip ${isHealthy ? "green" : ""}">${isHealthy ? "Live" : "Unverified"}</span>
        <span class="chip">${escapeHtml(formatMeta(s) || "Stream")}</span>
        ${tags.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join("")}
      </div>
    `;

    left.appendChild(art);
    left.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "stationActions";

    const isPlaying = String(s.uuid) && String(s.uuid) === String(state.playingUuid);

    const playBtn = document.createElement("button");
    playBtn.className = `btn primary slim${isPlaying ? " is-playing" : ""}`;
    playBtn.type = "button";
    playBtn.textContent = isPlaying ? "Playing" : "Play";
    playBtn.disabled = isPlaying;
    playBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      playStationFromUserGesture(s);
    });

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn ghost slim";
    saveBtn.type = "button";
    saveBtn.textContent = favHas(s.uuid) ? "Saved" : "Save";
    saveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(s);
    });

    actions.appendChild(playBtn);
    actions.appendChild(saveBtn);

    row.appendChild(left);
    row.appendChild(actions);

    row.addEventListener("click", () => playStationFromUserGesture(s));

    frag.appendChild(row);
  });

  list.appendChild(frag);
}

function updateStationButtons(){
  document.querySelectorAll(".station").forEach((row) => {
    const uuid = row.dataset.uuid || "";
    const playBtn = row.querySelector(".btn.primary");
    const saveBtn = row.querySelector(".btn.ghost");

    if (playBtn) {
      const isPlaying = uuid && uuid === String(state.playingUuid);
      playBtn.textContent = isPlaying ? "Playing" : "Play";
      playBtn.disabled = !!isPlaying;
      playBtn.classList.toggle("is-playing", !!isPlaying);
    }

    if (saveBtn) {
      saveBtn.textContent = favHas(uuid) ? "Saved" : "Save";
    }
  });
}

/* station fetching */
async function fetchStations({ reset = false } = {}){
  if (state.loading) return;
  state.loading = true;

  if (reset) {
    state.page = 0;
    state.stations = [];
    el("loadMore").style.display = "none";
    showMessage("");
    setStatus("Loading stations…");
  } else {
    setStatus("Loading more stations…");
  }

  const key = queryKey();
  state.lastQueryKey = key;

  const url = new URL("/api/stations", window.location.origin);
  url.searchParams.set("q", el("q").value.trim());
  url.searchParams.set("tag", el("tag").value.trim());
  url.searchParams.set("sort", el("sort").value);
  url.searchParams.set("us", state.usOnly ? "1" : "0");
  url.searchParams.set("page", String(state.page));
  url.searchParams.set("limit", String(state.limit));

  try {
    const res = await fetch(url.toString(), {
      headers: { "Accept": "application/json" },
      cache: "no-store"
    });

    const data = await res.json();

    if (key !== state.lastQueryKey) {
      state.loading = false;
      return;
    }

    if (!data.ok) {
      showMessage(`
        <div class="errorBox">
          <b>Could not load stations.</b><br>
          ${escapeHtml(data?.error?.message || "Unknown error")}
        </div>
      `);
      setStatus("Error");
      state.loading = false;
      return;
    }

    const incoming = Array.isArray(data.stations) ? data.stations : [];

    if (reset) {
      state.stations = incoming;
      el("list").innerHTML = "";
      renderStations(true);
    } else {
      const previousLength = state.stations.length;
      state.stations = state.stations.concat(incoming);
      const slice = state.stations.slice(previousLength);
      const old = state.stations;
      state.stations = slice;
      renderStations(false);
      state.stations = old;
    }

    updateStationButtons();

    const shown = state.stations.length;
    setStatus(`Showing ${shown} station${shown === 1 ? "" : "s"}${state.usOnly ? " (US)" : ""}`);

    if (shown === 0) {
      showMessage(`<div class="notice">No results. Try a different name or tag.</div>`);
    } else {
      showMessage("");
    }

    if (incoming.length === state.limit) {
      el("loadMore").style.display = "inline-flex";
    } else {
      el("loadMore").style.display = "none";
    }

    state.page += 1;
  } catch (error) {
    showMessage(`
      <div class="errorBox">
        <b>Network issue.</b><br>
        Please refresh and try again.
      </div>
    `);
    setStatus("Error");
  } finally {
    state.loading = false;
  }
}

/* player */
function setNowPlayingUI(s){
  el("nowName").textContent = s.name || "Unknown Station";
  el("nowMeta").textContent = formatMeta(s) || "Live stream";
  el("nowBadge").hidden = false;

  const mini = el("miniArt");

  if (s.favicon) {
    mini.innerHTML = "";
    const img = document.createElement("img");
    img.src = s.favicon;
    img.alt = "";
    img.onerror = () => { mini.innerHTML = iconFallback(); };
    mini.appendChild(img);
  } else {
    mini.innerHTML = iconFallback();
  }
}

function clearNowPlayingUI(){
  el("nowBadge").hidden = true;
}

function resetPlayingState(){
  state.playingUuid = "";
  updateStationButtons();
  clearNowPlayingUI();
}

function playStationFromUserGesture(s){
  const audio = el("audio");
  const stream = String(s.stream || "").trim();

  if (!stream) {
    showMessage(`
      <div class="errorBox">
        <b>No stream URL.</b><br>
        This station did not provide a playable stream.
      </div>
    `);
    return;
  }

  showMessage("");
  state.selectedUuid = String(s.uuid || "");
  setNowPlayingUI(s);

  state.playingUuid = "";
  updateStationButtons();

  audio.pause();
  audio.removeAttribute("crossorigin");
  audio.src = stream;
  audio.load();

  const playPromise = audio.play();

  if (playPromise && typeof playPromise.then === "function") {
    playPromise.then(() => {
      state.playingUuid = String(s.uuid || "");
      updateStationButtons();
      addRecent(s);
    }).catch(() => {
      state.playingUuid = "";
      updateStationButtons();
      showMessage(`
        <div class="errorBox">
          <b>Playback did not start.</b><br>
          Some stations block browsers. Try another station if this one refuses to play.
        </div>
      `);
    });
  } else {
    addRecent(s);
  }
}

/* bindings */
function updateUsSwitch(){
  const sw = el("usSwitch");
  sw.classList.toggle("on", state.usOnly);
  sw.setAttribute("aria-checked", state.usOnly ? "true" : "false");
}

function initBindings(){
  el("themeSelect").addEventListener("change", (e) => {
    applyTheme(e.target.value);
  });

  el("listenBtn").addEventListener("click", () => {
    el("radio").scrollIntoView({ behavior: "smooth" });
  });

  el("moreBtn").addEventListener("click", () => {
    el("more").scrollIntoView({ behavior: "smooth" });
  });

  el("usSwitch").addEventListener("click", () => {
    state.usOnly = !state.usOnly;
    updateUsSwitch();
    fetchStations({ reset: true });
  });

  el("usSwitch").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      state.usOnly = !state.usOnly;
      updateUsSwitch();
      fetchStations({ reset: true });
    }
  });

  el("searchBtn").addEventListener("click", () => fetchStations({ reset: true }));
  el("refreshBtn").addEventListener("click", () => fetchStations({ reset: true }));
  el("loadMore").addEventListener("click", () => fetchStations({ reset: false }));
  el("sort").addEventListener("change", () => fetchStations({ reset: true }));

  ["q", "tag"].forEach((id) => {
    el(id).addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        fetchStations({ reset: true });
      }
    });
  });

  el("clearFavsBtn").addEventListener("click", () => {
    state.favorites = [];
    localFavsSave(state.favorites);
    renderFavorites();
    updateStationButtons();
  });

  el("clearRecentBtn").addEventListener("click", () => {
    state.recent = [];
    recentSave(state.recent);
    renderRecent();
  });

  el("stopBtn").addEventListener("click", () => {
    const audio = el("audio");
    audio.pause();
    audio.src = "";
    audio.load();
    resetPlayingState();
    el("nowName").textContent = "No station selected";
    el("nowMeta").textContent = "Tap Play on a station to start listening";
  });

  el("vol").addEventListener("input", () => {
    el("audio").volume = Number(el("vol").value || 0.8);
  });

  el("audio").addEventListener("ended", () => {
    resetPlayingState();
  });

  el("audio").addEventListener("error", () => {
    state.playingUuid = "";
    updateStationButtons();
    showMessage(`
      <div class="errorBox">
        <b>Stream error.</b><br>
        That station failed to load. Try another station.
      </div>
    `);
  });

  el("audio").addEventListener("stalled", () => {
    if (!state.playingUuid) return;
    state.playingUuid = "";
    updateStationButtons();
  });

  window.addEventListener("scroll", () => {
    if (!state.autoLoadArmed || state.loading) return;
    const btn = el("loadMore");
    if (btn.style.display === "none") return;

    const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 800);
    if (nearBottom) {
      state.autoLoadArmed = false;
      fetchStations({ reset: false }).finally(() => {
        setTimeout(() => {
          state.autoLoadArmed = true;
        }, 500);
      });
    }
  });
}

/* init */
(function init(){
  const savedTheme = localStorage.getItem(LS_THEME) || "light";
  applyTheme(savedTheme);

  state.favorites = localFavsLoad();
  state.recent = recentLoad();

  renderFavorites();
  renderRecent();

  updateUsSwitch();
  initBindings();

  el("audio").volume = Number(el("vol").value || 0.8);

  fetchStations({ reset: true });
})();