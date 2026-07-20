(function () {
  "use strict";

  const state = {
    participants: [],
    anchor: {},
    weights: {},
    initialWeights: {},
    split: 75,
    blocks: [],
    pool: 0,
    overrides: {},
    result: null,
    selectedCalibration: null
  };

  const participantsInput = document.getElementById("participantsInput");
  const productRatioInput = document.getElementById("productRatioInput");
  const anchorTable = document.getElementById("anchorTable");
  const weightBars = document.getElementById("weightBars");
  const teamLink = document.getElementById("teamLink");
  const blocksInput = document.getElementById("blocksInput");
  const poolInput = document.getElementById("poolInput");

  init();

  function init() {
    // Стартовые диапазоны якоря — плейсхолдеры на 9 продуктов спринта #2; фасилитатор правит вживую на звонке.
    // Фолбэк [0,0] защищает от NaN, если список продуктов и массивы разъедутся.
    const seedMin = [220000, 200000, 80000, 150000, 60000, 30000, 100000, 40000, 50000];
    const seedMax = [550000, 500000, 200000, 400000, 180000, 120000, 300000, 120000, 150000];
    Sprint.PRODUCTS.forEach((product, index) => {
      const min = seedMin[index] ?? 0;
      const max = seedMax[index] ?? 0;
      const mid = (min + max) / 2;
      state.anchor[product.key] = { min, max, final: mid };
    });
    recalcAnchorWeights();
    recalcWeights();
    renderAnchorTable();
    poolInput.value = Math.round(anchorPool());
    bind();
    refreshAll();
  }

  function bind() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => activateTab(tab.dataset.tab));
    });
    participantsInput.addEventListener("input", refreshAll);
    productRatioInput.addEventListener("input", () => {
      state.split = Number(productRatioInput.value) || 0;
      refreshAll();
    });
    anchorTable.addEventListener("input", (event) => {
      const row = event.target.closest("[data-product]");
      if (!row) return;
      const key = row.dataset.product;
      const field = event.target.dataset.field;
      state.anchor[key][field] = Number(event.target.value) || 0;
      if (field === "min" || field === "max") {
        state.anchor[key].final = midPoint(state.anchor[key]);
        row.querySelector('[data-field="mid"]').value = Math.round(midPoint(state.anchor[key]));
        row.querySelector('[data-field="final"]').value = Math.round(state.anchor[key].final);
      }
      recalcAnchorWeights();
      recalcWeights();
      refreshAll();
    });
    document.getElementById("freezeButton").addEventListener("click", () => {
      setStatus("linkStatus", "Веса заморожены, ссылка обновлена.");
      refreshAll();
    });
    document.getElementById("copyLink").addEventListener("click", () => copyText(teamLink.value, "linkStatus", "Ссылка скопирована."));
    blocksInput.addEventListener("input", parseBlocks);
    poolInput.addEventListener("input", () => {
      state.pool = Number(poolInput.value) || 0;
      updatePoolStatus();
    });
    document.getElementById("computeButton").addEventListener("click", computeAndRender);
    document.getElementById("exportButton").addEventListener("click", exportResults);
  }

  function renderAnchorTable() {
    anchorTable.innerHTML = Sprint.PRODUCTS.map((product) => {
      const row = state.anchor[product.key];
      return `
        <div class="anchor-row" data-product="${product.key}">
          <div>
            <strong>${product.short}</strong>
            <small>${product.description}</small>
          </div>
          <label>Min ₽<input class="input" data-field="min" type="number" min="0" step="1000" value="${row.min}"></label>
          <label>Max ₽<input class="input" data-field="max" type="number" min="0" step="1000" value="${row.max}"></label>
          <label>Mid ₽ авто<input class="input readonly-input" data-field="mid" type="number" value="${Math.round(midPoint(row))}" readonly></label>
          <label>После обсуждения ₽<input class="input" data-field="final" type="number" min="0" step="1000" value="${Math.round(row.final)}"></label>
        </div>
      `;
    }).join("");
  }

  function refreshAll() {
    state.participants = Sprint.parseParticipants(participantsInput.value);
    document.getElementById("participantCount").textContent = `${state.participants.length} человек`;
    document.getElementById("splitLabel").textContent = `${state.split} / ${100 - state.split}`;
    document.querySelector(".split-products").style.width = `${state.split}%`;
    document.querySelector(".split-glue").style.width = `${100 - state.split}%`;
    document.getElementById("anchorPoolLabel").textContent = Sprint.money(anchorPool());
    renderWeightBars();
    updateLink();
    renderWeightsReview();
    updatePoolStatus();
  }

  function recalcAnchorWeights() {
    const raw = {};
    Sprint.PRODUCTS.forEach((product) => {
      raw[product.key] = midPoint(state.anchor[product.key]);
    });
    state.initialWeights = Sprint.normalizeWeights(raw);
  }

  function recalcWeights() {
    const raw = {};
    Sprint.PRODUCTS.forEach((product) => {
      raw[product.key] = state.anchor[product.key].final;
    });
    state.weights = Sprint.normalizeWeights(raw);
  }

  // Доли продуктов — круговая диаграмма (донат через stroke-dasharray) + легенда.
  // Пирог = продуктовый слой (сумма долей = 100%); редактирование весов остаётся в anchor-таблице выше.
  function renderWeightBars() {
    const cx = 100;
    const cy = 100;
    const r = 68;
    const strokeW = 34;
    const circumference = 2 * Math.PI * r;

    let acc = 0;
    const slices = Sprint.PRODUCTS.map((product, index) => {
      const current = state.weights[product.key] || 0;
      const dash = current * circumference;
      const slice = `<circle class="pie-slice color-${index + 1}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bar)" stroke-width="${strokeW}" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-acc * circumference}"><title>${product.short}: ${Sprint.percent(current)}</title></circle>`;
      acc += current;
      return slice;
    }).join("");

    const legend = Sprint.PRODUCTS.map((product, index) => {
      const current = state.weights[product.key] || 0;
      const initial = state.initialWeights[product.key] || current;
      const delta = initial ? (current - initial) / initial : 0;
      const warn = Math.abs(delta) > 0.2;
      const absolute = current * (state.split / 100);
      return `
        <div class="legend-row ${warn ? "danger" : ""}">
          <span class="legend-swatch color-${index + 1}"></span>
          <span class="legend-name">${product.short}</span>
          <span class="legend-pct">${Sprint.percent(current)}</span>
          <small class="legend-abs">${Sprint.percent(absolute)} пула</small>
          <small class="legend-delta">${Sprint.percent(delta, 1)}${warn ? " ⚠" : ""}</small>
        </div>
      `;
    }).join("");

    weightBars.innerHTML = `
      <div class="weight-pie-wrap">
        <svg class="weight-pie" viewBox="0 0 200 200" role="img" aria-label="Круговая диаграмма долей продуктов">
          <g transform="rotate(-90 ${cx} ${cy})">${slices}</g>
          <text class="pie-center-top" x="${cx}" y="${cy - 3}" text-anchor="middle">Продукты</text>
          <text class="pie-center-sub" x="${cx}" y="${cy + 16}" text-anchor="middle">${Sprint.percent(state.split / 100, 0)} пула</text>
        </svg>
        <div class="weight-legend">${legend}</div>
      </div>
    `;
  }

  function updateLink() {
    const hash = Sprint.encodeSetup({
      participants: state.participants,
      weights: state.weights,
      split: state.split
    });
    const base = new URL("index.html", window.location.href);
    teamLink.value = `${base.href.split("#")[0]}#${hash}`;
  }

  function renderWeightsReview() {
    document.getElementById("finalWeightsReview").innerHTML = Sprint.PRODUCTS.map((product) => `
      <div class="compact-row">
        <span>${product.short}</span>
        <strong>${Sprint.percent(state.weights[product.key] || 0)}</strong>
      </div>
    `).join("");
  }

  function parseBlocks() {
    const parsed = Sprint.extractBlocks(blocksInput.value);
    const byName = new Map();
    parsed.blocks.forEach((block) => byName.set(block.name, block));
    state.blocks = Array.from(byName.values());
    document.getElementById("parsedCount").textContent = `${state.blocks.length} блоков`;
    document.getElementById("parseErrors").innerHTML = parsed.errors.map((error) => `<p>${error}</p>`).join("");
  }

  function updatePoolStatus() {
    const pool = Number(poolInput.value) || 0;
    const anchor = anchorPool();
    const delta = anchor ? (pool - anchor) / anchor : 0;
    const ok = Math.abs(delta) <= 0.2;
    document.getElementById("poolStatus").innerHTML = `
      <div class="compact-row"><span>Якорный пул</span><strong>${Sprint.money(anchor)}</strong></div>
      <div class="compact-row ${ok ? "" : "warn"}"><span>Введённый пул</span><strong>${Sprint.money(pool)} • ${Sprint.percent(delta, 1)}</strong></div>
    `;
  }

  function computeAndRender() {
    parseBlocks();
    state.pool = Number(poolInput.value) || 0;
    state.result = Sprint.compute(state.blocks, state.weights, state.split, state.pool, state.overrides, state.participants);
    renderCalibration();
    renderResults();
    document.getElementById("exportButton").disabled = false;
    activateTab("results");
  }

  function renderCalibration() {
    if (!state.result) return;
    const columns = [...Sprint.PRODUCTS.map((p) => p.key), "glue"];
    const labels = Object.fromEntries(Sprint.PRODUCTS.map((p) => [p.key, p.short]));
    labels.glue = "Glue";
    if (!state.selectedCalibration && state.result.participants.length) {
      state.selectedCalibration = { source: columns[0], name: state.result.participants[0] };
    }
    document.getElementById("calibrationMount").innerHTML = `
      <div class="calibration-workbench">
        <div class="calibration-matrix" style="--source-cols:${columns.length}">
          <div class="matrix-head participant-head">Участник</div>
          ${columns.map((key) => `<div class="matrix-head">${labels[key]}</div>`).join("")}
          ${state.result.participants.map((name) => `
            <div class="matrix-name">${name}</div>
            ${columns.map((key) => calibrationCell(key, name)).join("")}
          `).join("")}
        </div>
        <aside class="calibration-side">
          ${calibrationEditorPanel()}
        </aside>
      </div>
    `;
    document.getElementById("calibrationMount").querySelectorAll("[data-calibration-cell]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedCalibration = {
          source: button.dataset.source,
          name: button.dataset.name
        };
        renderCalibration();
      });
    });
    bindCalibrationEditor();
  }

  function calibrationCell(source, name) {
    const cell = state.result.calibration[source][name];
    const highDiff = cell.diff !== null && cell.diff > 0.3;
    const selected = state.selectedCalibration &&
      state.selectedCalibration.source === source &&
      state.selectedCalibration.name === name;
    return `
      <button class="matrix-cell ${highDiff ? "warn-cell" : ""} ${selected ? "selected-cell" : ""}" type="button" data-calibration-cell data-source="${source}" data-name="${escapeAttr(name)}">
        <div class="calibration-visual">
          ${cell.self === null ? "" : miniMetric("Self", cell.self, "self")}
          ${miniMetric("Peer", cell.peer, "peer")}
          ${cell.diff === null ? "" : `<div class="delta-line">Δ ${Sprint.percent(cell.diff)}</div>`}
        </div>
        ${cell.overridden ? `<span class="calibration-badge" title="${escapeAttr(cell.note || "")}">К</span>` : ""}
      </button>
    `;
  }

  function calibrationEditorPanel() {
    if (!state.selectedCalibration || !state.result) {
      return `<div class="empty-editor">Выберите ячейку калибровки.</div>`;
    }
    const { source, name } = state.selectedCalibration;
    const cell = state.result.calibration[source][name];
    const existing = state.overrides[source] && state.overrides[source][name];
    return `
      <div class="override-editor-title">
        <div>
          <p class="eyebrow">Правка калибровки</p>
          <h3>${name} • ${sourceLabel(source)}</h3>
        </div>
      </div>
      ${source === "glue" ? "" : sliderField("Self", "self", existing && Number.isFinite(existing.self) ? existing.self : cell.self || 0)}
      ${sliderField("Peer", "peer", existing && Number.isFinite(existing.peer) ? existing.peer : cell.peer || 0)}
      <label class="field-label">Заметка калибровки</label>
      <input class="input" data-override-note type="text" value="${escapeAttr(existing && existing.note || "")}" placeholder="почему правим">
      <div class="result-actions">
        <button type="button" class="primary-button" data-save-override>Сохранить</button>
        <button type="button" class="secondary-button" data-reset-override>Сбросить</button>
      </div>
    `;
  }

  function bindCalibrationEditor() {
    const editor = document.querySelector(".calibration-side");
    if (!editor || !state.selectedCalibration) return;
    const { source, name } = state.selectedCalibration;
    editor.oninput = (event) => {
      if (!event.target.matches("[data-override-range], [data-override-number]")) return;
      const field = event.target.dataset.overrideRange || event.target.dataset.overrideNumber;
      const value = Sprint.clamp(event.target.value, 0, 100);
      editor.querySelector(`[data-override-range="${field}"]`).value = value;
      editor.querySelector(`[data-override-number="${field}"]`).value = value;
      editor.querySelector(`[data-override-fill="${field}"]`).style.setProperty("--fill", `${value}%`);
    };
    const saveButton = editor.querySelector("[data-save-override]");
    if (!saveButton) return;
    saveButton.addEventListener("click", () => {
      const note = editor.querySelector("[data-override-note]").value.trim();
      if (!note) {
        editor.querySelector("[data-override-note]").focus();
        return;
      }
      state.overrides[source] = state.overrides[source] || {};
      state.overrides[source][name] = {
        note,
        peer: Number(editor.querySelector('[data-override-number="peer"]').value) / 100
      };
      if (source !== "glue") {
        state.overrides[source][name].self = Number(editor.querySelector('[data-override-number="self"]').value) / 100;
      }
      computeAndRender();
    });
    editor.querySelector("[data-reset-override]").addEventListener("click", () => {
      if (state.overrides[source]) delete state.overrides[source][name];
      computeAndRender();
    });
  }

  function miniMetric(label, value, kind) {
    return `
      <div class="mini-metric ${kind}">
        <span>${label}</span>
        <div class="mini-track"><i style="width:${(value || 0) * 100}%"></i></div>
        <strong>${Sprint.percent(value)}</strong>
      </div>
    `;
  }

  function sliderField(label, key, value) {
    const pct = Math.round((value || 0) * 100);
    return `
      <label class="field-label">${label}</label>
      <div class="override-slider" data-override-fill="${key}" style="--fill:${pct}%">
        <input class="range" type="range" min="0" max="100" step="1" value="${pct}" data-override-range="${key}">
        <input class="input points-input" type="number" min="0" max="100" step="1" value="${pct}" data-override-number="${key}">
      </div>
    `;
  }

  function sourceLabel(source) {
    const product = Sprint.PRODUCTS.find((item) => item.key === source);
    return product ? product.short : "Glue";
  }

  function renderResults() {
    if (!state.result) return;
    const diagnostics = state.result.totals.diagnostics || [];
    const diagnosticItems = diagnostics.map((item) => `<li>${item.message}</li>`);
    if (!state.result.totals.complete && !diagnosticItems.length) {
      diagnosticItems.push(`<li>Сумма распределённых долей ${Sprint.percent(state.result.totals.rawShare)}. Проверьте, что по каждому продукту с весом есть участники и peer-оценки, а glue заполнен всеми участниками.</li>`);
    }
    const dataWarning = state.result.totals.complete
      ? ""
      : `<div class="data-warning"><strong>Недостаточно данных для финальной выплаты.</strong><ul>${diagnosticItems.join("")}</ul></div>`;
    document.getElementById("summaryMount").innerHTML = `
      <div class="summary-strip">
        <div><span>Продуктовый</span><strong>${Sprint.money(state.result.totals.productPay)}</strong></div>
        <div><span>Glue</span><strong>${Sprint.money(state.result.totals.gluePay)}</strong></div>
        <div><span>Σ долей</span><strong>${Sprint.percent(state.result.totals.share, 1)}</strong></div>
        <div><span>Σ выплат</span><strong>${Sprint.money(state.result.totals.pay)}</strong></div>
      </div>
      ${dataWarning}
    `;
    document.getElementById("resultMount").innerHTML = `
      <table class="data-table result-table">
        <thead><tr><th>Участник</th><th>Доля</th><th>К выплате</th><th>Источники</th></tr></thead>
        <tbody>
          ${state.result.participants.map((name) => {
            const sources = state.result.sourceShares[name];
            return `
              <tr>
                <th>${name}</th>
                <td>${Sprint.percent(state.result.finalShare[name])}</td>
                <td>${payoutCell(name)}</td>
                <td>${stackedBar(sources)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  function payoutCell(name) {
    const maxPay = state.result.participants.reduce((max, participant) => {
      return Math.max(max, state.result.pay[participant] || 0);
    }, 0) || 1;
    const pay = state.result.pay[name] || 0;
    return `
      <div class="payout-cell">
        <strong>${Sprint.money(pay)}</strong>
        <div class="payout-track"><i style="width:${(pay / maxPay) * 100}%"></i></div>
      </div>
    `;
  }

  function stackedBar(sources) {
    const entries = [...Sprint.PRODUCTS.map((product, index) => [product.short, sources[product.key] || 0, `color-${index + 1}`]), ["Glue", sources.glue || 0, "glue-color"]];
    const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
    return `
      <div class="source-viz">
        <div class="stacked-bar">
          ${entries.map(([key, value, color]) => `<span class="${color}" style="width:${(value / total) * 100}%" title="${key}: ${Sprint.percent(value)}"></span>`).join("")}
        </div>
        <div class="source-legend">
          ${entries.filter(([, value]) => value > 0.001).map(([key, value, color]) => `
            <span><i class="${color}"></i>${key} ${Sprint.percent(value)}</span>
          `).join("")}
        </div>
      </div>
    `;
  }

  function exportResults() {
    if (!state.result) return;
    const rows = [];
    state.result.participants.forEach((name) => {
      Object.entries(state.result.sourceShares[name]).forEach(([source, share]) => {
        rows.push({
          participant: name,
          source,
          share,
          rub: share * state.pool,
          note: state.overrides[source] && state.overrides[source][name] && state.overrides[source][name].note || ""
        });
      });
    });
    const csv = ["participant,source,share,rub,note"].concat(rows.map((row) =>
      [row.participant, row.source, row.share, Math.round(row.rub), row.note].map(csvCell).join(",")
    )).join("\n");
    const payload = JSON.stringify({ result: state.result, rows }, null, 2);
    download("sprint-results.json", payload, "application/json");
    window.setTimeout(() => download("sprint-results.csv", csv, "text/csv"), 150);
  }

  function activateTab(name) {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    document.getElementById(`${name}Tab`).classList.add("active");
  }

  function anchorPool() {
    return Sprint.PRODUCTS.reduce((sum, product) => sum + midPoint(state.anchor[product.key]), 0);
  }

  function midPoint(row) {
    return ((Number(row.min) || 0) + (Number(row.max) || 0)) / 2;
  }

  function copyText(text, statusId, message) {
    navigator.clipboard.writeText(text).then(() => setStatus(statusId, message));
  }

  function setStatus(id, text) {
    document.getElementById(id).textContent = text;
  }

  function csvCell(value) {
    return `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function escapeAttr(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

})();
