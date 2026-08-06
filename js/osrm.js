/* =========================================================
   osrm.js — cliente HTTP para o servidor OSRM.
   Endpoints: Route, Nearest, Table, Trip, Match.
   Monta a URL, adiciona timeout e retorna tempo/tamanho/url.
   ========================================================= */
'use strict';

const OSRM = {
    // transforma objeto em querystring (ignora falsy)
    qs(params) {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(params || {})) {
            if (v === undefined || v === null || v === '') continue;
            p.set(k, String(v));
        }
        return p.toString();
    },

    // coordenadas no formato lon,lat;lon,lat
    coordStr(points) {
        return points.map(pt => `${Number(pt.lng).toFixed(6)},${Number(pt.lat).toFixed(6)}`).join(';');
    },

    // URL base de um serviço/perfil
    base(service) {
        const root = String(CONFIG.osrmUrl).replace(/\/+$/, '');
        return `${root}/${service}/v1/${CONFIG.profile}/`;
    },

    buildRequest(service, points, params) {
        const paramStr = this.qs(params);
        return this.base(service) + this.coordStr(points) + (paramStr ? '?' + paramStr : '');
    },

    // executa fetch com timeout, sanando erros e retornando metadados
    async request(url) {
        const started = performance.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
        let size = 0;
        try {
            const res = await fetch(url, { signal: controller.signal });
            console.log('[OSRM] req ', url);
            console.log('[OSRM] status', res.status, res.statusText);
            if (!res.ok) {
                const status = res.status;
                let detail = '';
                try { detail = (await res.text()).slice(0, 200); } catch (e) { /* noop */ }
                console.error('[OSRM] resposta de erro:', detail);
                throw new Error(`HTTP ${status} ${res.statusText}${detail ? ' — ' + detail : ''}`);
            }
            const text = await res.text();
            size = new Blob([text]).size;
            const data = JSON.parse(text);
            console.log('[OSRM] resposta (OK):', data);
            if (data.code && data.code !== 'Ok') {
                console.error('[OSRM] código não-Ok:', data.code, data.message);
                throw new Error(data.message || `Resposta OSRM: ${data.code}`);
            }
            return { data, url, status: res.status, time: performance.now() - started, size };
        } catch (err) {
            console.error('[OSRM] erro:', err.message);
            if (err.name === 'TypeError') throw new Error('Servidor OSRM indisponível ou inacessível.');
            throw err;
        } finally {
            clearTimeout(timer);
        }
    },

    // ---- Route ----
    async route(points, params = {}) {
        const url = this.buildRequest('route', points, {
            alternatives: 'true', steps: 'true', annotations: 'true',
            overview: 'full', geometries: 'geojson', ...params
        });
        return this.request(url);
    },

    // ---- Nearest (usa apenas 1 ponto) ----
    async nearest(point, number = 1) {
        const url = this.base('nearest') + `${Number(point.lng).toFixed(6)},${Number(point.lat).toFixed(6)}` +
            '?' + this.qs({ number, geometries: 'geojson' });
        return this.request(url);
    },

    // ---- Table (matriz) ----
    async table(coords, { annotations = 'duration,distance' } = {}) {
        const url = this.buildRequest('table', coords, { annotations });
        return this.request(url);
    },

    // ---- Trip ----
    async trip(coords, { roundtrip = false } = {}) {
        const url = this.buildRequest('trip', coords, {
            roundtrip, steps: 'true', overview: 'full', geometries: 'geojson'
        });
        return this.request(url);
    },

    // ---- Match ----
    async match(coords, { radiuses } = {}) {
        const url = this.buildRequest('match', coords, {
            steps: 'true', overview: 'full', geometries: 'geojson',
            annotations: 'true', radiuses: radiuses ? radiuses.join(';') : undefined
        });
        return this.request(url);
    },

    // estatísticas agregadas de uma rota (distance, duration, legs,
    // steps, nº de coordenadas, bbox e velocidade média)
    routeStats(route) {
        const legs = route.legs || [];
        const steps = legs.reduce((s, l) => s + (l.steps ? l.steps.length : 0), 0);
        const coords = route.geometry?.coordinates || [];
        return {
            distance: route.distance,
            duration: route.duration,
            legs: legs.length,
            steps,
            coordinates: coords.length,
            bbox: Utils.bboxFromCoords(coords),
            avgSpeed: Utils.avgSpeed(route.distance, route.duration)
        };
    }
};

// Expõe global para o app (usado como `O = window.Osrm`).
window.Osrm = OSRM;
window.OSRM = OSRM;