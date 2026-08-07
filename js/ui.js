/* =========================================================
   ui.js — renderização de interface: toasts, modais,
   tabelas, cartões de informação, instruções e histórico
   ========================================================= */
(function () {
  "use strict";

  const U = window.Utils;

  // ----- Toasts com barra de progresso opcional -----
  function toast(message, type = "info", opts = {}) {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const icons = {
      success: "bi-check-circle-fill",
      danger: "bi-x-circle-fill",
      warning: "bi-exclamation-triangle-fill",
      info: "bi-info-circle-fill",
    };
    const el = document.createElement("div");
    el.className = `toast align-items-center text-bg-${type} border-0 shadow`;
    el.setAttribute("role", "alert");
    el.innerHTML = `
            <div class="d-flex">
                <div class="toast-body w-100">
                    <div><i class="bi ${icons[type] || icons.info} me-2"></i>${U.esc(message)}</div>
                    ${
                      opts.progress
                        ? `<div class="progress mt-1" style="height:4px">
                        <div class="progress-bar progress-bar-animate" style="width:0%"></div></div>`
                        : ""
                    }
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>`;
    container.appendChild(el);
    const bs = new bootstrap.Toast(el, {
      delay: opts.delay || 3500,
      autohide: !opts.progress,
    });
    el.addEventListener("hidden.bs.toast", () => el.remove());
    bs.show();

    if (opts.progress) {
      const bar = el.querySelector(".progress-bar");
      let p = 0;
      const iv = setInterval(() => {
        p += opts.progressStep || 8;
        bar.style.width = Math.min(100, p) + "%";
        if (p >= 100) {
          clearInterval(iv);
          bs.hide();
        }
      }, opts.speed || 60);
    }
  }

  function showAlert(message, type = "danger") {
    const cont = document.getElementById("alertArea");
    if (!cont) {
      toast(message, type, { delay: 5000 });
      return;
    }
    clearAlert();
    cont.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show d-flex align-items-center">
            <i class="bi bi-exclamation-triangle-fill me-2"></i><div>${U.esc(message)}</div>
            <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert"></button></div>`;
  }
  function clearAlert() {
    const cont = document.getElementById("alertArea");
    if (cont) cont.innerHTML = "";
  }

  // ----- Modal de escolha (lista) retorna Promise<index> -----
  function choiceModal(title, items, itemLabel) {
    return new Promise((resolve) => {
      const modalEl = document.createElement("div");
      modalEl.className = "modal fade";
      modalEl.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h6 class="modal-title">${U.esc(title)}</h6>
                            <button class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="list-group" id="choiceList"></div>
                        </div>
                    </div>
                </div>`;
      document.body.appendChild(modalEl);
      const list = modalEl.querySelector("#choiceList");
      items.forEach((it, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "list-group-item list-group-item-action";
        b.innerHTML = U.esc(itemLabel(it));
        b.addEventListener("click", () => {
          cleanup();
          resolve(i);
        });
        list.appendChild(b);
      });
      const bs = new bootstrap.Modal(modalEl);
      function cleanup() {
        bs.hide();
        modalEl.remove();
      }
      modalEl.addEventListener("hidden.bs.modal", () => {
        cleanup();
        resolve(-1);
      });
      bs.show();
    });
  }

  // ----- Tabela de pontos -----
  function renderPoints(points, lastId) {
    const tbody = document.getElementById("pointsTbody");
    const count = document.getElementById("pointsCount");
    if (!tbody) return;
    tbody.innerHTML = points
      .map(
        (p, i) => `
            <tr data-id="${p.id}">
                <td class="text-muted">${i + 1}</td>
                <td class="small text-nowrap">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</td>
                <td><span class="badge text-bg-secondary origin-badge">${U.esc(p.source)}</span></td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" data-act="edit" data-id="${p.id}"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-outline-secondary" data-act="up" data-id="${p.id}"><i class="bi bi-chevron-up"></i></button>
                        <button class="btn btn-outline-secondary" data-act="down" data-id="${p.id}"><i class="bi bi-chevron-down"></i></button>
                        <button class="btn btn-outline-danger" data-act="remove" data-id="${p.id}"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>`,
      )
      .join("");
    if (count) count.textContent = points.length;
    if (lastId) highlightRow(lastId);
  }

  function highlightRow(id) {
    const tr = document.querySelector(`#pointsTbody tr[data-id="${id}"]`);
    if (tr) {
      tr.classList.add("table-warning");
      setTimeout(() => tr.classList.remove("table-warning"), 1200);
    }
  }

  // ----- Cards de informações da viagem -----
  function renderInfo(info) {
    clearAlert();
    const wrap = document.getElementById("infoCards");
    const empty = document.getElementById("tripEmpty");
    const bboxCard = document.getElementById("bboxCard");
    const bboxText = document.getElementById("bboxText");
    if (!info) {
      wrap.innerHTML = "";
      if (empty) empty.style.display = "";
      if (bboxCard) bboxCard.classList.add("d-none");
      return;
    }
    if (empty) empty.style.display = "none";
    const items = [
      {
        icon: "bi-sign-turn-right",
        l: "Distância",
        v: U.formatDistance(info.distance),
      },
      { icon: "bi-clock", l: "Tempo", v: U.formatDuration(info.duration) },
      {
        icon: "bi-speedometer2",
        l: "Vel. média",
        v: info.avgSpeed.toFixed(1) + " km/h",
      },
      { icon: "bi-diagram-2", l: "Legs", v: info.legs },
      { icon: "bi-sign-turn-left", l: "Steps", v: info.steps },
      { icon: "bi-map-pin", l: "Coord.", v: info.coordinates },
      { icon: "bi-gear", l: "Perfil", v: info.profile },
      { icon: "bi-calendar", l: "Data/Hora", v: info.timestamp },
      { icon: "bi-stopwatch", l: "Resposta", v: info.ms + " ms" },
      {
        icon: "bi-file-earmark-arrow-down",
        l: "Tamanho JSON",
        v: info.bytesFormatted,
      },
    ];
    wrap.innerHTML = items
      .map(
        (it) => `
            <div class="col-6 col-md-4 col-xl-3">
                <div class="card h-100 border-0 shadow-sm">
                    <div class="card-body py-2 d-flex align-items-center gap-2">
                        <i class="bi ${it.icon} text-primary fs-3"></i>
                        <div>
                            <div class="text-muted small">${it.l}</div>
                            <div class="metric-badge">${U.esc(it.v)}</div>
                        </div>
                    </div>
                </div>
            </div>`,
      )
      .join("");

    bboxText.textContent = info.bbox;
    bboxCard.classList.toggle("d-none", !info.bbox);
  }

  // ----- Painel de rotas / alternativas -----
  function renderRoutes(routes, activeIndex) {
    const empty = document.getElementById("alternativesEmpty");
    const list = document.getElementById("routesList");
    if (!list) return;
    if (!routes || routes.length === 0) {
      if (empty) empty.style.display = "block";
      list.innerHTML = "";
      return;
    }
    if (empty) empty.style.display = routes.length <= 1 ? "block" : "none";
    list.innerHTML = routes
      .map(
        (r, i) => `
            <div class="route-item ${i === activeIndex ? "active" : ""}" data-route="${i}">
                <div class="d-flex justify-content-between align-items-center">
                    <span class="route-title">
                        <span class="route-swatch" style="background:${i === activeIndex ? "#0d6efd" : "#9aa0a6"}"></span>
                        ${i === 0 ? "Rota Principal" : "Alternativa " + i}
                    </span>
                    ${i === activeIndex ? '<span class="badge text-bg-primary">Ativa</span>' : ""}
                </div>
                <div class="small text-muted mt-1">
                    <i class="bi bi-arrow-right me-1"></i>${U.formatDistance(r.distance)} ·
                    <i class="bi bi-clock me-1"></i>${U.formatDuration(r.duration)}
                </div>
            </div>`,
      )
      .join("");
  }

  // ----- Instruções turn-by-turn -----
  function renderSteps(steps) {
    const tbody = document.getElementById("stepsTbody");
    const empty = document.getElementById("stepsEmpty");
    if (!tbody) return;
    if (!steps || steps.length === 0) {
      tbody.innerHTML = "";
      if (empty) empty.style.display = "block";
      return;
    }
    if (empty) empty.style.display = "none";
    tbody.innerHTML = steps
      .map(
        (s, i) => `
            <tr>
                <td class="text-muted">${i + 1}</td>
                <td><i class="bi ${U.maneuverIcon(s.maneuverType, s.modifier)} step-icon me-2"></i><span class="small">${U.esc(s.text)}</span></td>
                <td class="small">${U.esc(s.name || "—")}</td>
                <td class="small text-nowrap">${U.formatDistance(s.distance)}</td>
                <td class="small text-nowrap">${U.formatDuration(s.duration)}</td>
            </tr>`,
      )
      .join("");
  }

  // ----- Matriz (endpoint Table) -----
  function renderMatrix(matrix) {
    const table = document.getElementById("matrixTable");
    if (!table) return;
    const dims = matrix.dims;
    let html = "<thead><tr><th>#</th>";
    for (let i = 0; i < dims; i++)
      html += `<th class="text-end">P${i + 1}</th>`;
    html += "</tr></thead><tbody>";
    for (let i = 0; i < dims; i++) {
      html += `<tr><th>P${i + 1}</th>`;
      for (let j = 0; j < dims; j++) {
        const v = matrix.rows[i][j];
        const val =
          v === null || v === undefined
            ? "—"
            : matrix.type === "duration"
              ? Math.round(v / 60) + " min"
              : U.formatDistance(v);
        html += `<td class="text-end small">${val}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody>";
    table.innerHTML = html;
  }

  // ----- Histórico -----
  function renderHistory(entries) {
    const tbody = document.getElementById("historyTbody");
    if (!tbody) return;
    if (!entries || entries.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted py-3">Nenhuma consulta no histórico.</td></tr>';
      return;
    }
    tbody.innerHTML = entries
      .map(
        (e, i) => `
            <tr>
                <td class="small text-nowrap">${U.esc(e.when)}</td>
                <td class="small">${U.esc(e.origin)}</td>
                <td class="small">${U.esc(e.dest)}</td>
                <td class="small text-nowrap">${U.esc(e.distance)}</td>
                <td class="small text-nowrap">${U.esc(e.duration)}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" data-act="load" data-hi="${i}"><i class="bi bi-arrow-counterclockwise"></i></button>
                        <button class="btn btn-outline-danger" data-act="del" data-hi="${i}"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>`,
      )
      .join("");
  }

  // ----- Sugestões de endereço -----
  function renderSuggestions(list) {
    const box = document.getElementById("addrSuggest");
    if (!box) return;
    box.classList.toggle("show", Boolean(list && list.length));
    box.innerHTML = (list || [])
      .map(
        (s, i) =>
          `<li class="list-group-item" data-si="${i}">
                <i class="bi bi-geo me-1"></i>${U.esc(s.label)}
             </li>`,
      )
      .join("");
  }

  // ----- Configurações: preencher/ler form -----
  function fillSettings(s) {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };
    set("setOsrmUrl", s.osrmUrl);
    set("setProfile", s.profile);
    set("setLat", s.defaultLat);
    set("setLng", s.defaultLng);
    set("setZoom", s.defaultZoom);
    set("setTileset", s.tileset);
  }
  function readSettings() {
    const g = (id) => document.getElementById(id).value;
    return {
      osrmUrl: g("setOsrmUrl").trim(),
      profile: g("setProfile"),
      defaultLat: Number(g("setLat")),
      defaultLng: Number(g("setLng")),
      defaultZoom: Number(g("setZoom")),
      tileset: g("setTileset"),
    };
  }

  // ----- Painel de resultados de endpoints especiais -----
  function renderEndpoint(kind, data) {
    const box = document.getElementById("endpointResult");
    if (!box) return;
    if (!data) {
      box.innerHTML = "";
      return;
    }
    if (kind === "nearest") {
      box.innerHTML = `
                <div class="card border-0 shadow-sm mb-2">
                    <div class="card-body">
                        <div class="text-muted small">Via mais próxima encontrada</div>
                        <div class="metric-badge">${data.snapped ? Number(data.snapped.lat).toFixed(6) + ", " + Number(data.snapped.lng).toFixed(6) : "—"}</div>
                        <div class="small text-muted mt-1">Distância: ${data.distance}</div>
                    </div>
                </div>`;
    } else if (kind === "match") {
      box.innerHTML = `<div class="card border-0 shadow-sm mb-2"><div class="card-body small">
                <div><strong>Matches:</strong> ${(data.json.matchings || []).length}</div>
                <div><strong>Tracepoints:</strong> ${(data.json.tracepoints || []).length}</div>
                <div><strong>Tempo:</strong> ${data.ms} ms</div></div></div>`;
    } else if (kind === "trip" && data.before && data.after) {
      const diff = Math.max(0, data.before.distance - data.after.distance);
      box.innerHTML = `
                <div class="card border-0 shadow-sm mb-2">
                    <div class="card-body">
                        <div class="row text-center">
                            <div class="col-6">
                                <div class="text-muted small">Antes (ordem atual)</div>
                                <div class="metric-badge">${U.formatDistance(data.before.distance)}</div>
                                <div class="small text-muted">${data.before.legs} distâncias</div>
                            </div>
                            <div class="col-6">
                                <div class="text-muted small">Depois (otimizado)</div>
                                <div class="metric-badge text-success">${U.formatDistance(data.after.distance)}</div>
                                <div class="small text-muted">${data.after.legs} distâncias</div>
                            </div>
                        </div>
                        <div class="small text-center text-muted mt-2">
                            <i class="bi bi-arrow-down-right me-1"></i>Redução: <strong>${U.formatDistance(diff)}</strong>
                        </div>
                    </div>
                </div>`;
    }
  }

  window.Ui = {
    toast,
    showAlert,
    clearAlert,
    choiceModal,
    renderPoints,
    renderInfo,
    renderRoutes,
    renderSteps,
    renderMatrix,
    renderHistory,
    renderSuggestions,
    fillSettings,
    readSettings,
    renderEndpoint,
  };
})();
