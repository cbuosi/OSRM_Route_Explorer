/* =========================================================
   map.js — camada do Leaflet: camadas OSM/Satélite, waypoints
   numerados e arrastáveis, rotas, grade, escala e ferramentas.
   ========================================================= */
'use strict';

const OSM = L.tileLayer(CONFIG.tileOsmUrl, {
    maxZoom: 19,
    attribution: CONFIG.tileOsmAttribution
});

const SAT = L.tileLayer(CONFIG.tileSatUrl, {
    maxZoom: 19,
    attribution: CONFIG.tileSatAttribution
});

// espaçamento (graus) da grade por zoom
const GRID_SPACING = [180, 90, 30, 10, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01];

// grade de coordenadas (graticule) em canvas
const Graticule = L.GridLayer.extend({
    createTile(coords) {
        const size = this.getTileSize();
        const tile = document.createElement('canvas');
        tile.width = size.x;
        tile.height = size.y;
        const ctx = tile.getContext('2d');
        const bounds = this._tileCoordsToBounds(coords);
        const nw = bounds.getNorthWest();
        const se = bounds.getSouthEast();
        const step = GRID_SPACING[Math.min(Math.floor(coords.z), GRID_SPACING.length - 1)];
        const origin = this._map.project(nw, coords.z);
        ctx.strokeStyle = 'rgba(13,110,253,.30)';
        ctx.lineWidth = 0.6;
        for (let lng = Math.floor(nw.lng / step) * step; lng <= se.lng; lng += step) {
            const p = this._map.project(L.latLng(0, lng), coords.z);
            ctx.beginPath(); ctx.moveTo(p.x - origin.x, 0); ctx.lineTo(p.x - origin.x, size.y); ctx.stroke();
        }
        for (let lat = Math.floor(se.lat / step) * step; lat <= nw.lat; lat += step) {
            const p = this._map.project(L.latLng(lat, 0), coords.z);
            ctx.beginPath(); ctx.moveTo(0, p.y - origin.y); ctx.lineTo(size.x, p.y - origin.y); ctx.stroke();
        }
        return tile;
    }
});

function waypointIcon(n, kind) {
    return L.divIcon({
        className: 'wpt-marker' + (kind ? ' ' + kind : ''),
        html: '<span class="n">' + (n + 1) + '</span>',
        iconSize: [26, 26],
        iconAnchor: [13, 26]
    });
}

class MapController {
    constructor(el, callbacks = {}) {
        this.el = el;
        this.cb = callbacks; // onMapClick, onWaypointMove, onMouseMove, onRouteClick
        this._points = [];
        this._showWpt = true;
        this.map = null;
        this.graticule = null;
        this.scaleCtrl = null;
        this.routeLayer = L.layerGroup();
        this.markerLayer = L.layerGroup();
        this.routeLines = [];
    }

    init() {
        this.map = L.map(this.el, { zoomSnap: 0.25 });
        this.map._racCtrl = this;
        this.map.setView(
            [CONFIG.defaultLat, CONFIG.defaultLng],
            CONFIG.defaultZoom
        );

        L.Control.TilesetToggle = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd() {
                const ctrl = this._map._racCtrl;
                const box = L.DomUtil.create('div', 'rac-tileset');

                const tgl = L.DomUtil.create('button', 'rac-tileset-tgl', box);
                tgl.type = 'button';
                tgl.setAttribute('aria-label', 'Alternar mapa base');
                tgl.innerHTML = '<i class="bi bi-layers"></i>';
                tgl.onclick = (e) => {
                    L.DomEvent.stop(e);
                    box.classList.toggle('rac-open');
                };

                const mk = (label, key, active) => {
                    const b = L.DomUtil.create('button', 'rac-tileset-item' + (active ? ' active' : ''), box);
                    b.innerHTML = label;
                    b.onclick = (e) => {
                        L.DomEvent.stop(e);
                        ctrl.setTileset(key);
                        box.classList.remove('rac-open');
                    };
                    return b;
                };
                mk('Padrão (OSM)', 'osm', CONFIG.tileset !== 'sat');
                mk('Satélite (Esri)', 'sat', CONFIG.tileset === 'sat');

                L.DomEvent.disableClickPropagation(box);
                return box;
            }
        });
        new L.Control.TilesetToggle().addTo(this.map);

        this.scaleCtrl = L.control.scale({ imperial: false, position: 'bottomleft' });
        this.scaleCtrl.addTo(this.map);

        this.routeLayer = L.layerGroup().addTo(this.map);
        this.markerLayer = L.layerGroup().addTo(this.map);

        this.map.on('click', (e) => {
            // ignora clique sobre um marcador (evita duplicar pontos)
            const t = e.originalEvent && e.originalEvent.target;
            if (t && t.classList && t.classList.contains('leaflet-marker-icon')) return;
            if (this.cb.onMapClick) this.cb.onMapClick(e.latlng);
        });
        this.map.on('mousemove', (e) => this.cb.onMouseMove && this.cb.onMouseMove(e.latlng));
        this.map.on('mouseout', () => this.cb.onMouseLeave && this.cb.onMouseLeave());

        this.syncMarkers();
        this.setTileset(CONFIG.tileset);
        return this;
    }

    setPoints(points, show) {
        this._points = points || [];
        if (typeof show === 'boolean') this._showWpt = show;
        this.syncMarkers();
    }

    syncMarkers() {
        this.markerLayer.clearLayers();
        if (!this._showWpt) return;
        this._points.forEach((pt, i) => {
            const kind = i === 0 ? 'start' : (i === this._points.length - 1 ? 'end' : '');
            const m = L.marker([pt.lat, pt.lng], {
                icon: waypointIcon(i, kind),
                draggable: true,
                zIndexOffset: 1000 + i
            });
            m.on('dragend', () => this.cb.onWaypointMove && this.cb.onWaypointMove(i, m.getLatLng()));
            m.bindPopup(
                `<strong>Ponto ${i + 1}</strong><br>lat: ${pt.lat.toFixed(6)}<br>lng: ${pt.lng.toFixed(6)}<br>` +
                `<small>origem: ${Utils.esc(pt.source)}</small>`
            );
            this.markerLayer.addLayer(m);
        });
    }

    flyTo(lat, lng, zoom) {
        this.map.flyTo([lat, lng], zoom || this.map.getZoom(), { duration: .6 });
    }

    focusPoint(i) {
        const p = this._points[i];
        if (p) this.map.setView([p.lat, p.lng], Math.max(this.map.getZoom(), 15));
    }

    fitBoundsCoords(coords) {
        const ll = coords.map(([lng, lat]) => [lat, lng]);
        if (!ll.length) return;
        this.map.flyToBounds(L.latLngBounds(ll), { padding: [30, 30], duration: .6 });
    }

    fitPoints() {
        if (!this._points.length) return;
        this.fitBoundsCoords(this._points.map(p => [p.lng, p.lat]));
    }

    // routes: [{geometry:{coordinates:[[lng,lat],...]}, distance, duration}]
    drawRoutes(routes, sel, color, weight) {
        this.clearRoutes();
        if (!routes || !routes.length) return;
        this.routeLines = routes.map((r, i) => {
            const ll = (r.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]);
            const selected = i === sel;
            const line = L.polyline(ll, {
                color: selected ? color : '#9aa0a6',
                weight: selected ? weight : 4,
                opacity: selected ? 1 : .85,
                dashArray: selected ? null : '4 6'
            }).addTo(this.routeLayer);
            line.on('click', () => this.cb.onRouteClick && this.cb.onRouteClick(i));
            line.bindTooltip(i === 0 ? 'Rota principal' : 'Alternativa ' + i, { sticky: true });
            return line;
        });
    }

    selectRoute(i, color, weight) {
        this.routeLines.forEach((line, idx) => {
            const sel = idx === i;
            line.setStyle({
                color: sel ? color : '#9aa0a6',
                weight: sel ? weight : 4,
                opacity: sel ? 1 : .85,
                dashArray: sel ? null : '8 6'
            });
        });
    }

    drawNearest(marker) {
        this.clearRoutes();
        const m = L.circleMarker(marker, { radius: 9, color: '#198754', fillColor: '#198754', fillOpacity: .6 }).addTo(this.routeLayer);
        m.bindPopup('<strong>Via mais próxima (Nearest)</strong>').openPopup();
    }

    clearRoutes() {
        this.routeLayer.clearLayers();
        this.routeLines = [];
    }

    setTileset(t) {
        const sat = t === 'sat';
        this.map.addLayer(sat ? SAT : OSM);
        this.map.removeLayer(sat ? OSM : SAT);
        OSM.setOpacity(sat ? 0 : 1);
        SAT.setOpacity(sat ? 1 : 0);
        document.querySelectorAll('.rac-tileset-item').forEach((b) => {
            const isSat = /Sat[eé]lite/.test(b.textContent);
            b.classList.toggle('active', isSat === sat);
        });
    }

    toggleGraticule(on) {
        if (on && !this.graticule) {
            this.graticule = new Graticule();
            this.map.addLayer(this.graticule);
        } else if (!on && this.graticule) {
            this.map.removeLayer(this.graticule);
            this.graticule = null;
        }
    }

    toggleScale(on) {
        if (on && !this.scaleCtrl) {
            this.scaleCtrl = L.control.scale({ imperial: false, position: 'bottomleft' });
            this.scaleCtrl.addTo(this.map);
        } else if (!on && this.scaleCtrl) {
            this.map.removeControl(this.scaleCtrl);
            this.scaleCtrl = null;
        }
    }

    fullscreen() {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (this.el.requestFullscreen) this.el.requestFullscreen();
    }

    invalidate() { this.map.invalidateSize(); }
}

window.MapController = MapController;