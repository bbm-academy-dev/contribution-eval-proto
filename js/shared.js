(function () {
  "use strict";

  const PRODUCTS = [
    {
      key: "architecture",
      title: "Архитектура платформы Doctor.School",
      short: "Архитектура",
      description: "Экосистема Doctor.School: backend, фронты, роли; первый фронт — прототип приложения врача."
    },
    {
      key: "miniseries_ep1",
      title: "Мини-сериал, пилотная серия",
      short: "Мини-сериал",
      description: "Интерактивный обучающий ролик с ветками выбора."
    },
    {
      key: "pilot_lesson",
      title: "Пилотный урок",
      short: "Пилотный урок",
      description: "Тесты и презентация внутри прототипа."
    },
    {
      key: "content_factory",
      title: "Контент-завод",
      short: "Контент-завод",
      description: "Сценарная система и AI-конвейер генерации."
    }
  ];

  const PREFIX = "ZABEG-EVAL::";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function round(value, digits = 4) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function money(value) {
    return `${Math.round(Number(value) || 0).toLocaleString("ru-RU")} ₽`;
  }

  function percent(value, digits = 1) {
    return `${round((Number(value) || 0) * 100, digits).toLocaleString("ru-RU", {
      maximumFractionDigits: digits
    })}%`;
  }

  function parseParticipants(text) {
    return String(text || "")
      .split(/\r?\n|,/)
      .map((name) => name.trim())
      .filter(Boolean)
      .filter((name, index, all) => all.indexOf(name) === index);
  }

  function normalizeWeights(weights) {
    const next = {};
    let total = 0;
    PRODUCTS.forEach((product) => {
      const value = Math.max(0, Number(weights && weights[product.key]) || 0);
      next[product.key] = value;
      total += value;
    });
    if (!total) {
      const equal = 1 / PRODUCTS.length;
      PRODUCTS.forEach((product) => {
        next[product.key] = equal;
      });
      return next;
    }
    PRODUCTS.forEach((product) => {
      next[product.key] = next[product.key] / total;
    });
    return next;
  }

  function encodeSetup({ participants, weights, split }) {
    const normalized = normalizeWeights(weights);
    const p = participants.map(encodeURIComponent).join(",");
    const w = PRODUCTS.map((product) => {
      const value = round((normalized[product.key] || 0) * 100, 3);
      return `${product.key}:${value}`;
    }).join(",");
    return `p=${p}&w=${w}&split=${clamp(split, 0, 100)}`;
  }

  function decodeSetup(hash) {
    const raw = String(hash || window.location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(raw);
    const participants = (params.get("p") || "")
      .split(",")
      .map((name) => safeDecodeURIComponent(name).trim())
      .filter(Boolean);
    const weights = {};
    (params.get("w") || "").split(",").forEach((pair) => {
      const [key, value] = pair.split(":");
      if (key) weights[key] = (Number(value) || 0) / 100;
    });
    return {
      participants,
      weights: normalizeWeights(weights),
      split: clamp(params.get("split") || 70, 0, 100)
    };
  }

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value);
    } catch (_error) {
      return value;
    }
  }

  function toBase64Unicode(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  function fromBase64Unicode(value) {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encodeBlock(block) {
    return `${PREFIX}${toBase64Unicode(JSON.stringify(block))}`;
  }

  function decodeBlock(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed.startsWith(PREFIX)) throw new Error("Нет префикса ZABEG-EVAL");
    return JSON.parse(fromBase64Unicode(trimmed.slice(PREFIX.length)));
  }

  function extractBlocks(text) {
    const matches = String(text || "").match(new RegExp(`${PREFIX}[A-Za-z0-9+/=]+`, "g")) || [];
    const blocks = [];
    const errors = [];
    matches.forEach((match, index) => {
      try {
        blocks.push(decodeBlock(match));
      } catch (error) {
        errors.push(`Блок ${index + 1}: ${error.message}`);
      }
    });
    return { blocks, errors };
  }

  function emptyProductMap(factory) {
    return PRODUCTS.reduce((acc, product) => {
      acc[product.key] = factory ? factory(product) : {};
      return acc;
    }, {});
  }

  function compute(blocks, finalWeights, productRatioPercent, pool, overrides = {}, setupParticipants = []) {
    const weights = normalizeWeights(finalWeights);
    const productRatio = clamp(productRatioPercent, 0, 100) / 100;
    const glueRatio = 1 - productRatio;
    const participantSet = new Set(setupParticipants.filter(Boolean));
    blocks.map((block) => block.name).filter(Boolean).forEach((name) => participantSet.add(name));
    blocks.forEach((block) => {
      PRODUCTS.forEach((product) => {
        Object.keys((block.products && block.products[product.key] && block.products[product.key].peer) || {}).forEach((name) => {
          participantSet.add(name);
        });
      });
      Object.keys((block.glue && block.glue.peer) || {}).forEach((name) => {
        participantSet.add(name);
      });
    });
    const participants = Array.from(participantSet);

    const productShare = Object.fromEntries(participants.map((name) => [name, 0]));
    const sourceShares = Object.fromEntries(participants.map((name) => [name, emptyProductMap(() => 0)]));
    const calibration = {};
    const diagnostics = [];
    const submittedNames = new Set(blocks.map((block) => block.name).filter(Boolean));
    setupParticipants.filter((name) => !submittedNames.has(name)).forEach((name) => {
      diagnostics.push({
        type: "missing_block",
        source: "participant",
        message: `Нет блока оценки от участника «${name}».`
      });
    });
    blocks
      .filter((block) => block.name && !setupParticipants.includes(block.name))
      .forEach((block) => {
        diagnostics.push({
          type: "unknown_participant",
          source: "participant",
          message: `Блок от «${block.name}» не найден в списке участников setup.`
        });
      });

    PRODUCTS.forEach((product) => {
      const contributors = blocks.filter((block) => block.products && block.products[product.key]);
      if (!contributors.length && (weights[product.key] || 0) > 0) {
        diagnostics.push({
          type: "empty_product",
          source: product.key,
          message: `Нет оценок по продукту «${product.short}», его вес ${percent(weights[product.key])} не распределён.`
        });
      }
      const selfRaw = {};
      const peerRaw = {};
      contributors.forEach((block) => {
        selfRaw[block.name] = Number(block.products[product.key].self) || 0;
        Object.entries(block.products[product.key].peer || {}).forEach(([target, points]) => {
          peerRaw[target] = (peerRaw[target] || 0) + (Number(points) || 0);
        });
      });

      const productOverrides = overrides[product.key] || {};
      const selfShare = normalizePersonScores(selfRaw, participants);
      const peerShare = normalizePersonScores(peerRaw, participants);
      participants.forEach((name) => {
        const cellOverride = productOverrides[name] || {};
        if (Number.isFinite(cellOverride.self)) selfShare[name] = clamp(cellOverride.self, 0, 1);
        if (Number.isFinite(cellOverride.peer)) peerShare[name] = clamp(cellOverride.peer, 0, 1);
      });
      renormalize(selfShare, participants);
      renormalize(peerShare, participants);

      calibration[product.key] = {};
      const hasSelfSignal = participants.some((name) => (selfShare[name] || 0) > 0);
      const hasPeerSignal = participants.some((name) => (peerShare[name] || 0) > 0);
      participants.forEach((name) => {
        let shareInProduct = 0;
        if (hasSelfSignal && hasPeerSignal) {
          shareInProduct = 0.5 * (selfShare[name] || 0) + 0.5 * (peerShare[name] || 0);
        } else if (hasSelfSignal) {
          shareInProduct = selfShare[name] || 0;
        } else if (hasPeerSignal) {
          shareInProduct = peerShare[name] || 0;
        }
        const weighted = (weights[product.key] || 0) * shareInProduct;
        productShare[name] = (productShare[name] || 0) + weighted;
        sourceShares[name][product.key] = productRatio * weighted;
        calibration[product.key][name] = {
          self: selfShare[name] || 0,
          peer: peerShare[name] || 0,
          diff: Math.abs((selfShare[name] || 0) - (peerShare[name] || 0)),
          note: productOverrides[name] && productOverrides[name].note,
          overridden: Boolean(productOverrides[name])
        };
      });
    });

    const glueRaw = {};
    blocks.forEach((block) => {
      Object.entries((block.glue && block.glue.peer) || {}).forEach(([target, points]) => {
        glueRaw[target] = (glueRaw[target] || 0) + (Number(points) || 0);
      });
    });
    const glueShare = normalizePersonScores(glueRaw, participants);
    if (overrides.glue) {
      participants.forEach((name) => {
        if (Number.isFinite(overrides.glue[name] && overrides.glue[name].peer)) {
          glueShare[name] = clamp(overrides.glue[name].peer, 0, 1);
        }
      });
      renormalize(glueShare, participants);
    }

    calibration.glue = {};
    participants.forEach((name) => {
      sourceShares[name].glue = glueRatio * (glueShare[name] || 0);
      calibration.glue[name] = {
        self: null,
        peer: glueShare[name] || 0,
        diff: null,
        note: overrides.glue && overrides.glue[name] && overrides.glue[name].note,
        overridden: Boolean(overrides.glue && overrides.glue[name])
      };
    });

    const rawFinalShare = {};
    participants.forEach((name) => {
      rawFinalShare[name] = Object.values(sourceShares[name]).reduce((sum, value) => sum + value, 0);
    });
    const totalRawShare = Object.values(rawFinalShare).reduce((sum, value) => sum + value, 0);
    const scale = 1;
    const finalShare = {};
    const pay = {};
    participants.forEach((name) => {
      finalShare[name] = rawFinalShare[name] * scale;
      Object.keys(sourceShares[name]).forEach((source) => {
        sourceShares[name][source] *= scale;
      });
      pay[name] = finalShare[name] * (Number(pool) || 0);
    });
    const normalizedProductShare = participants.reduce((sum, name) => {
      return sum + PRODUCTS.reduce((productSum, product) => productSum + (sourceShares[name][product.key] || 0), 0);
    }, 0);
    const normalizedGlueShare = participants.reduce((sum, name) => sum + (sourceShares[name].glue || 0), 0);

    return {
      participants,
      weights,
      productRatio,
      glueRatio,
      productShare,
      glueShare,
      sourceShares,
      calibration,
      finalShare,
      pay,
      totals: {
        share: Object.values(finalShare).reduce((sum, value) => sum + value, 0),
        pay: Object.values(pay).reduce((sum, value) => sum + value, 0),
        productPay: (Number(pool) || 0) * normalizedProductShare,
        gluePay: (Number(pool) || 0) * normalizedGlueShare,
      rawShare: totalRawShare,
        normalized: false,
        complete: diagnostics.length === 0 && Math.abs(totalRawShare - 1) <= 0.001,
        diagnostics
      }
    };
  }

  function normalizePersonScores(raw, participants) {
    const scores = Object.fromEntries(participants.map((name) => [name, Math.max(0, Number(raw[name]) || 0)]));
    renormalize(scores, participants);
    return scores;
  }

  function renormalize(scores, participants) {
    const total = participants.reduce((sum, name) => sum + (Number(scores[name]) || 0), 0);
    if (!total) {
      participants.forEach((name) => {
        scores[name] = 0;
      });
      return scores;
    }
    participants.forEach((name) => {
      scores[name] = (Number(scores[name]) || 0) / total;
    });
    return scores;
  }

  window.Zabeg = {
    PRODUCTS,
    PREFIX,
    clamp,
    round,
    money,
    percent,
    parseParticipants,
    normalizeWeights,
    encodeSetup,
    decodeSetup,
    encodeBlock,
    decodeBlock,
    extractBlocks,
    compute
  };
})();
