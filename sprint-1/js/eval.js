(function () {
  "use strict";

  const state = {
    participants: [],
    weights: {},
    split: 70
  };

  const form = document.getElementById("evalForm");
  const nameSelect = document.getElementById("participantName");
  const productsMount = document.getElementById("productsMount");
  const glueMount = document.getElementById("glueMount");
  const submitButton = document.getElementById("submitButton");
  const formStatus = document.getElementById("formStatus");
  const outputBox = document.getElementById("outputBox");
  const encodedOutput = document.getElementById("encodedOutput");
  const setupStatus = document.getElementById("setupStatus");

  init();

  function init() {
    const setup = Zabeg.decodeSetup(window.location.hash);
    state.participants = setup.participants;
    state.weights = setup.weights;
    state.split = setup.split;

    setupStatus.textContent = state.participants.length
      ? `${state.participants.length} участников • ${state.split}/${100 - state.split}`
      : "Нет параметров setup";

    renderNameSelect();
    renderProducts();
    renderGlue();
    bind();
    validate();
  }

  function renderNameSelect() {
    nameSelect.innerHTML = `<option value="">Выберите имя</option>`;
    state.participants.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      nameSelect.appendChild(option);
    });
  }

  function renderProducts() {
    productsMount.innerHTML = "";
    Zabeg.PRODUCTS.forEach((product) => {
      const section = document.createElement("section");
      section.className = "panel product-card";
      section.dataset.product = product.key;
      section.innerHTML = `
        <div class="product-toggle">
          <label class="check-row">
            <input type="checkbox" data-role="worked">
            <span>
              <strong>${product.title}</strong>
              <small>${product.description}</small>
            </span>
          </label>
          <span class="weight-chip">${Zabeg.percent(state.weights[product.key] || 0, 1)} веса</span>
        </div>
        <div class="product-body collapsed">
          <label class="field-label">Какой % продукта сделал я</label>
          <div class="range-row">
            <input class="range" type="range" min="0" max="100" value="0" data-role="self">
            <strong data-role="selfLabel">0%</strong>
          </div>
          <label class="field-label">Что именно делал</label>
          <textarea class="textarea" rows="3" data-role="what" placeholder="1-2 фразы"></textarea>
          <div class="peer-head">
            <strong>Peer-оценка</strong>
            <span class="remaining" data-role="remaining">Осталось: 10</span>
          </div>
          <div class="peer-list" data-role="peerList"></div>
        </div>
      `;
      productsMount.appendChild(section);
    });
  }

  function renderGlue() {
    glueMount.innerHTML = `
      <label class="field-label">Что я внёс в общую ткань забега помимо продуктов</label>
      <textarea class="textarea" rows="4" data-role="glueWhat" placeholder="Один абзац"></textarea>
      <div class="peer-head">
        <strong>Peer-оценка glue</strong>
        <span class="remaining" data-role="glueRemaining">Осталось: 10</span>
      </div>
      <div class="peer-list" data-role="gluePeerList"></div>
    `;
  }

  function bind() {
    nameSelect.addEventListener("change", () => {
      refreshPeerLists();
      validate();
    });
    productsMount.addEventListener("input", handleInput);
    productsMount.addEventListener("change", handleInput);
    glueMount.addEventListener("input", handleInput);
    form.addEventListener("submit", submit);
    document.getElementById("copyOutput").addEventListener("click", () => copyText(encodedOutput.value, "Блок скопирован"));
  }

  function handleInput(event) {
    const section = event.target.closest(".product-card");
    if (event.target.matches("[data-peer-range], [data-peer-points]")) {
      syncPeerControl(event.target);
    }
    if (event.target.dataset.role === "worked" && section) {
      section.querySelector(".product-body").classList.toggle("collapsed", !event.target.checked);
      refreshPeerLists();
    }
    if (event.target.dataset.role === "self") {
      section.querySelector('[data-role="selfLabel"]').textContent = `${event.target.value}%`;
    }
    updateRemaining();
    validate();
  }

  function refreshPeerLists() {
    const selected = nameSelect.value;
    const peers = state.participants.filter((name) => name !== selected);
    document.querySelectorAll('[data-role="peerList"]').forEach((mount) => {
      const existing = readPeer(mount);
      mount.innerHTML = peers.map((name) => peerRow(name, existing)).join("");
    });
    const glueExisting = readPeer(glueMount.querySelector('[data-role="gluePeerList"]'));
    glueMount.querySelector('[data-role="gluePeerList"]').innerHTML = peers.map((name) => peerRow(name, glueExisting)).join("");
    updateRemaining();
  }

  function peerRow(name, existing) {
    const safe = cssEscape(name);
    const current = existing[name] || {};
    const points = Number(current.points) || 0;
    return `
      <div class="peer-row" data-peer="${safe}">
        <span>${name}</span>
        <div class="budget-control" style="--fill:${points * 10}%">
          <input class="range budget-range" type="range" min="0" max="10" step="1" value="${points}" data-peer-range="${safe}">
        </div>
        <input class="input points-input" type="number" min="0" max="10" step="1" value="${points}" data-peer-points="${safe}">
        <input class="input note-input" type="text" value="${escapeAttr(current.note || "")}" placeholder="обоснование" data-peer-note="${safe}">
      </div>
    `;
  }

  function readPeer(mount) {
    const result = {};
    if (!mount) return result;
    mount.querySelectorAll(".peer-row").forEach((row) => {
      const name = row.dataset.peer;
      result[name] = {
        points: Number(row.querySelector("[data-peer-points]").value) || 0,
        note: row.querySelector("[data-peer-note]").value.trim()
      };
    });
    return result;
  }

  function updateRemaining() {
    document.querySelectorAll(".product-card").forEach((section) => {
      const mount = section.querySelector('[data-role="peerList"]');
      const sum = sumPeer(mount);
      const remaining = section.querySelector('[data-role="remaining"]');
      remaining.textContent = `Осталось: ${10 - sum}`;
      remaining.classList.toggle("ok", sum === 10);
      remaining.classList.toggle("bad", sum > 10);
      refreshBudgetControls(mount);
    });
    const gluePeerMount = glueMount.querySelector('[data-role="gluePeerList"]');
    const glueSum = sumPeer(gluePeerMount);
    const glueRemaining = glueMount.querySelector('[data-role="glueRemaining"]');
    glueRemaining.textContent = `Осталось: ${10 - glueSum}`;
    glueRemaining.classList.toggle("ok", glueSum === 10);
    glueRemaining.classList.toggle("bad", glueSum > 10);
    refreshBudgetControls(gluePeerMount);
  }

  function syncPeerControl(control) {
    const row = control.closest(".peer-row");
    const mount = control.closest(".peer-list");
    if (!row || !mount) return;
    const numberInput = row.querySelector("[data-peer-points]");
    const rangeInput = row.querySelector("[data-peer-range]");
    const otherSum = Array.from(mount.querySelectorAll(".peer-row")).reduce((sum, peerRowEl) => {
      if (peerRowEl === row) return sum;
      return sum + (Number(peerRowEl.querySelector("[data-peer-points]").value) || 0);
    }, 0);
    const maxAllowed = Math.max(0, 10 - otherSum);
    const value = Zabeg.clamp(control.value, 0, maxAllowed);
    numberInput.value = value;
    rangeInput.value = value;
  }

  function refreshBudgetControls(mount) {
    if (!mount) return;
    mount.querySelectorAll(".peer-row").forEach((row) => {
      const value = Number(row.querySelector("[data-peer-points]").value) || 0;
      const otherSum = Array.from(mount.querySelectorAll(".peer-row")).reduce((sum, peerRowEl) => {
        if (peerRowEl === row) return sum;
        return sum + (Number(peerRowEl.querySelector("[data-peer-points]").value) || 0);
      }, 0);
      const maxAllowed = Math.max(0, 10 - otherSum);
      const range = row.querySelector("[data-peer-range]");
      row.querySelector(".budget-control").style.setProperty("--fill", `${value * 10}%`);
      range.setAttribute("aria-valuemax", String(maxAllowed));
      row.classList.toggle("capped", value >= maxAllowed && maxAllowed < 10);
    });
  }

  function validate() {
    const errors = [];
    if (!nameSelect.value) errors.push("выберите имя");
    document.querySelectorAll(".product-card").forEach((section) => {
      const worked = section.querySelector('[data-role="worked"]').checked;
      if (!worked) return;
      const title = section.querySelector("strong").textContent;
      if (sumPeer(section.querySelector('[data-role="peerList"]')) !== 10) errors.push(`${title}: peer не равен 10`);
    });
    const glueText = glueMount.querySelector('[data-role="glueWhat"]').value.trim();
    if (!glueText) errors.push("заполните glue-текст");
    if (sumPeer(glueMount.querySelector('[data-role="gluePeerList"]')) !== 10) errors.push("glue peer не равен 10");
    submitButton.disabled = errors.length > 0;
    formStatus.textContent = errors.length ? errors[0] : "Можно формировать блок";
    return errors.length === 0;
  }

  function submit(event) {
    event.preventDefault();
    if (!validate()) return;
    const block = {
      v: 1,
      name: nameSelect.value,
      ts: new Date().toISOString(),
      products: {},
      glue: {
        what: glueMount.querySelector('[data-role="glueWhat"]').value.trim(),
        ...peerPayload(glueMount.querySelector('[data-role="gluePeerList"]'))
      }
    };
    document.querySelectorAll(".product-card").forEach((section) => {
      const key = section.dataset.product;
      if (!section.querySelector('[data-role="worked"]').checked) {
        block.products[key] = null;
        return;
      }
      block.products[key] = {
        self: Number(section.querySelector('[data-role="self"]').value) || 0,
        what: section.querySelector('[data-role="what"]').value.trim(),
        ...peerPayload(section.querySelector('[data-role="peerList"]'))
      };
    });
    encodedOutput.value = Zabeg.encodeBlock(block);
    outputBox.classList.remove("hidden");
  }

  function peerPayload(mount) {
    const peer = {};
    const peer_notes = {};
    mount.querySelectorAll(".peer-row").forEach((row) => {
      const name = row.dataset.peer;
      peer[name] = Number(row.querySelector("[data-peer-points]").value) || 0;
      const note = row.querySelector("[data-peer-note]").value.trim();
      if (note) peer_notes[name] = note;
    });
    return { peer, peer_notes };
  }

  function sumPeer(mount) {
    if (!mount) return 0;
    return Array.from(mount.querySelectorAll("[data-peer-points]")).reduce((sum, input) => sum + (Number(input.value) || 0), 0);
  }

  function copyText(text, message) {
    navigator.clipboard.writeText(text).then(() => {
      formStatus.textContent = message;
    });
  }

  function cssEscape(value) {
    return String(value).replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }
})();
