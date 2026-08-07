/* =========================================================
   geocoder.js — geocodificação e CEP.
   Prioridade de consulta de CEP: Nominatim -> ViaCEP -> Photon.
   Com cache simples (LocalStorage) para respeitar os limites.
   ========================================================= */
"use strict";

const Geocoder = {
  nominatimUrl: "https://nominatim.openstreetmap.org",
  viacepUrl: "https://viacep.com.br/ws",
  photonUrl: "https://photon.komoot.io/api",

  async fetchJSON(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);
    return res.json();
  },

  // Nominatim: busca por texto/configurador (endereço, CEP postalcode)
  async nominatim(query, params = {}) {
    const q = new URLSearchParams({
      format: "jsonv2",
      "accept-language": "pt-BR",
      ...params,
    });
    const url = `${this.nominatimUrl}/search?${q}&q=${encodeURIComponent(query)}`;
    const data = await this.cached(url, () => this.fetchJSON(url));
    return (data || [])
      .map((d) => ({
        label: d.display_name,
        lat: Number(d.lat),
        lng: Number(d.lon),
        source: "nominatim",
      }))
      .filter((it) => Number.isFinite(it.lat) && Number.isFinite(it.lng));
  },

  // Nominatim estruturado (rua/cidade/estado), sem depender de um texto livre
  async nominatimStructured({ street, city, state, postcode }) {
    const q = new URLSearchParams({
      format: "jsonv2",
      "accept-language": "pt-BR",
      limit: 5,
      countrycodes: "br",
    });
    if (street) q.set("street", street);
    if (city) q.set("city", city);
    if (state) q.set("state", state);
    if (postcode) q.set("postalcode", postcode);
    const url = `${this.nominatimUrl}/search?${q}`;
    const data = await this.cached(url, () => this.fetchJSON(url));
    return (data || [])
      .map((d) => ({
        label: d.display_name,
        lat: Number(d.lat),
        lng: Number(d.lon),
        source: "nominatim",
      }))
      .filter((it) => Number.isFinite(it.lat) && Number.isFinite(it.lng));
  },

  // Photon (Komoot)
  async photon(query, limit = 5) {
    const url = `${this.photonUrl}/?q=${encodeURIComponent(query)}&limit=${limit}&lang=pt`;
    const data = await this.cached(url, () => this.fetchJSON(url));
    return (data.features || []).map((f) => ({
      label: f.properties.label || f.properties.name,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      source: "photon",
    }));
  },

  // ViaCEP (CEP brasileiro -> endereço, sem coordenadas)
  async viacep(cep) {
    const d = Utils.normalizeCep(cep);
    if (d.length !== 8) throw new Error("CEP inválido");
    const url = `${this.viacepUrl}/${d}/json/`;
    const data = await this.cached(
      url,
      () => this.fetchJSON(url),
      24 * 60 * 60 * 1000,
    );
    if (data.erro) throw new Error("CEP não encontrado");
    return data;
  },

  // cacheia o JSON de uma URL (com TTL)
  async cached(url, fn, ttlMs) {
    const hit = Store.cacheGet(url, ttlMs);
    if (hit) return hit;
    const value = await fn();
    Store.cacheSet(url, value);
    return value;
  },

  // ----- API pública -----

  // autocomplete de endereço via Nominatim (fallback Photon)
  async searchAddress(query, limit = 5) {
    if (!query || query.trim().length < 2) return [];
    try {
      return await this.nominatim(query, { limit, countrycodes: "br" });
    } catch (e) {
      try {
        return await this.photon(query, limit);
      } catch (e2) {
        return [];
      }
    }
  },

  // resolve CEP -> lista de candidatos com coordenadas
  async resolveCEP(cep) {
    const digitos = Utils.normalizeCep(cep);
    if (digitos.length !== 8) throw new Error("CEP inválido");

    let choices = [];

    // 1) Nominatim por postal code (prioridade)
    try {
      const r = await this.nominatim(digitos, { limit: 5, countrycodes: "br" });
      choices = r.filter(
        (it) => /brazil|brasil|br/i.test(it.label) && it.lat && it.lng,
      );
    } catch (e) {
      /* tenta o próximo */
    }

    // 2) ViaCEP (endereço) + geocode do endereço pelo Nominatim (estruturado)
    if (!choices.length) {
      try {
        const via = await this.viacep(cep);
        const geo = await this.nominatimStructured({
          street: via.logradouro,
          city: via.localidade,
          state: via.uf,
          postcode: via.cep,
        });
        choices = geo.map((it) => ({ ...it, label: it.label }));
      } catch (e) {
        /* tenta o próximo */
      }
    }

    // 3) Photon
    if (!choices.length) {
      try {
        choices = await this.photon(digitos, 5);
      } catch (e) {
        /* segue */
      }
    }

    return choices;
  },
};

// Expõe global para o app (usado como `Geo = window.Geocoder`).
window.Geocoder = Geocoder;
