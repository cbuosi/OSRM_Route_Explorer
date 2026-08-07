/* =========================================================
   utils.js — Configuração única + Estado global + utilitários.
   Nenhuma URL ou valor de configuração fica espalhado pelo
   projeto: tudo centralizado em CONFIG.
   ========================================================= */
"use strict";

// Configuração global (arquivo único). Valores padrão podem
// ser sobrescritos pelas configurações salvas no LocalStorage.
const CONFIG = {
  osrmUrl: "http://micose:5000",
  profile: "driving",
  defaultLat: -23.5505,
  defaultLng: -46.6333,
  defaultZoom: 12,
  tileset: "osm",
  routeColor: "#0d6efd",
  routeWidth: 6,
  showWaypoints: true,
  requestTimeoutMs: 30000,
  historyLimit: 20,
  maxPoints: 200,
  tileOsmUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileOsmAttribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  tileSatUrl:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  tileSatAttribution: "Tiles &copy; Esri",
};

// Estado da aplicação (mutável durante a sessão).
const State = {
  points: [], // [{id, lat, lng, source}]
  endpoint: "route", // route | trip | table | match | nearest
  routes: [], // caminhos retornados pelo OSRM
  selected: 0, // índice da rota ativa
  rawResponse: null, // último JSON bruto
  url: "",
  requestMs: 0,
  bytes: 0,
  clickMode: false,
  wptVisible: true,
  coordsVisible: false,
  insertAt: null, // índice para inserção entre pontos
  routeCalculated: false,
};

const Utils = {
  debounce(fn, wait = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  },

  formatDistance(m) {
    if (m === null || m === undefined || Number.isNaN(m)) return "—";
    if (m < 1000) return Math.round(m) + " m";
    return (
      (m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km"
    );
  },

  formatDuration(s) {
    if (s === null || s === undefined || Number.isNaN(s)) return "—";
    const t = Math.round(s);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    if (h === 0) return m + " min";
    return h + " h " + String(m).padStart(2, "0") + " min";
  },

  formatBytes(b) {
    if (b === null || b === undefined || Number.isNaN(b)) return "—";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / (1024 * 1024)).toFixed(2) + " MB";
  },

  nowStamp() {
    const d = new Date();
    const p = (v, l = 2) => String(v).padStart(l, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  },

  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
      } catch (e2) {
        return false;
      }
    }
  },

  download(filename, content, mime = "application/json") {
    const blob =
      content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  isLat(v) {
    return v >= -90 && v <= 90;
  },
  isLng(v) {
    return v >= -180 && v <= 180;
  },
  isCoordPair(lat, lng) {
    const la = Number(lat),
      ln = Number(lng);
    return (
      !Number.isNaN(la) && !Number.isNaN(ln) && this.isLat(la) && this.isLng(ln)
    );
  },
  normalizeCep(cep) {
    return String(cep || "")
      .replace(/\D/g, "")
      .slice(0, 8);
  },

  esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  bboxFromCoords(coords) {
    if (!coords || !coords.length) return null;
    let minLng = Infinity,
      maxLng = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity;
    for (const c of coords) {
      const [lng, lat] = c;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return [minLng, minLat, maxLng, maxLat]; // SW[lon,lat] NE[lon,lat]
  },

  avgSpeed(distanceM, durationS) {
    if (!distanceM || !durationS) return 0;
    return (distanceM / durationS) * 3.6;
  },

  // ícone Bootstrap de manobra por tipo/modificador OSRM
  maneuverIcon(type, modifier) {
    const rev = {
      depart: "bi-flag-fill",
      arrive: "bi-signpost-end-fill",
      turn: "bi-arrow-return-right",
      continue: "bi-arrow-up-right",
      merge: "bi-arrows-collapse",
      "on ramp": "bi-sign-turn-right-fill",
      "off ramp": "bi-sign-turn-left-fill",
      fork: "bi-split-horizontal",
      "end of road": "bi-stoplight",
      roundabout: "bi-arrow-repeat",
      "exit roundabout": "bi-arrow-repeat",
      "exit rotary": "bi-arrow-repeat",
      "new name": "bi-arrow-right-short",
    };
    const byType = rev[type] || "bi-arrow-up-right";
    const mod = modifier && String(modifier).toLowerCase();
    if (mod === "right") return "bi-arrow-right";
    if (mod === "left") return "bi-arrow-left";
    if (mod === "straight") return "bi-arrow-up";
    if (mod === "uturn") return "bi-rotate-180";
    if (mod && mod.indexOf("left") >= 0 && byType === "bi-arrow-return-right")
      return "bi-arrow-return-left";
    if (mod && mod.indexOf("right") >= 0 && byType === "bi-arrow-return-left")
      return "bi-arrow-return-right";
    return byType;
  },
};

// Exposição global para os demais módulos do projeto.
window.Utils = Utils;
window.CONFIG = CONFIG;
window.State = State;
