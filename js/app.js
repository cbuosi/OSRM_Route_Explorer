/* =========================================================
   app.js — orquestração principal do OSRM Route Explorer.
   Estado, eventos, consulta aos 5 endpoints, autocomplete,
   histórico, configurações, exportações e ferramentas.
   ========================================================= */
"use strict";

const Ui = window.Ui,
  U = window.Utils,
  O = window.Osrm,
  Geo = window.Geocoder;

// configurações (carregadas do LocalStorage, com padrões de CONFIG)
const settings = Store.loadSettings(CONFIG);
Object.assign(CONFIG, settings);

// estado da aplicação
const state = State;

let idSeq = 0;
let autoTimer = null;

const $ = (sel) => document.querySelector(sel);

/* ---------- Mapa ---------- */
const map = new window.MapController($("#map"), {
  onMapClick: (ll) => onMapClick(ll),
  onWaypointMove: (i, ll) => {
    state.points[i].lat = ll.lat;
    state.points[i].lng = ll.lng;
    renderPointsWrap(state.points[i].id);
    scheduleCalc("route");
  },
  onMouseMove: (ll) => {
    if (state.coordsVisible) setCoords(ll.lat, ll.lng);
  },
  onMouseLeave: () => hideCoords(),
});

/* ============================================================
   PONTOS
   ============================================================ */
function addPoint(latitude, longitude, source) {
  const lat = Number(latitude),
    lng = Number(longitude);
  if (!U.isCoordPair(lat, lng)) {
    Ui.showAlert("Coordenadas inválidas. Verifique latitude/longitude.");
    return false;
  }
  if (state.points.length >= settings.maxPoints) {
    Ui.toast("Limite de pontos atingido.", "warning");
    return false;
  }
  const pt = { id: ++idSeq, lat, lng, source };
  state.points.push(pt);
  renderPointsWrap(pt.id);
  scheduleCalc("route");
  return true;
}

function markers() {
  return state.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    origin: p.source,
  }));
}

function renderPointsWrap(highlightId) {
  map.setPoints(markers(), state.wptVisible);
  Ui.renderPoints(state.points, highlightId);
}

function movePoint(id, up) {
  const i = state.points.findIndex((p) => p.id === id);
  const j = i + (up ? -1 : 1);
  if (i < 0 || j < 0 || j >= state.points.length) return;
  [state.points[i], state.points[j]] = [state.points[j], state.points[i]];
  renderPointsWrap();
  scheduleCalc("route");
}

function removePoint(id) {
  const i = state.points.findIndex((p) => p.id === id);
  if (i < 0) return;
  state.points.splice(i, 1);
  renderPointsWrap();
  if (state.points.length < 2) clearRouteDraw();
  scheduleCalc("route");
}

function editPoint(id) {
  const p = state.points.find((q) => q.id === id);
  if (!p) return;
  const lat = prompt("Latitude:", p.lat);
  if (lat === null) return;
  const lng = prompt("Longitude:", p.lng);
  if (lng === null) return;
  if (!U.isCoordPair(lat, lng)) {
    Ui.toast("Coordenadas inválidas.", "warning");
    return;
  }
  p.lat = Number(lat);
  p.lng = Number(lng);
  renderPointsWrap(id);
  scheduleCalc("route");
}

function onMapClick(ll) {
  if (state.insertAt !== null) {
    const idx = Math.max(0, Math.min(state.insertAt, state.points.length));
    const pt = { id: ++idSeq, lat: ll.lat, lng: ll.lng, source: "map" };
    state.points.splice(idx, 0, pt);
    state.insertAt = null;
    renderPointsWrap(pt.id);
    map.flyTo(ll.lat, ll.lng);
    scheduleCalc("route");
    Ui.toast("Ponto inserido na posição " + (idx + 1) + ".", "success");
    return;
  }
  if (state.clickMode) {
    if (addPoint(ll.lat, ll.lng, "map")) map.flyTo(ll.lat, ll.lng);
  }
}

/* ============================================================
   REQUISIÇÕES OSRM
   ============================================================ */
const coords = () => state.points.map((p) => ({ lng: p.lng, lat: p.lat }));

function setLoading(on) {
  const el = $("#mapLoading");
  el.classList.toggle("show", !!on);
  el.classList.toggle("d-none", !on);
}

function present(res) {
  state.rawResponse = res.data;
  state.requestMs = res.time;
  state.bytes = res.size;
  state.url = res.url;
  const jsonEl = $("#jsonView");
  jsonEl.textContent = JSON.stringify(res.data, null, 2);
  $("#jsonMeta").textContent =
    `tamanho: ${U.formatBytes(res.size)} · ${res.time.toFixed(0)} ms`;
  const urlEl = $("#urlView");
  urlEl.textContent = res.url;
  $("#urlMeta").textContent = `${U.nowStamp()} · ${res.time.toFixed(0)} ms`;
}

async function runEndpoint(service) {
  if (service === "nearest") {
    runNearest();
    return;
  }
  if (service === "trip" && state.points.length < 3) {
    Ui.showAlert("O endpoint Trip precisa de pelo menos 3 pontos.");
    return;
  }
  if (state.points.length < 2) {
    Ui.showAlert("São necessários pelo menos 2 pontos.");
    return;
  }

  setLoading(true);
  const pts = coords();
  try {
    let res;
    if (service === "route") res = await O.route(pts);
    else if (service === "table")
      res = await O.table(pts, { annotations: "duration,distance" });
    else if (service === "trip") res = await O.trip(pts);
    else if (service === "match") res = await O.match(pts);
    present(res);
    afterService(service, res);
  } catch (err) {
    Ui.showAlert(err.message || "Falha na requisição ao OSRM.");
  } finally {
    setLoading(false);
  }
}

async function runNearest() {
  const p = state.points[0];
  if (!p) {
    Ui.showAlert("Adicione ao menos um ponto de referência para o Nearest.");
    return;
  }
  setLoading(true);
  try {
    const res = await O.nearest({ lng: p.lng, lat: p.lat }, 1);
    present(res);
    const w = res.data.waypoints?.[0];
    map.clearRoutes();
    if (w) {
      map.drawNearest([w.location[1], w.location[0]]);
      map.flyTo(w.location[1], w.location[0], 16);
      Ui.renderEndpoint("nearest", {
        snapped: { lat: w.location[1], lng: w.location[0] },
        distance: U.formatDistance(w.distance || 0),
      });
    }
  } catch (err) {
    Ui.showAlert(err.message || "Falha no Nearest.");
  } finally {
    setLoading(false);
  }
}

function afterService(service, res) {
  if (service === "route") renderRouteResult(res.data);
  else if (service === "table") renderTableResult(res.data);
  else if (service === "trip") renderTripResult(res.data);
  else if (service === "match") renderMatchResult(res.data);
}

/* -- Route -- */
function renderRouteResult(data) {
  const routes = data.routes || [];
  if (!routes.length) {
    Ui.showAlert("Nenhuma rota retornada pelo OSRM.");
    return;
  }
  state.routes = routes;
  state.selected = 0;
  state.routeCalculated = true;

  map.drawRoutes(state.routes, 0, settings.routeColor, settings.routeWidth);
  Ui.renderRoutes(state.routes, 0);
  renderInfo(0);
  addHistory();

  const geo = state.routes[0].geometry?.coordinates;
  if (geo && geo.length) map.fitBoundsCoords(geo);
  markRouteTabs(state.routes.length);
}

function switchRoute(i) {
  if (!state.routes[i] || i === state.selected) return;
  state.selected = i;
  map.selectRoute(i, settings.routeColor, settings.routeWidth);
  Ui.renderRoutes(state.routes, i);
  renderInfo(i);
}

function renderInfo(i) {
  const r = state.routes[i];
  if (!r) {
    Ui.renderInfo(null);
    return;
  }
  const legs = r.legs || [];
  const steps = legs.reduce((s, l) => s + (l.steps ? l.steps.length : 0), 0);
  const coords = r.geometry?.coordinates?.length || 0;
  const avg = r.duration > 0 ? r.distance / 1000 / (r.duration / 3600) : 0;
  const b = state.rawResponse?.bbox;
  Ui.renderInfo({
    distance: r.distance,
    duration: r.duration,
    avgSpeed: avg,
    legs: legs.length,
    steps,
    coordinates: coords,
    profile: settings.profile,
    timestamp: U.nowStamp(),
    ms: state.requestMs,
    bytesFormatted: U.formatBytes(state.bytes),
    bbox: b
      ? `SW ${b[1].toFixed(5)}, ${b[0].toFixed(5)} → NE ${b[3].toFixed(5)}, ${b[2].toFixed(5)}`
      : null,
  });
  const list = [];
  legs.forEach((l) =>
    (l.steps || []).forEach((s) =>
      list.push({
        text: s.maneuver?.type || "prosseguir",
        maneuverType: s.maneuver?.type,
        modifier: s.maneuver?.modifier || "straight",
        name: s.name,
        distance: s.distance,
        duration: s.duration,
      }),
    ),
  );
  Ui.renderSteps(list);
}

function markRouteTabs(count) {
  const rnav = $('.nav-link[data-bs-target="#tabRoutes"]');
  if (rnav) rnav.style.display = count > 1 ? "" : "none";
}

/* -- Table -- */
function renderTableResult(data) {
  const dims = data.durations ? data.durations.length : 0;
  Ui.renderMatrix({ dims, rows: data.durations || [], type: "duration" });
  const tab = $('.nav-link[data-bs-target="#tabTable"]');
  if (tab) tab.click();
  Ui.toast("Matriz de distância gerada.", "success");
}

/* -- Trip -- */
function straightDistance(order) {
  let d = 0;
  for (let k = 0; k < order.length - 1; k++) {
    const a = state.points[order[k]],
      b = state.points[order[k + 1]];
    if (a && b) d += haversine(a.lat, a.lng, b.lat, b.lng);
  }
  return d;
}
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000,
    r = Math.PI / 180;
  const dLa = (lat2 - lat1) * r,
    dLo = (lng2 - lng1) * r;
  const a =
    Math.sin(dLa / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function renderTripResult(data) {
  const trip = data.trips?.[0];
  const geo = trip?.geometry?.coordinates || [];
  map.clearRoutes();
  if (geo.length) {
    map.drawRoutes(
      [{ geometry: { coordinates: geo } }],
      0,
      settings.routeColor,
      settings.routeWidth,
    );
    map.fitBoundsCoords(geo);
  }
  // comparação antes (ordem atual, distância em reta) / depois (otimizada)
  const beforeOrder = state.points.map((_, i) => i);
  const before = straightDistance(beforeOrder);
  const after = trip?.distance || 0;
  Ui.renderEndpoint("trip", {
    before: { distance: before, legs: Math.max(0, state.points.length - 1) },
    after: { distance: after, legs: (trip?.legs || []).length },
  });
  state.routeCalculated = true;
  Ui.toast("Trip otimizada.", "success");
}

/* -- Match -- */
function renderMatchResult(data) {
  const matching = data.matchings?.[0];
  const geo = matching?.geometry?.coordinates || [];
  map.clearRoutes();
  if (geo.length) {
    map.drawRoutes(
      [{ geometry: { coordinates: geo } }],
      0,
      settings.routeColor,
      settings.routeWidth,
    );
    map.fitBoundsCoords(geo);
  }
  Ui.renderEndpoint("match", { json: data, ms: state.requestMs });
  Ui.toast("Match concluído.", "success");
}

/* ============================================================
   RECÁLCULO AUTOMÁTICO
   ============================================================ */
function scheduleCalc(mode) {
  if (mode !== "route") return;
  if (state.points.length < 2) return;
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(() => runEndpoint("route"), 400);
}
function clearAutoTimer() {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = null;
}

function clearResults() {
  clearAutoTimer();
  state.routes = [];
  state.selected = 0;
  state.rawResponse = null;
  state.url = "";
  state.requestMs = 0;
  state.bytes = 0;
  state.routeCalculated = false;
  map.clearRoutes();
  Ui.renderRoutes([], 0);
  Ui.renderInfo(null);
  Ui.renderSteps([]);
  Ui.renderEndpoint(null, null);
  $("#jsonView").textContent = "";
  $("#urlView").textContent = "";
  Ui.clearAlert();
}
function clearRouteDraw() {
  state.routes = [];
  map.clearRoutes();
  Ui.renderRoutes([], 0);
  Ui.renderInfo(null);
  Ui.renderSteps([]);
}

/* ============================================================
   HISTÓRICO
   ============================================================ */
function addHistory() {
  const r = state.routes[state.selected];
  Store.addToHistory({
    when: U.nowStamp(),
    origin: state.points[0]
      ? `${state.points[0].lat.toFixed(5)}, ${state.points[0].lng.toFixed(5)}`
      : "—",
    dest: state.points[state.points.length - 1]
      ? `${state.points[state.points.length - 1].lat.toFixed(5)}, ${state.points[state.points.length - 1].lng.toFixed(5)}`
      : "—",
    distance: r ? U.formatDistance(r.distance) : "—",
    duration: r ? U.formatDuration(r.duration) : "—",
    waypoints: state.points.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      source: p.source,
    })),
    url: state.url,
    profile: settings.profile,
  });
}

function refreshHistory() {
  Ui.renderHistory(Store.getHistory());
}

function loadHistory(i) {
  const h = Store.getHistory()[i];
  if (!h) return;
  state.points = (h.waypoints || []).map((w) => ({
    id: ++idSeq,
    lat: w.lat,
    lng: w.lng,
    source: w.source || "map",
  }));
  state.url = h.url || "";
  renderPointsWrap();
  scheduleCalc("route");
  bootstrap.Modal.getInstance($("#historyModal"))?.hide();
  Ui.toast("Rota restaurada do histórico.", "success");
}

function deleteHistory(i) {
  Store.removeFromHistory(i);
  refreshHistory();
}
function clearHistory() {
  Store.clearHistory();
  refreshHistory();
}

/* ============================================================
   CONFIGURAÇÕES
   ============================================================ */
function saveSettings() {
  const s = Ui.readSettings();
  Object.assign(settings, s);
  Object.assign(CONFIG, s);
  Store.saveSettings(settings);
  map.setTileset(settings.tileset);
  bootstrap.Modal.getInstance($("#settingsModal"))?.hide();
  Ui.toast("Configurações salvas.", "success");
  map.map.setView(
    [settings.defaultLat, settings.defaultLng],
    settings.defaultZoom,
  );
}

/* ============================================================
   EXPORTAÇÕES
   ============================================================ */
function exportGeoJSON() {
  const r = state.routes[state.selected];
  if (!r) {
    Ui.showAlert("Calcule uma rota antes de exportar GeoJSON.");
    return;
  }
  const fc = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "route",
          distance_m: r.distance,
          duration_s: r.duration,
        },
        geometry: r.geometry,
      },
      ...state.points.map((p, j) => ({
        type: "Feature",
        properties: { id: j + 1, origem: p.source },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
    ],
  };
  U.download(
    "rota.geojson",
    JSON.stringify(fc, null, 2),
    "application/geo+json",
  );
}

function exportJSONraw() {
  if (!state.rawResponse) {
    Ui.showAlert("Sem resposta para exportar.");
    return;
  }
  U.download(
    "rota.json",
    JSON.stringify(state.rawResponse, null, 2),
    "application/json",
  );
}

function exportGPX() {
  const r = state.routes[state.selected];
  if (!r) {
    Ui.showAlert("Calcule uma rota antes de exportar GPX.");
    return;
  }
  const pts = (r.geometry?.coordinates || [])
    .map(
      ([lng, lat]) =>
        `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"></trkpt>`,
    )
    .join("\n");
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="OSRM Route Explorer" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk>\n    <name>OSRM Route</name>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>\n</gpx>\n`;
  U.download("rota.gpx", gpx, "application/gpx+xml");
}

function bookmarkRoute() {
  if (!state.routes[state.selected]) {
    Ui.showAlert("Calcule uma rota antes de salvar.");
    return;
  }
  addHistory();
  Ui.toast("Rota salva no histórico.", "success");
}

/* ============================================================
   ENDEREÇO (autocomplete) e CEP
   ============================================================ */
const searchDebounced = U.debounce(async (q) => {
  if (q.trim().length < 3) {
    Ui.renderSuggestions([]);
    return;
  }
  let items;
  try {
    items = await Geo.searchAddress(q, 5);
  } catch (e) {
    items = [];
  }
  Ui.renderSuggestions(items);
}, 350);

function pickSuggestion(evt) {
  const item = evt.target.closest("[data-si]");
  if (!item) return;
  const i = Number(item.dataset.si);
  const s = ($("#addrSuggest")._items || [])[i];
  if (!s) return;
  $("#addrInput").value = s.label;
  Ui.renderSuggestions([]);
  if (addPoint(s.lat, s.lng, "endereco"))
    map.flyTo(s.lat, s.lng, Math.max(settings.defaultZoom, 16));
}

async function handleCEP() {
  const cep = $("#cepInput").value.trim();
  if (!cep) {
    Ui.showAlert("Informe um CEP.");
    return;
  }
  setLoading(true);
  try {
    const choices = await Geo.resolveCEP(cep);
    if (!choices.length) {
      Ui.showAlert("Não foi possível encontrar o CEP informado.");
      return;
    }
    if (choices.length === 1) {
      pickCep(choices[0]);
      return;
    }
    const i = await Ui.choiceModal(
      `Resultados para o CEP ${cep}`,
      choices,
      (c) => (c.label || "").slice(0, 90),
    );
    if (i >= 0) pickCep(choices[i]);
  } catch (e) {
    Ui.showAlert(e.message || "Falha ao consultar o CEP.");
  } finally {
    setLoading(false);
  }
}

function pickCep(c) {
  if (addPoint(c.lat, c.lng, "cep"))
    map.flyTo(c.lat, c.lng, Math.max(settings.defaultZoom, 16));
}

/* ============================================================
   EVENTOS / INIT
   ============================================================ */
function setCoords(lat, lng) {
  const el = $("#mouseCoords");
  el.style.display = "block";
  el.textContent = `lat ${lat.toFixed(6)}   lng ${lng.toFixed(6)} · zoom ${map.map.getZoom().toFixed(1)}`;
}
function hideCoords() {
  $("#mouseCoords").style.display = "none";
}

function bindSuggestionsCache() {
  const orig = Ui.renderSuggestions;
  Ui.renderSuggestions = function (list) {
    $("#addrSuggest")._items = list || [];
    orig.call(Ui, list);
  };
}

function bindEvents() {
  // endpoint
  document.querySelectorAll('input[name="endpoint"]').forEach((r) => {
    r.addEventListener("change", (e) => {
      state.endpoint = e.target.value;
      clearAutoTimer();
    });
  });
  $("#btnExecute").addEventListener("click", () => runEndpoint(state.endpoint));

  // pontos (delegação)
  $("#pointsTbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const act = btn.dataset.act;
    if (act === "remove") removePoint(id);
    else if (act === "up") {
      const p = state.points.find((q) => q.id === id);
      if (p) movePoint(id, true);
    } else if (act === "down") movePoint(id, false);
    else if (act === "edit") editPoint(id);
  });

  $("#btnAddLatLng").addEventListener("click", () => {
    const lat = Number($("#latInput").value),
      lng = Number($("#lngInput").value);
    if (addPoint(lat, lng, "latlng")) {
      $("#latInput").value = "";
      $("#lngInput").value = "";
    }
  });
  $("#btnClearPoints").addEventListener("click", () => {
    state.points = [];
    renderPointsWrap();
    clearResults();
  });
  $("#btnInsertBefore").addEventListener("click", () => {
    state.insertAt = state.points.length;
    Ui.toast("Clique no mapa para inserir um ponto no fim da lista.", "info");
  });

  // modo clique
  $("#clickMode").addEventListener("change", (e) => {
    state.clickMode = e.target.checked;
    state.insertAt = null;
  });

  // CEP
  $("#btnCep").addEventListener("click", handleCEP);
  $("#cepInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleCEP();
  });

  // endereço (autocomplete)
  $("#addrInput").addEventListener("input", (e) =>
    searchDebounced(e.target.value),
  );
  $("#addrSuggest").addEventListener("click", pickSuggestion);

  // ferramentas
  $("#btnCenter").addEventListener("click", () => {
    if (state.points.length >= 2) map.fitPoints();
    else
      map.flyTo(settings.defaultLat, settings.defaultLng, settings.defaultZoom);
  });
  $("#btnCoord").addEventListener("click", (e) => {
    state.coordsVisible = !state.coordsVisible;
    e.currentTarget.classList.toggle("btn-primary", state.coordsVisible);
    if (!state.coordsVisible) hideCoords();
  });
  $("#btnFullscreen").addEventListener("click", () => map.fullscreen());
  $("#btnClearMap").addEventListener("click", () => {
    state.points = [];
    renderPointsWrap();
    clearResults();
    hideCoords();
  });
  $("#chkScale").addEventListener("change", (e) =>
    map.toggleScale(e.target.checked),
  );
  $("#chkGrid").addEventListener("change", (e) =>
    map.toggleGraticule(e.target.checked),
  );
  $("#chkWpt").addEventListener("change", (e) => {
    state.wptVisible = e.target.checked;
    map.setPoints(markers(), state.wptVisible);
  });

  // cor / espessura
  $("#routeColor").addEventListener("input", (e) => {
    settings.routeColor = e.target.value;
    redrawActive();
  });
  $("#routeWidth").addEventListener("input", (e) => {
    settings.routeWidth = Number(e.target.value);
    $("#widthVal").textContent = e.target.value;
    redrawActive();
  });

  // resultados
  $("#btnCopyJson").addEventListener("click", () =>
    copyText(
      state.rawResponse ? JSON.stringify(state.rawResponse, null, 2) : "",
    ),
  );
  $("#btnDlJson").addEventListener("click", () => exportJSONraw());
  $("#btnCopyUrl").addEventListener("click", () => copyText(state.url || ""));
  $("#btnGeoJson").addEventListener("click", exportGeoJSON);
  $("#btnExportJson").addEventListener("click", exportJSONraw);
  $("#btnGpx").addEventListener("click", exportGPX);
  $("#btnSaveRoute").addEventListener("click", () => bookmarkRoute());

  // rotas alternativas (painel)
  $("#routesList").addEventListener("click", (e) => {
    const item = e.target.closest("[data-route]");
    if (item) switchRoute(Number(item.dataset.route));
  });

  // configurações
  $("#btnSaveSettings").addEventListener("click", saveSettings);
  $("#settingsModal").addEventListener("show.bs.modal", () =>
    Ui.fillSettings(settings),
  );

  // histórico
  $("#btnClearHistory").addEventListener("click", clearHistory);
  $("#historyModal").addEventListener("show.bs.modal", refreshHistory);
  $("#historyTbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const i = Number(btn.dataset.hi);
    if (btn.dataset.act === "load") loadHistory(i);
    else if (btn.dataset.act === "del") deleteHistory(i);
  });

  // navbar
  document.querySelectorAll('[data-action="nova-rota"]').forEach((b) =>
    b.addEventListener("click", () => {
      state.points = [];
      renderPointsWrap();
      clearResults();
      hideCoords();
      map.flyTo(settings.defaultLat, settings.defaultLng, settings.defaultZoom);
      Ui.toast("Nova rota iniciada.", "success");
    }),
  );
}

function copyText(t) {
  return U.copyText(t).then((ok) =>
    Ui.toast(ok ? "Copiado!" : "Falha ao copiar.", ok ? "success" : "danger"),
  );
}

function redrawActive() {
  if (!state.routes.length) return;
  map.selectRoute(state.selected, settings.routeColor, settings.routeWidth);
}

function init() {
  // Se o Leaflet não tiver carregado, avisa o usuário em vez de falhar em branco.
  if (
    typeof window.L === "undefined" ||
    typeof window.MapController === "undefined"
  ) {
    Ui.showAlert(
      "A biblioteca de mapas (Leaflet) não pôde ser carregada. Verifique sua conexão ou o bloqueio das CDNs utilizadas.",
    );
    console.error(
      "[OSRM Route Explorer] Leaflet não carregou (window.L indefinido).",
    );
    return;
  }
  try {
    map.init();
    map.setTileset(settings.tileset);
    $("#routeColor").value = settings.routeColor;
    $("#routeWidth").value = settings.routeWidth;
    $("#widthVal").textContent = settings.routeWidth;
    bindSuggestionsCache();
    Ui.renderPoints([], null);
    Ui.renderInfo(null);
    bindEvents();
    // re-mede o contêiner após o layout/primeira renderização
    setTimeout(() => map.invalidate(), 60);
    window.addEventListener("load", () => map.invalidate());
    window.addEventListener("resize", () => map.invalidate());
  } catch (err) {
    Ui.showAlert(
      "Falha ao inicializar o mapa: " +
        (err && err.message ? err.message : err),
    );
    console.error("[OSRM Route Explorer] Erro na inicialização:", err);
  }
}

document.addEventListener("DOMContentLoaded", init);

window.App = { settings, state };
