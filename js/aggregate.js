(function () {
  "use strict";

  const state = {
    participants: [],
    anchor: {},
    weights: {},
    initialWeights: {},
    split: 70,
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
    Zabeg.PRODUCTS.forEach((product, index) => {
      const min = [350000, 250000, 180000, 320000][index];
      const max = [550000, 420000, 280000, 520000][index];
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
    anchorTable.innerHTML = Zabeg.PRODUCTS.map((product) => {
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
    state.participants = Zabeg.parseParticipants(participantsInput.value);
    document.getElementById("participantCount").textContent = `${state.participants.length} человек`;
    document.getElementById("splitLabel").textContent = `${state.split} / ${100 - state.split}`;
    document.querySelector(".split-products").style.width = `${state.split}%`;
    document.querySelector(".split-glue").style.width = `${100 - state.split}%`;
    document.getElementById("anchorPoolLabel").textContent = Zabeg.money(anchorPool());
    renderWeightBars();
    updateLink();
    renderWeightsReview();
    updatePoolStatus();
  }

  function recalcAnchorWeights() {
    const raw = {};
    Zabeg.PRODUCTS.forEach((product) => {
      raw[product.key] = midPoint(state.anchor[product.key]);
    });
    state.initialWeights = Zabeg.normalizeWeights(raw);
  }

  function recalcWeights() {
    const raw = {};
    Zabeg.PRODUCTS.forEach((product) => {
      raw[product.key] = state.anchor[product.key].final;
    });
    state.weights = Zabeg.normalizeWeights(raw);
  }

  function renderWeightBars() {
    weightBars.innerHTML = Zabeg.PRODUCTS.map((product, index) => {
      const current = state.weights[product.key] || 0;
      const initial = state.initialWeights[product.key] || current;
      const delta = initial ? (current - initial) / initial : 0;
      const absolute = current * (state.split / 100);
      return `
        <div class="weight-bar color-${index + 1} ${Math.abs(delta) > 0.2 ? "danger" : ""}">
          <div class="bar-label">
            <strong>${product.short}</strong>
            <span>${Zabeg.percent(current)} • ${Zabeg.percent(absolute)} от пула</span>
          </div>
          <div class="vertical-bar">
            <div class="anchor-mark" style="bottom:${initial * 100}%"></div>
            <div class="bar-fill" style="height:${current * 100}%"></div>
          </div>
          <small>${Zabeg.percent(initial)} → ${Zabeg.percent(current)} (${Zabeg.percent(delta, 1)})</small>
          ${Math.abs(delta) > 0.2 ? `<em>выходит за коридор корректировки</em>` : ""}
        </div>
      `;
    }).join("");
  }

  function updateLink() {
    const hash = Zabeg.encodeSetup({
      participants: state.participants,
      weights: state.weights,
      split: state.split
    });
    const base = new URL("index.html", window.location.href);
    teamLink.value = `${base.href.split("#")[0]}#${hash}`;
  }

  function renderWeightsReview() {
    document.getElementById("finalWeightsReview").innerHTML = Zabeg.PRODUCTS.map((product) => `
      <div class="compact-row">
        <span>${product.short}</span>
        <strong>${Zabeg.percent(state.weights[product.key] || 0)}</strong>
      </div>
    `).join("");
  }

  function parseBlocks() {
    const parsed = Zabeg.extractBlocks(blocksInput.value);
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
      <div class="compact-row"><span>Якорный пул</span><strong>${Zabeg.money(anchor)}</strong></div>
      <div class="compact-row ${ok ? "" : "warn"}"><span>Введённый пул</span><strong>${Zabeg.money(pool)} • ${Zabeg.percent(delta, 1)}</strong></div>
    `;
  }

  function computeAndRender() {
    parseBlocks();
    state.pool = Number(poolInput.value) || 0;
    state.result = Zabeg.compute(state.blocks, state.weights, state.split, state.pool, state.overrides, state.participants);
    renderCalibration();
    renderResults();
    document.getElementById("exportButton").disabled = false;
    activateTab("results");
  }

  function renderCalibration() {
    if (!state.result) return;
    const columns = [...Zabeg.PRODUCTS.map((p) => p.key), "glue"];
    const labels = Object.fromEntries(Zabeg.PRODUCTS.map((p) => [p.key, p.short]));
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
          ${cell.diff === null ? "" : `<div class="delta-line">Δ ${Zabeg.percent(cell.diff)}</div>`}
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
      const value = Zabeg.clamp(event.target.value, 0, 100);
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
        <strong>${Zabeg.percent(value)}</strong>
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
    const product = Zabeg.PRODUCTS.find((item) => item.key === source);
    return product ? product.short : "Glue";
  }

  function renderResults() {
    if (!state.result) return;
    const diagnostics = state.result.totals.diagnostics || [];
    const diagnosticItems = diagnostics.map((item) => `<li>${item.message}</li>`);
    if (!state.result.totals.complete && !diagnosticItems.length) {
      diagnosticItems.push(`<li>Сумма распределённых долей ${Zabeg.percent(state.result.totals.rawShare)}. Проверьте, что по каждому продукту с весом есть участники и peer-оценки, а glue заполнен всеми участниками.</li>`);
    }
    const dataWarning = state.result.totals.complete
      ? ""
      : `<div class="data-warning"><strong>Недостаточно данных для финальной выплаты.</strong><ul>${diagnosticItems.join("")}</ul></div>`;
    document.getElementById("summaryMount").innerHTML = `
      <div class="summary-strip">
        <div><span>Продуктовый</span><strong>${Zabeg.money(state.result.totals.productPay)}</strong></div>
        <div><span>Glue</span><strong>${Zabeg.money(state.result.totals.gluePay)}</strong></div>
        <div><span>Σ долей</span><strong>${Zabeg.percent(state.result.totals.share, 1)}</strong></div>
        <div><span>Σ выплат</span><strong>${Zabeg.money(state.result.totals.pay)}</strong></div>
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
                <td>${Zabeg.percent(state.result.finalShare[name])}</td>
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
        <strong>${Zabeg.money(pay)}</strong>
        <div class="payout-track"><i style="width:${(pay / maxPay) * 100}%"></i></div>
      </div>
    `;
  }

  function stackedBar(sources) {
    const entries = [...Zabeg.PRODUCTS.map((product, index) => [product.short, sources[product.key] || 0, `color-${index + 1}`]), ["Glue", sources.glue || 0, "glue-color"]];
    const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
    return `
      <div class="source-viz">
        <div class="stacked-bar">
          ${entries.map(([key, value, color]) => `<span class="${color}" style="width:${(value / total) * 100}%" title="${key}: ${Zabeg.percent(value)}"></span>`).join("")}
        </div>
        <div class="source-legend">
          ${entries.filter(([, value]) => value > 0.001).map(([key, value, color]) => `
            <span><i class="${color}"></i>${key} ${Zabeg.percent(value)}</span>
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
    download("zabeg-results.json", payload, "application/json");
    window.setTimeout(() => download("zabeg-results.csv", csv, "text/csv"), 150);
  }

  function activateTab(name) {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    document.getElementById(`${name}Tab`).classList.add("active");
  }

  function anchorPool() {
    return Zabeg.PRODUCTS.reduce((sum, product) => sum + midPoint(state.anchor[product.key]), 0);
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
