/* =========================================================
   storage.js — persistência LocalStorage: configurações,
   histórico (últimas 20 consultas) e cache de geocodificação.
   ========================================================= */
"use strict";

const Storage = {
  settingsKey: "osrm_rx_settings",
  historyKey: "osrm_rx_history",

  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },

  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("Falha ao salvar no LocalStorage:", e);
    }
  },

  // ----- Configurações -----
  loadSettings() {
    const saved = this.read(this.settingsKey, {});
    return Object.assign({}, CONFIG, saved);
  },
  saveSettings(settings) {
    this.write(this.settingsKey, settings);
  },

  // ----- Histórico -----
  getHistory() {
    return this.read(this.historyKey, []);
  },
  addToHistory(entry) {
    const list = this.read(this.historyKey, []);
    list.unshift(entry);
    this.write(this.historyKey, list.slice(0, CONFIG.historyLimit));
  },
  removeFromHistory(index) {
    const list = this.read(this.historyKey, []);
    list.splice(index, 1);
    this.write(this.historyKey, list);
    return list;
  },
  clearHistory() {
    this.write(this.historyKey, []);
  },

  // ----- Cache simples geocodificação -----
  cacheKey: "osrm_rx_cache",
  cacheGet(key, ttlMs = 6 * 60 * 60 * 1000) {
    const all = this.read(this.cacheKey, {});
    const item = all[key];
    if (!item) return null;
    if (Date.now() - item.t > ttlMs) {
      delete all[key];
      this.write(this.cacheKey, all);
      return null;
    }
    return item.v;
  },
  cacheSet(key, value) {
    const all = this.read(this.cacheKey, {});
    all[key] = { t: Date.now(), v: value };
    this.write(this.cacheKey, all);
  },
};

// Expõe o mesmo objeto also as `Store` (used by app.js/geocoder.js).
window.Store = Storage;
