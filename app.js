document.documentElement.classList.add("compact");
window._bootLoading = false;
// Force compact UI on both <html> and <body>, even if body isn't ready yet.
(function forceCompact() {
  document.documentElement.classList.add("compact");
  if (document.body) {
    document.body.classList.add("compact");
  } else {
    window.addEventListener("DOMContentLoaded", () =>
      document.body.classList.add("compact")
    );
  }
})();

let T, P, Z;

function saveToUrl() {
  if (window._bootLoading) return;
  if (typeof window._saveState === "function") window._saveState();
}

/* ---- UI error helper ---- */
function fatal(msg) {
  console.error("[SC2 Planner] " + msg);
  const main = document.getElementById("main");
  if (!main) return;
  const div = document.createElement("div");
  div.className = "card";
  div.style.borderColor = "var(--danger)";
  div.style.background = "#1a0f12";
  div.innerHTML = `<div class="big" style="color:var(--danger)">Data error</div>
                         <div class="small">${msg}</div>`;
  main.prepend(div);
}

/* ================= Helpers ================ */

const tag2attr = (t) => {
  const map = {
    light: "light",
    armored: "armored",
    biological: "bio",
    mechanical: "mech",
    massive: "massive",
    psionic: "psionic",
    structure: "structure",
    heroic: "heroic",
  };
  return map[String(t || "").toLowerCase()] || null;
};

function normalizeAll() {
  const AIR = {
    Terran: new Set([
      "Viking",
      "Medivac",
      "Liberator",
      "Banshee",
      "Raven",
      "Battlecruiser",
    ]),
    Protoss: new Set([
      "Phoenix",
      "Void Ray",
      "Oracle",
      "Tempest",
      "Carrier",
      "Observer",
      "Warp Prism",
      "Mothership",
    ]),
    Zerg: new Set([
      "Mutalisk",
      "Corruptor",
      "Brood Lord",
      "Viper",
      "Overseer",
      "Overlord",
    ]),
  };
  const AA = {
    Terran: new Set([
      "Marine",
      "Cyclone",
      "Viking",
      "Thor",
      "Widow Mine",
      "Liberator",
      "Battlecruiser",
    ]),
    Protoss: new Set([
      "Stalker",
      "Phoenix",
      "Void Ray",
      "Archon",
      "Tempest",
      "Carrier",
      "Mothership",
    ]),
    Zerg: new Set(["Queen", "Hydralisk", "Mutalisk", "Corruptor"]),
  };
  const CLOAK = new Set(["Banshee", "Ghost", "Dark Templar", "Observer"]);
  const BURROW = new Set([
    "Zergling",
    "Baneling",
    "Roach",
    "Ravager",
    "Lurker",
    "Infestor",
    "Swarm Host",
    "Widow Mine",
  ]);
  const HEALS = new Set(["Medivac", "Queen"]);
  function push(arr, v) {
    if (!arr.includes(v)) arr.push(v);
  }
  function normRace(U, race) {
    Object.entries(U).forEach(([name, u]) => {
      u.tags = Array.isArray(u.tags) ? u.tags.slice() : [];
      u.attrs = Array.isArray(u.attrs) ? u.attrs.slice() : [];
      u.tags.forEach((t) => {
        const a = tag2attr(t);
        if (a) push(u.attrs, a);
        if (String(t).toLowerCase() === "detector") {
          u.flags = u.flags || {};
          u.flags.detector = true;
        }
      });

      if (AIR[race]?.has(name)) push(u.attrs, "air");
      else push(u.attrs, "ground");

      if (AA[race]?.has(name)) push(u.tags, "aa");

      u.flags = u.flags || {};
      if (CLOAK.has(name)) u.flags.cloak = true;
      if (BURROW.has(name)) u.flags.burrow = true;
      if (HEALS.has(name)) u.flags.heals = true;

      if (!Number.isFinite(u.sup)) u.sup = 1;
      if (!Number.isFinite(u.armor)) u.armor = 0;
      if (!Number.isFinite(u.hp)) u.hp = 0;
      if (!Number.isFinite(u.sh)) u.sh = 0;
      if (!Number.isFinite(u.t)) u.t = 0;
      if (!("micro" in u)) u.micro = 3;
    });
  }
  normRace(T, "Terran");
  normRace(P, "Protoss");
  normRace(Z, "Zerg");
}

function buildAppliesFn(spec, U) {
  if (!spec) return () => false;
  const tests = [];
  if (Array.isArray(spec.units) && spec.units.length) {
    const arr = spec.units.map((n) => U[n]).filter(Boolean);
    tests.push((u) => arr.includes(u));
  }
  if (Array.isArray(spec.tagsAny) && spec.tagsAny.length) {
    tests.push((u) => (u.tags || []).some((t) => spec.tagsAny.includes(t)));
  }
  if (Array.isArray(spec.attrsAny) && spec.attrsAny.length) {
    tests.push((u) => (u.attrs || []).some((a) => spec.attrsAny.includes(a)));
  }
  if (Array.isArray(spec.attrsAll) && spec.attrsAll.length) {
    tests.push((u) => spec.attrsAll.every((a) => (u.attrs || []).includes(a)));
  }
  if (Array.isArray(spec.attrsNot) && spec.attrsNot.length) {
    tests.push((u) => !(u.attrs || []).some((a) => spec.attrsNot.includes(a)));
  }
  return (u) => tests.every((fn) => fn(u));
}

function _avgBonus(b) {
  if (!b) return 0;
  if (Array.isArray(b)) {
    const vals = b
      .map((v) =>
        typeof v === "number" ? v : Number(v.add ?? v.dmg ?? v.value ?? 0)
      )
      .filter(Number.isFinite);
    return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
  }
  if (typeof b === "object") {
    const vals = Object.values(b).map(Number).filter(Number.isFinite);
    return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
  }
  return Number(b) || 0;
}
function _maxBonus(b) {
  if (!b) return 0;
  if (Array.isArray(b)) {
    const vals = b
      .map((v) =>
        typeof v === "number" ? v : Number(v.add ?? v.dmg ?? v.value ?? 0)
      )
      .filter(Number.isFinite);
    return vals.length ? Math.max(...vals) : 0;
  }
  if (typeof b === "object") {
    const vals = Object.values(b).map(Number).filter(Number.isFinite);
    return vals.length ? Math.max(...vals) : 0;
  }
  return Number(b) || 0;
}

function baseDps(u) {
  const g = Number(u.dpsG);
  const a = Number(u.dpsA);
  const gOk = Number.isFinite(g) && g > 0;
  const aOk = Number.isFinite(a) && a > 0;

  if (gOk && aOk) return (g + a) / 2; // ✅ average, not sum
  if (gOk) return g;
  if (aOk) return a;

  if (Number.isFinite(u.dps)) return Math.max(0, Number(u.dps));
  return 0;
}

function maxDps(u) {
  // If you ever store a separate peak DPS, use it; otherwise equals base.
  return Number.isFinite(u.dpsMax) ? Math.max(0, Number(u.dpsMax)) : baseDps(u);
}

/* Build-time bar cap */
let BAR_MAX_SEC = 15 * 60;
function computeBarMaxSec() {
  let tMax = 0,
    supForMax = 1;
  [T, P, Z].forEach((U) => {
    Object.keys(U).forEach((n) => {
      const u = U[n];
      const t = Number(u.t) || 0;
      if (t > tMax) {
        tMax = t;
        supForMax = Math.max(0.5, Number(u.sup) || 1);
      }
    });
  });
  const unitsNeeded = Math.ceil(200 / supForMax);
  BAR_MAX_SEC = Math.max(1, unitsNeeded * tMax);
}

/* Caps for “qualities” */
const EFF_CAP = 1.5;
const GAS_W_FOR_CAPS = 1;
let GLOBAL_CAPS = null;

function computeCapsOnce() {
  let dpsPerSupMax = 0;
  let hpPerSupMax = 0;
  let costPerSupMax = 0;

  [T, P, Z].forEach((U) => {
    Object.values(U).forEach((u) => {
      const sup = Math.max(1e-6, u.sup || 1);
      const dpsPerSup = baseDps(u) / sup;
      const hpPerSup = ((Number(u.hp) || 0) + (Number(u.sh) || 0)) / sup;
      const cpsU = ((Number(u.m) || 0) + (Number(u.g) || 0)) / sup;

      if (dpsPerSup > dpsPerSupMax) dpsPerSupMax = dpsPerSup;
      if (hpPerSup > hpPerSupMax) hpPerSupMax = hpPerSup;
      if (cpsU > costPerSupMax) costPerSupMax = cpsU;
    });
  });

  return {
    dpsPerSup: dpsPerSupMax,
    hpPerSup: hpPerSupMax,
    costPerSup: costPerSupMax,
  };
}

/* Ability pills helper */
function flag(el, ok, label) {
  el.className = "pill " + (ok ? "okay" : "bad");
  el.textContent = `${label}: ${ok ? "yes" : "no"}`;
}
// function setAFlags(rootNode, det, bur, clk, aa, recall, scans, creep, heals) {
//   const g = (id) => rootNode.querySelector(`[data-id="${id}"]`);
//   flag(g("aDetector"), det, "Detector");
//   flag(g("aBurrow"), bur, "Burrow");
//   flag(g("aCloak"), clk, "Cloak");
//   flag(g("aAA"), aa, "Anti-air");
//   flag(g("aRecall"), recall, "Recall");
//   flag(g("aScan"), scans, "Scans");
//   flag(g("aCreep"), creep, "Creep");
//   flag(g("aHeals"), heals, "Heals");
// }

/* =================== App factory =================== */
function App(rootId) {
  const root = document.getElementById(rootId);
  const get = (key) => root.querySelector(`[data-id="${key}"]`);
  const state = { rows: [], supAuto: true };
  function raceData() {
    const r = get("race").value;
    if (r === "Terran") {
      return { U: T, race: r };
    }
    if (r === "Protoss") {
      return { U: P, race: r };
    }
    return { U: Z, race: r };
  }

  function unitByName(name) {
    return T[name] || P[name] || Z[name] || null;
  }

  // Units that can't hit ground at all (or are non-damage support)
  const AIR_ONLY = new Set([
    "Phoenix",
    "Corruptor",
    "Observer",
    "Overseer",
    "Medivac",
    "Raven",
  ]);

  // Bonus keys/labels used in DPS breakdowns

  const BONUS_KEY_MAP = {
    armored: "armored",
    armoured: "armored",
    light: "light",
    biological: "bio",
    bio: "bio",
    mechanical: "mech",
    mech: "mech",
    massive: "massive",
    psionic: "psionic",
    structure: "structure",
    building: "structure",
    air: "air",
    ground: "ground",
    clumped: "clumps",
    splash: "clumps",
    all: "all",
  };
  function normBonusKey(k) {
    if (!k) return null;
    const key = String(k).toLowerCase().trim();
    return BONUS_KEY_MAP[key] || key;
  }
  const PREF_TO_LABEL = {
    ground: "DPS vs Ground",
    air: "DPS vs Air",
    light: "DPS vs Light",
    armored: "DPS vs Armored",
    bio: "DPS vs Biological",
    mech: "DPS vs Mechanical",
    massive: "DPS vs Massive",
    psionic: "DPS vs Psionic",
    structure: "DPS vs Structures",
    clumps: "DPS vs Clumped",
    all: "General DPS",
  };

  function canUnitHitAir(name) {
    const u = unitByName(name);
    return !!u && (u.tags || []).includes("aa"); // we tagged AA in normalizeAll()
  }
  function canUnitHitGround(name) {
    const u = unitByName(name);
    if (!u) return false;
    return !AIR_ONLY.has(name);
  }

  function renderQualities(summary, tgt) {
    const totalUnits = tgt.reduce((s, x) => s + x.count, 0);
    const totalSup = tgt.reduce((s, x) => s + x.sup * x.count, 0);

    // Per-supply headline metrics
    const dpsPerSup = totalSup
      ? tgt.reduce((s, x) => s + x.dps * x.count, 0) / totalSup
      : 0;
    const hpPerSup = totalSup
      ? tgt.reduce((s, x) => s + x.hp * x.count, 0) / totalSup
      : 0;
    const avgCostPerSup = totalSup
      ? tgt.reduce((s, x) => s + x.costW * x.count, 0) / totalSup
      : 0;

    function clamp01(x) {
      return Math.max(0, Math.min(1, x));
    }
    function setQ(el, val) {
      el.style.width = (val * 100).toFixed(0) + "%";
    }
    function setQV(el, val) {
      el.textContent = Math.round(val * 100);
    }

    // Utility & Micro
    const utilFlags = [
      "det",
      "heals",
      "clk",
      "bur",
      "aa",
      "recall",
      "scans",
      "creep",
    ];
    const util =
      utilFlags.reduce((s, k) => s + (summary.flags[k] ? 1 : 0), 0) /
      utilFlags.length;
    const totalUnitsForMicro = totalUnits || 1;
    const avgMicro =
      tgt.reduce((s, x) => s + (x.micro || 3) * x.count, 0) /
      totalUnitsForMicro;
    const diff = clamp01((avgMicro - 1) / 4);

    // Vulnerability (unchanged)
    const share = (function () {
      const u = totalUnits || 1;
      let light = 0,
        armored = 0,
        air = 0,
        ground = 0,
        bio = 0,
        mech = 0,
        aa = 0;
      tgt.forEach((x) => {
        if (x.attrs.includes("light")) light += x.count;
        if (x.attrs.includes("armored")) armored += x.count;
        if (x.attrs.includes("air")) air += x.count;
        if (x.attrs.includes("ground")) ground += x.count;
        if (x.attrs.includes("bio")) bio += x.count;
        if (x.attrs.includes("mech")) mech += x.count;
        if (x.aa) aa += x.count;
      });
      return {
        light: light / u,
        armored: armored / u,
        air: air / u,
        ground: ground / u,
        bio: bio / u,
        mech: mech / u,
        groundOnly: ground / u,
        lowAA: 1 - aa / u,
      };
    })();
    const vuln = clamp01(
      0.5 * share.light + 0.2 * share.groundOnly + 0.3 * share.lowAA
    );

    // Caps (global per-supply caps computed once)
    const caps = GLOBAL_CAPS || {
      dpsPerSup: 1,
      hpPerSup: 1,
      costPerSup: 1,
    };

    // Bars in the header card
    const g = (k) => root.querySelector(`[data-id="${k}"]`);
    setQ(g("qTank"), clamp01(hpPerSup / Math.max(1e-6, caps.hpPerSup)));
    setQV(g("qTankV"), clamp01(hpPerSup / Math.max(1e-6, caps.hpPerSup)));
    setQ(g("qDmg"), clamp01(dpsPerSup / Math.max(1e-6, caps.dpsPerSup)));
    setQV(g("qDmgV"), clamp01(dpsPerSup / Math.max(1e-6, caps.dpsPerSup)));
    setQ(g("qUtil"), util);
    setQV(g("qUtilV"), util);
    setQ(g("qDiff"), diff);
    setQV(g("qDiffV"), diff);
    setQ(g("qVuln"), vuln);
    setQV(g("qVulnV"), vuln);
    setQ(g("qCost"), clamp01(avgCostPerSup / Math.max(1e-6, caps.costPerSup)));
    setQV(
      g("qCostV"),
      clamp01(avgCostPerSup / Math.max(1e-6, caps.costPerSup))
    );

    // Tooltips with real numbers
    g("qDmg").parentElement.title = `DPS per supply: ${dpsPerSup.toFixed(
      2
    )} (cap: ${caps.dpsPerSup.toFixed(2)})`;
    g("qTank").parentElement.title = `HP per supply: ${hpPerSup.toFixed(
      1
    )} (cap: ${caps.hpPerSup.toFixed(1)})`;
    g(
      "qCost"
    ).parentElement.title = `Avg cost per supply: ${avgCostPerSup.toFixed(
      2
    )} (cap: ${caps.costPerSup.toFixed(2)})`;

    // --------- PER-SUPPLY DAMAGE TYPE BREAKDOWN (domains + bonuses) ----------
    // Build sums as DPS-per-supply
    // Build sums as DPS-per-supply
    const typeSumsPS = new Map();

    // "all" == average of present domains per unit, then sum per-supply
    let allPS = 0;
    tgt.forEach((x) => {
      const cnt = Number(x.count) || 0;
      if (!cnt) return;
      const g = Number(x.dpsG) || 0;
      const a = Number(x.dpsA) || 0;
      const n = (g > 0 ? 1 : 0) + (a > 0 ? 1 : 0);
      const avg = n ? (g + a) / n : 0;
      allPS += (avg * cnt) / totalSup;
    });
    typeSumsPS.set("all", allPS);

    // ✅ add domain bars
    let groundPS = 0,
      airPS = 0;
    tgt.forEach((x) => {
      const cnt = Number(x.count) || 0;
      groundPS += ((Number(x.dpsG) || 0) * cnt) / totalSup;
      airPS += ((Number(x.dpsA) || 0) * cnt) / totalSup;
    });
    typeSumsPS.set("ground", groundPS);
    typeSumsPS.set("air", airPS);

    // Always include domains
    if (totalSup > 0) {
      const bonusTypes = [
        "light",
        "armored",
        "bio",
        "mech",
        "massive",
        "shields",
        "structure",
      ];

      // compute baseline once
      let allPS = 0;
      tgt.forEach((x) => {
        const cnt = Number(x.count) || 0;
        const g = Number(x.dpsG) || 0,
          a = Number(x.dpsA) || 0;
        const n = (g > 0 ? 1 : 0) + (a > 0 ? 1 : 0);
        const avg = n ? (g + a) / n : 0;
        allPS += (avg * cnt) / totalSup;
      });
      typeSumsPS.set("all", allPS);

      // bonus deltas per tag, then add to the same baseline
      const bonusDelta = Object.fromEntries(bonusTypes.map((t) => [t, 0]));
      tgt.forEach((x) => {
        const cnt = Number(x.count) || 0;
        if (!cnt) return;
        const bd = x.bonusDps || {};
        bonusTypes.forEach((ty) => {
          const b = Number(bd[ty] || 0);
          if (b > 0) bonusDelta[ty] += (b * cnt) / totalSup;
        });
      });
      bonusTypes.forEach((ty) => {
        const totalVsTy = allPS + (bonusDelta[ty] || 0);
        if (totalVsTy > allPS + 1e-6) typeSumsPS.set(ty, totalVsTy);
      });
    }

    // Sort and render
    const PREF_TO_LABEL = {
      ground: "DPS vs Ground",
      air: "DPS vs Air",
      light: "DPS vs Light",
      armored: "DPS vs Armored",
      bio: "DPS vs Biological",
      mech: "DPS vs Mechanical",
      massive: "DPS vs Massive",
      psionic: "DPS vs Psionic",
      structure: "DPS vs Structures",
      clumps: "DPS vs Clumped",
      all: "General DPS",
    };

    const EPS = 1e-6;
    const allVal = typeSumsPS.get("all") || 0;

    const entries = Array.from(typeSumsPS.entries())
      .filter(([k, v]) => v > 0)
      .filter(
        ([k, v]) => k === "ground" || k === "air" || Math.abs(v - allVal) > EPS
      ) // ✅ hide duplicates of "all"
      .sort((a, b) => b[1] - a[1]);

    const host = get("dpsBreakTypes") || get("dpsBreak");
    if (host) {
      if (!entries.length) {
        host.innerHTML =
          "<div class='small muted'>No damage types present.</div>";
      } else {
        host.innerHTML = entries
          .map(([k, vPS]) => {
            const label =
              PREF_TO_LABEL[k] || "DPS vs " + k[0].toUpperCase() + k.slice(1);
            const pct = clamp01(vPS / Math.max(1e-6, caps.dpsPerSup)) * 100; // normalize to DPS-per-supply cap
            return `
          <div class="qrow">
            <div class="qname">${label}</div>
            <div class="qbar"><i data-type="${k}" style="width:${pct.toFixed(
              0
            )}%"></i></div>
            <div class="qval" title="DPS per supply">${vPS.toFixed(2)}</div>
          </div>
        `;
          })
          .join("");
      }
    }
  }

  function refreshUnitOptions() {
    const sel = get("unitSelect");
    if (!sel) return;
    const { U } = raceData();
    sel.innerHTML = "";
    Object.keys(U)
      .sort()
      .forEach((name) => {
        const o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        sel.appendChild(o);
      });
  }

  function renderUnitEditor() {
    const wrap = get("unitEditorWrap");
    if (!wrap) return;
    const { U, race } = raceData();

    // Build table
    const rows = Object.keys(U)

      .sort()
      .map((name) => {
        const u = U[name];
        // Pref can be string or array; show as comma-separated
        const prefStr = Array.isArray(u.pref)
          ? u.pref.join(", ")
          : u.pref ?? "";
        let dpsG = Number.isFinite(u.dpsG) ? u.dpsG : null;
        let dpsA = Number.isFinite(u.dpsA) ? u.dpsA : null;

        // If neither per-domain value exists, derive from total DPS + unit domains
        if (dpsG === null && dpsA === null) {
          const total = Number(u.dps) || 0;
          const hitsAir = canUnitHitAir(name);
          const hitsGround = canUnitHitGround(name);
          dpsG = hitsGround ? total : 0;
          dpsA = hitsAir ? total : 0;
        }

        // For the read-only "DPS" column, prefer the real total if present
        const dpsTot =
          Number.isFinite(u.dps) && u.dps > 0 ? u.dps : dpsG + dpsA;

        return `
            <tr data-unit="${name}">
              <td>${name}</td>
              <td><input type="number" step="0.5" value="${
                u.sup || 0
              }" data-f="sup"></td>
              <td><input type="number" step="1"   value="${
                u.hp || 0
              }"  data-f="hp"></td>
              <td><input type="number" step="1"   value="${
                u.sh || 0
              }"  data-f="sh"></td>
              <td><input type="number" step="1"   value="${
                u.armor || 0
              }" data-f="armor"></td>
              <td><input type="number" step="0.1" value="${
                u.t || 0
              }"   data-f="t"></td>
              <td><input type="number" step="1"   value="${
                u.m || 0
              }"   data-f="m"></td>
              <td><input type="number" step="1"   value="${
                u.g || 0
              }"   data-f="g"></td>

              <td class="right"><input type="number" step="0.1" value="${(
                dpsG || 0
              ).toFixed(1)}" data-f="dpsG" style="width:70px"></td>
              <td class="right"><input type="number" step="0.1" value="${(
                dpsA || 0
              ).toFixed(1)}" data-f="dpsA" style="width:70px"></td>

              <td class="right"><span data-f="dpsTotal">${(dpsTot || 0).toFixed(
                1
              )}</span></td>
              <td><input type="number" step="0.1" value="${
                u.micro ?? 3
              }" data-f="micro" style="width:70px"></td>
            </tr>
          `;
      })
      .join("");

    wrap.innerHTML = `
        <div class="small muted" style="margin-bottom:6px">
          Editing ${race} data. Changes apply instantly.
        </div>
        <table>
          <thead>
            <tr>
              <th>Unit</th><th>Sup</th><th>HP</th><th>Sh</th><th>Armor</th>
              <th>Build s</th><th>Minerals</th><th>Gas</th>
              <th class="right" title="Damage vs ground targets">DPS vs Ground</th>
              <th class="right" title="Damage vs air targets">DPS vs Air</th>
              <th class="right" title="Total DPS (not doubled)">DPS</th>
              <th>Micro</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;

    wrap.querySelectorAll("tbody input").forEach((inp) => {
      inp.addEventListener("input", () => {
        const tr = inp.closest("tr");
        const name = tr.getAttribute("data-unit");
        const f = inp.getAttribute("data-f");
        let val = inp.value;

        if (f === "pref") {
          // store as array trimmed, lowercased
          const arr = String(val)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          U[name][f] = arr; // array in memory; we read flexibly later
        } else {
          U[name][f] = Number(val) || 0;
        }

        // Keep total DPS cell in sync if G/A edited
        if (f === "dpsG" || f === "dpsA") {
          const g = Number(tr.querySelector('input[data-f="dpsG"]').value) || 0;
          const a = Number(tr.querySelector('input[data-f="dpsA"]').value) || 0;
          const total = g + a;
          tr.querySelector('[data-f="dpsTotal"]').textContent =
            total.toFixed(1);
          U[name].dps = total; // derived total
        }

        GLOBAL_CAPS = computeCapsOnce();
        computeBarMaxSec();
        renderRows();
        compute();
        saveToUrl();
      });
    });
  }

  function clampOrbitals() {
    const bases = Math.max(0, Number(get("bases").value) || 0);
    const orbEl = get("orbitals");
    const wrap = root.querySelector('[data-id="orbitalsWrap"]');
    wrap.style.display = "";
    const v = Math.max(0, Math.min(bases, Number(orbEl.value) || 0));
    if (Number(orbEl.value) !== v) orbEl.value = v;
  }

  function unitLookup(name) {
    if (T[name]) return { u: T[name], race: "Terran" };
    if (P[name]) return { u: P[name], race: "Protoss" };
    if (Z[name]) return { u: Z[name], race: "Zerg" };
    return null;
  }
  function currentRace() {
    return get("race").value;
  }

  const tableWrap = root.querySelector("[data-id='unitTableWrap']"),
    tbody = root.querySelector("[data-id='tbody']");

  function showTable() {
    tableWrap.style.display = "block";
  }
  function removeRow(i) {
    state.rows.splice(i, 1);
    renderRows();
  }
  function updateRowCount(i, v) {
    state.rows[i].count = Math.max(0, Number(v) || 0);
    if (state.rows[i].count === 0) {
      state.rows.splice(i, 1);
    }
    renderRows();
  }

  function spendAndDps(u, row, unitRace) {
    const streams = Math.max(0, Number(row.count) || 0);
    const uptimeF = Math.max(0, Math.min(100, Number(row.uptime ?? 100))) / 100;
    const effStreams = streams * uptimeF;

    // const eff = Math.max(0.1, Number(get("eff").value)||0.6);

    const cyclesPerMin = (u.t > 0 ? 60 / u.t : 0) * effStreams;
    const m = u.m * cyclesPerMin;
    const g = u.g * cyclesPerMin;

    const base = baseDps(u),
      peak = maxDps(u);
    const dpsPerUnit = base;
    const dpsPerUnitMax = peak;

    const dps = dpsPerUnit * effStreams;
    const dpsMax = dpsPerUnitMax * effStreams;

    const armor = u.armor;
    const hpUnit = u.hp + u.sh;

    return { m, g, dps, dpsMax, armor, hpUnit, dpsPerUnit, effStreams };
  }

  const supElInit = get("actualSupply");
  if (supElInit) {
    supElInit.addEventListener("input", () => {
      state.supAuto = false;
      compute();
      saveToUrl();
    });
  }

  function recalcSupplyCap() {
    const bases = Math.max(0, Number(get("bases").value) || 0);
    const wpb = Math.max(0, Number(get("workersPerBase").value) || 0);
    const workersTotal = bases * wpb;
    const cap = Math.max(0, 200 - workersTotal);
    const supEl = get("actualSupply");
    if (supEl) {
      const prevCap = Number(supEl.getAttribute("data-prev-cap")) || 0;
      const curVal = Number(supEl.value) || 0;

      supEl.max = cap;

      if (state.supAuto || curVal === prevCap || curVal > cap) {
        supEl.value = cap;
      }

      supEl.setAttribute("data-prev-cap", String(cap));
    }
  }

  function moveRow(from, to) {
    if (
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= state.rows.length ||
      to >= state.rows.length
    )
      return;
    const [it] = state.rows.splice(from, 1);
    state.rows.splice(to, 0, it);
    renderRows();
    compute();
    saveToUrl();
  }

  function renderRows() {
    const { U } = raceData();
    tbody.innerHTML = "";
    let sumM = 0,
      sumG = 0,
      sumStreams = 0;
    let sumUptime = 0,
      sumCap = 0;

    state.rows.forEach((r, i) => {
      const info = unitLookup(r.name);
      if (!info) return;
      const { u, race } = info;
      const spend = spendAndDps(u, r, race);
      sumM += spend.m;
      sumG += spend.g;
      sumStreams += Number(r.count) || 0;
      sumUptime += r.uptime ?? 100;
      if (r.cap != null) sumCap += Number(r.cap) || 0;

      const tr = document.createElement("tr");
      tr.className =
        race === "Terran"
          ? "rTerran"
          : race === "Protoss"
          ? "rProtoss"
          : "rZerg";
      tr.innerHTML = `
                    <td class="left" style="width:10%">
                      <button class="btn-ghost" type="button" data-act="remove" aria-label="Remove ${
                        r.name
                      }">✕</button>
                    </td>
                    <td style="width:22%">
                      <select data-act="unit" aria-label="Unit for row ${i}"></select>
                    </td>
                    <td class="right" style="width:20%">
                      <div class="row" style="justify-content:flex-end;gap:6px">
                        <button class="btn-ghost" type="button" data-act="dec" aria-label="Decrease streams">−</button>
                        <input data-act="count" type="number" min="0" value="${
                          Number(r.count) || 0
                        }" style="width:70px;border-radius:6px;padding:4px 6px" aria-label="Streams for ${
        r.name
      }">
                        <button type="button" data-act="inc" aria-label="Increase streams">＋</button>
                      </div>
                    </td>
                    <td class="right" style="width:14%">
                      <input data-act="uptime" type="number" min="0" max="100" value="${
                        r.uptime ?? 100
                      }" style="width:70px;border-radius:6px;padding:4px 6px" aria-label="Uptime % for ${
        r.name
      }">
                    </td>
                    <td class="right" style="width:14%">
                      <input data-act="cap" type="number" min="0" value="${
                        r.cap ?? ""
                      }" placeholder="∞" style="width:70px;border-radius:6px;padding:4px 6px" aria-label="Produce X for ${
        r.name
      }">
                    </td>
                    <td class="right">${spend.m.toFixed(1)}</td>
                    <td class="right">${spend.g.toFixed(1)}</td>
                  `;

      populateUnitSelect(tr.querySelector('select[data-act="unit"]'), r.name);
      tr.querySelector('[data-act="remove"]').addEventListener("click", () =>
        removeRow(i)
      );
      tr.querySelector('[data-act="dec"]').addEventListener("click", () =>
        updateRowCount(i, (r.count || 0) - 1)
      );
      tr.querySelector('[data-act="inc"]').addEventListener("click", () =>
        updateRowCount(i, (r.count || 0) + 1)
      );
      tr.querySelector('[data-act="count"]').addEventListener("input", (e) =>
        updateRowCount(i, Number(e.target.value) || 0)
      );
      tr.querySelector('[data-act="uptime"]').addEventListener("input", (e) => {
        state.rows[i].uptime = Math.max(
          0,
          Math.min(100, Number(e.target.value) || 0)
        );
        compute();
        saveToUrl();
      });
      tr.querySelector('[data-act="uptime"]').addEventListener("change", () => {
        renderRows();
        compute();
        saveToUrl();
      });
      tr.querySelector('[data-act="cap"]').addEventListener("input", (e) => {
        const v = e.target.value.trim();
        state.rows[i].cap = v === "" ? null : Math.max(0, Number(v) || 0);
        compute();
        saveToUrl();
      });
      tr.querySelector('[data-act="cap"]').addEventListener("change", () => {
        renderRows();
        compute();
        saveToUrl();
      });

      tr.draggable = true;
      tr.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", String(i));
        tr.classList.add("dragging");
      });
      tr.addEventListener("dragend", () => tr.classList.remove("dragging"));
      tr.addEventListener("dragover", (e) => {
        e.preventDefault();
        tr.classList.add("dragover");
      });
      tr.addEventListener("dragleave", () => tr.classList.remove("dragover"));
      tr.addEventListener("drop", (e) => {
        e.preventDefault();
        tr.classList.remove("dragover");
        const from = Number(e.dataTransfer.getData("text/plain"));
        const to = i;
        moveRow(from, to);
      });
      tbody.appendChild(tr);
    });

    get("uStreams").textContent = sumStreams;
    get("uUptimeAvg").textContent =
      (state.rows.length ? Math.round(sumUptime / state.rows.length) : 0) + "%";
    get("uCapCount").textContent = sumCap > 0 ? sumCap : "—";
    get("uMin").textContent = Math.round(sumM);
    get("uGas").textContent = Math.round(sumG);

    const anyRows = state.rows.length > 0;
    if (anyRows) showTable();
    compute();
    saveToUrl();
    equalizeDetailHeights();
  }

  /* ---------- Income & Bars ---------- */
  function satMineralsPerBase() {
    const W = Math.max(0, Number(get("workersPerBase").value) || 0);
    const w12 = Math.min(16, W);
    const w3 = Math.max(0, Math.min(8, W - 16));
    return w12 * 40 + w3 * 20;
  }
  function satGasPerBase() {
    return (
      Number(get("geysersPerBase").value) * Number(get("gasPerGeyserMin").value)
    );
  }
  function muleIncomePerMinute() {
    return (
      Number(get("orbitals").value) *
      (60 / Number(get("secTo50").value)) *
      Number(get("muleYield").value)
    );
  }

  /* ---------- Qualities & composition ---------- */
  const COUNTERS = {
    light: ["Hellion", "Hellbat", "Colossus", "Adept", "Baneling"],
    armored: ["Marauder", "Immortal", "Cyclone", "Void Ray"],
    air: ["Viking", "Corruptor", "Phoenix", "Stalker"],
    bio: ["Archon", "Hellbat", "Baneling"],
    mech: ["Immortal", "Tempest", "Marauder"],
    ground: ["Liberator", "Colossus", "Lurker"],
  };
  function compShares(tgt) {
    const total = tgt.reduce((s, x) => s + x.count, 0) || 1;
    let light = 0,
      armored = 0,
      air = 0,
      ground = 0,
      bio = 0,
      mech = 0,
      aa = 0;
    tgt.forEach((x) => {
      if (x.attrs.includes("light")) light += x.count;
      if (x.attrs.includes("armored")) armored += x.count;
      if (x.attrs.includes("air")) air += x.count;
      if (x.attrs.includes("ground")) ground += x.count;
      if (x.attrs.includes("bio")) bio += x.count;
      if (x.attrs.includes("mech")) mech += x.count;
      if (x.aa) aa += x.count;
    });
    const groundOnly = ground / total,
      lowAA = 1 - aa / total;
    return {
      light: light / total,
      armored: armored / total,
      air: air / total,
      ground: ground / total,
      bio: bio / total,
      mech: mech / total,
      groundOnly,
      lowAA,
    };
  }
  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }
  function setQ(el, val) {
    el.style.width = (val * 100).toFixed(0) + "%";
  }
  function setQV(el, val) {
    el.textContent = Math.round(val * 100);
  }

  function compute() {
    recalcSupplyCap();
    const bases = Number(get("bases").value) || 0;
    const mIncome = bases * satMineralsPerBase() + muleIncomePerMinute();
    const gIncome = bases * satGasPerBase();

    const mArmy = Number(get("uMin").textContent) || 0;
    const gArmy = Number(get("uGas").textContent) || 0;

    const techM = Math.max(0, Number(get("resM")?.value) || 0);
    const techG = Math.max(0, Number(get("resG")?.value) || 0);

    const mTotalSpend = mArmy + techM;
    const gTotalSpend = gArmy + techG;

    get("numMinInc").textContent = Math.round(mIncome) + "m";
    get("numMinSp").textContent = Math.round(mArmy) + "m";
    get("numMinTech").textContent = Math.round(techM) + "m";
    get("numGasInc").textContent = Math.round(gIncome) + "g";
    get("numGasSp").textContent = Math.round(gArmy) + "g";
    get("numGasTech").textContent = Math.round(techG) + "g";

    state._bars = {
      m: {
        income: mIncome,
        spend: mTotalSpend,
        incEl: get("barMinInc"),
        spEl: get("barMinSp"),
        overEl: get("barMinOver"),
      },
      g: {
        income: gIncome,
        spend: gTotalSpend,
        incEl: get("barGasInc"),
        spEl: get("barGasSp"),
        overEl: get("barGasOver"),
      },
    };
    if (window._updateBars) requestAnimationFrame(window._updateBars);
    if (window._updateBars) window._updateBars();

    const mAvail = Math.max(0, mIncome - techM);
    const gAvail = Math.max(0, gIncome - techG);
    const scale =
      mAvail > 0 || gAvail > 0
        ? Math.min(mAvail / (mArmy || 1), gAvail / (gArmy || 1), 1)
        : 0;

    computeActualArmy(scale);
  }

  function computeActualArmy(scale) {
    const S = Number(get("actualSupply").value) || 0;

    const items = state.rows
      .map((r) => {
        const info = unitLookup(r.name);
        if (!info) return null;
        const { u, race } = info;
        const uptimeF =
          Math.max(0, Math.min(100, Number(r.uptime ?? 100))) / 100;
        const perMin =
          (u.t > 0 ? 60 / u.t : 0) * (Number(r.count) || 0) * uptimeF * scale;
        // const eff = Math.max(0.1, Number(get("eff").value)||0.6);
        const base = baseDps(u),
          peak = maxDps(u);
        const dps = base;
        const dpsMax = peak;
        const armor = u.armor;
        const hp = u.hp + u.sh;
        const costW = u.m + u.g;
        const dom = domainDpsForUnit(u, r.name);
        // Normalize pref to array of normalized keys
        const prefArr = Array.isArray(u.pref)
          ? u.pref
          : typeof u.pref === "string"
          ? u.pref.split(",")
          : [];
        const prefNorm = prefArr.map(normBonusKey).filter(Boolean);

        const bonusDps = normalizeBonusDpsMap(u.bonusDps || u.bonus || {});

        return {
          name: r.name,
          rate: perMin,
          sup: u.sup,
          hp,
          dps: base,
          dpsMax: peak,
          dpsG: dom.g,
          dpsA: dom.a,
          armor,
          costW,
          flags: u.flags,
          aa: u.tags.includes("aa"),
          heals: u.flags.heals,
          micro: u.micro,
          attrs: u.attrs,
          pref: prefNorm,
          cap: r.cap ?? null,
          race,
          bonusDps,
        };
      })
      .filter(Boolean);

    // --- Workers ---
    const raceNow = get("race").value;
    const basesNow = Math.max(0, Number(get("bases").value) || 0);
    const wpbNow = Math.max(0, Number(get("workersPerBase").value) || 0);
    const workerCount = basesNow * wpbNow;
    const workerLabel =
      raceNow === "Terran" ? "SCV" : raceNow === "Protoss" ? "Probe" : "Drone";
    const workersEl = get("workersLine");
    if (workersEl) {
      workersEl.textContent = `${workerCount.toLocaleString()} ${workerLabel}${
        workerCount === 1 ? "" : "s"
      }`;
    }

    // Phase 1: pre-allocate caps
    let remainingS = S;
    const tgt = [];
    items.forEach((x) => {
      if (x.cap == null) return;
      const take = Math.min(x.cap, Math.floor(remainingS / Math.max(1, x.sup)));
      if (take > 0) {
        tgt.push({ ...x, count: take });
        remainingS -= take * x.sup;
      }
    });

    // Phase 2: distribute remaining among uncapped by rate
    const flex = items.filter((x) => x.cap == null);
    const totalRate = flex.reduce((s, x) => s + x.rate, 0);
    if (remainingS > 0 && totalRate > 0) {
      const provisional = flex.map((x) => {
        const idealS = remainingS * (x.rate / totalRate);
        const cnt = Math.max(0, Math.floor(idealS / x.sup));
        const rem = idealS / x.sup - cnt;
        return { ...x, count: cnt, rem };
      });
      let usedS = provisional.reduce((s, x) => s + x.count * x.sup, 0);
      const order = provisional.slice().sort((a, b) => b.rem - a.rem);
      while (true) {
        const can = order.find((it) => usedS + it.sup <= remainingS);
        if (!can) break;
        can.count += 1;
        usedS += can.sup;
      }
      tgt.push(...provisional);
    }

    // ===== Time to build (discrete cycles) =====
    function streamsFor(name) {
      const row = state.rows.find((r) => r.name === name);
      return Math.max(0, row ? Number(row.count) || 0 : 0);
    }
    function timeForUnitSec(name, count, buildSec) {
      const s = streamsFor(name);
      if (count <= 0 || s <= 0) return 0;
      const effStreams = Math.max(1, Math.min(s, count));
      return Math.ceil(count / effStreams) * buildSec;
    }

    function domainDpsForUnit(u, name) {
      const total = baseDps(u);
      const gExplicit = Number(u.dpsG);
      const aExplicit = Number(u.dpsA);
      const hasExplicit =
        (Number.isFinite(gExplicit) && gExplicit > 0) ||
        (Number.isFinite(aExplicit) && aExplicit > 0);

      if (hasExplicit) {
        return {
          g: Math.max(0, gExplicit || 0),
          a: Math.max(0, aExplicit || 0),
        };
      }

      // Fallback when only total dps is provided: assign by target domain ability
      const hasAir = canUnitHitAir(name);
      const hasG = canUnitHitGround(name);
      if (hasAir && !hasG) return { a: total, g: 0 };
      if (!hasAir && hasG) return { a: 0, g: total };
      if (hasAir && hasG) return { a: total, g: total }; // count fully in both bars
      return { a: 0, g: 0 };
    }

    function normalizeBonusDpsMap(bd) {
      const out = {};
      if (!bd) return out;
      Object.entries(bd).forEach(([k, v]) => {
        let key = normBonusKey(k); // armoured -> armored, building -> structure, etc.
        if (!key) return;
        if (key === "shield") key = "shields";
        out[key] = Number(v) || 0;
      });
      return out;
    }

    function normBonusKey(k) {
      if (!k) return null;
      const key = String(k).toLowerCase().trim();
      return BONUS_KEY_MAP[key] || key;
    }
    const PREF_TO_LABEL = {
      ground: "DPS vs Ground",
      air: "DPS vs Air",
      light: "DPS vs Light",
      armored: "DPS vs Armored",
      bio: "DPS vs Biological",
      mech: "DPS vs Mechanical",
      massive: "DPS vs Massive",
      psionic: "DPS vs Psionic",
      structure: "DPS vs Structures",
      clumps: "DPS vs Clumped",
      all: "General DPS",
    };

    let _timeBuildSec = 0;
    tgt.forEach((x) => {
      const Ux = T[x.name] || P[x.name] || Z[x.name];
      if (!Ux) return;
      const unitTime = timeForUnitSec(x.name, x.count, Number(Ux.t) || 0);
      if (unitTime > _timeBuildSec) _timeBuildSec = unitTime;
    });
    const tEl = get("timeBuild"),
      bEl = get("timeBar");
    if (_timeBuildSec > 0 && Number.isFinite(_timeBuildSec)) {
      tEl.textContent = `${_timeBuildSec.toFixed(1)} s`;
      const frac = Math.max(0, Math.min(1, _timeBuildSec / BAR_MAX_SEC));
      bEl.style.width = (frac * 100).toFixed(0) + "%";
    } else {
      tEl.textContent = "—";
      bEl.style.width = "0%";
    }

    // --- Prominent Final Composition list ---
    const compBigEl = get("finalComp");
    if (compBigEl) {
      const compHtml = tgt
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count * b.sup - a.count * a.sup) // biggest supply share first
        .map((x) => `<span class="u r${x.race}">${x.name} × ${x.count}</span>`)
        .join("");
      compBigEl.innerHTML = compHtml || "—";
    }

    // --- Total army cost (minerals + gas) ---
    let totalM = 0,
      totalG = 0;
    tgt.forEach((x) => {
      const Ux = T[x.name] || P[x.name] || Z[x.name];
      if (!Ux) return;
      totalM += (Number(Ux.m) || 0) * x.count;
      totalG += (Number(Ux.g) || 0) * x.count;
    });
    const totalCostEl = get("totalCost");
    if (totalCostEl) {
      totalCostEl.textContent = `${Math.round(
        totalM
      ).toLocaleString()}m / ${Math.round(totalG).toLocaleString()}g`;
    }

    // ===== Summaries =====
    const usedS = tgt.reduce((s, x) => s + x.count * x.sup, 0);
    const totalUnits = tgt.reduce((s, x) => s + x.count, 0);
    const hp = tgt.reduce((s, x) => s + x.hp * x.count, 0);
    const dps = tgt.reduce((s, x) => s + x.dps * x.count, 0);
    const dpsMax = tgt.reduce((s, x) => s + x.dpsMax * x.count, 0);
    const armorAvg = totalUnits
      ? tgt.reduce((s, x) => s + x.armor * x.count, 0) / totalUnits
      : 0;
    const det = tgt.some((x) => x.flags.detector),
      bur = tgt.some((x) => x.flags.burrow),
      clk = tgt.some((x) => x.flags.cloak),
      aa = tgt.some((x) => x.aa);
    const heals = tgt.some((x) => x.flags.heals);
    const compStr = tgt
      .filter((x) => x.count > 0)
      .map((x) => `${x.name}: ${x.count}`)
      .join(" • ");

    get("analysisWrap").style.display = tgt.length ? "" : "none";
    get("actualSummary").innerHTML = `
            ${totalUnits} units | ${dps.toFixed(1)} Avg DPS | ${dpsMax.toFixed(
      1
    )} Peak DPS
          `;
    get(
      "actualTotals"
    ).textContent = `HP ${hp.toLocaleString()} | Armor ${armorAvg.toFixed(2)}`;
    // setAFlags(
    //   root,
    //   det,
    //   bur,
    //   clk,
    //   aa,
    //   get("race").value === "Protoss",
    //   get("race").value === "Terran" && Number(get("orbitals").value) > 0,
    //   get("race").value === "Zerg",
    //   heals
    // );

    const costW = tgt.reduce((s, x) => s + x.costW * x.count, 0);
    renderQualities(
      {
        hp: hp,
        sup: usedS,
        dps: dps,
        armor: armorAvg,
        flags: {
          det,
          bur,
          clk,
          aa,
          recall: get("race").value === "Protoss",
          scans: get("race").value === "Terran",
          creep: get("race").value === "Zerg",
          heals,
        },
        costW,
      },
      tgt
    );

    // Composition sidebars
    const shares = (function () {
      const total = tgt.reduce((s, x) => s + x.count, 0) || 1;
      let light = 0,
        armored = 0,
        air = 0,
        ground = 0,
        bio = 0,
        mech = 0,
        aa = 0;
      tgt.forEach((x) => {
        if (x.attrs.includes("light")) light += x.count;
        if (x.attrs.includes("armored")) armored += x.count;
        if (x.attrs.includes("air")) air += x.count;
        if (x.attrs.includes("ground")) ground += x.count;
        if (x.attrs.includes("bio")) bio += x.count;
        if (x.attrs.includes("mech")) mech += x.count;
        if (x.aa) aa += x.count;
      });
      const groundOnly = ground / total,
        lowAA = 1 - aa / total;
      return {
        light: light / total,
        armored: armored / total,
        air: air / total,
        ground: ground / total,
        bio: bio / total,
        mech: mech / total,
        groundOnly,
        lowAA,
      };
    })();
    const g = get;
    g("compBreak").textContent =
      `Light ${Math.round(shares.light * 100)}% • Armored ${Math.round(
        shares.armored * 100
      )}% • ` +
      `Ground ${Math.round(shares.ground * 100)}% • Air ${Math.round(
        shares.air * 100
      )}% • ` +
      `Bio ${Math.round(shares.bio * 100)}% • Mech ${Math.round(
        shares.mech * 100
      )}%`;

    const weakCats = [];
    if (shares.light > 0.35) weakCats.push("light");
    if (shares.armored > 0.35) weakCats.push("armored");
    if (shares.air > 0.25) weakCats.push("air");
    if (shares.bio > 0.35) weakCats.push("bio");
    if (shares.mech > 0.35) weakCats.push("mech");
    if (shares.ground > 0.75) weakCats.push("ground");

    let counterList = [...new Set(weakCats.flatMap((c) => COUNTERS[c] || []))];

    // Domain-aware filtering so we don't suggest ground-only into air comps, etc.
    const airHeavy = shares.air >= 0.4;
    const groundHeavy = shares.ground >= 0.6;

    if (airHeavy && !groundHeavy) {
      counterList = counterList.filter(canUnitHitAir);
    } else if (groundHeavy && !airHeavy) {
      counterList = counterList.filter(canUnitHitGround);
    } else {
      // Mixed comps: keep units that can threaten at least one present domain
      counterList = counterList.filter(
        (n) =>
          (shares.air > 0 && canUnitHitAir(n)) ||
          (shares.ground > 0 && canUnitHitGround(n))
      );
    }

    g("compCounters").textContent = counterList.length
      ? counterList.join(" • ")
      : "No obvious hard counters (composition-wise).";
  }

  /* Single attachment point for all inputs on this side */
  root.querySelectorAll("input,select").forEach((el) => {
    el.addEventListener("input", () => {
      if (el === get("race")) {
        clampOrbitals();
        renderRows();
        compute();
        renderUnitEditor();
        saveToUrl();
        requestAnimationFrame(equalizeDetailHeights); // keeps heights aligned
      } else if (el === get("bases") || el === get("workersPerBase")) {
        clampOrbitals();
        recalcSupplyCap();
        compute();
        saveToUrl();
      } else if (el === get("orbitals")) {
        clampOrbitals();
        compute();
        saveToUrl();
      } else {
        compute();
        saveToUrl();
      }
    });
  });

  /* Add-row button */
  get("addRow").addEventListener("click", () => {
    const { U } = raceData();
    const first = Object.keys(U).sort()[0] || "Marine";
    state.rows.push({ name: first, count: 1, uptime: 100, cap: null });
    renderRows();
    compute();
    saveToUrl();
  });

  function populateUnitSelect(selEl, selected) {
    const { U } = raceData();
    selEl.innerHTML = "";

    if (selected && !U[selected]) {
      const info =
        (T[selected] && { race: "Terran" }) ||
        (P[selected] && { race: "Protoss" }) ||
        (Z[selected] && { race: "Zerg" }) ||
        null;
      const o = document.createElement("option");
      o.value = selected;
      o.textContent = info ? `${selected} (${info.race})` : selected;
      o.dataset.preserved = "1";
      selEl.appendChild(o);
    }

    Object.keys(U)
      .sort()
      .forEach((name) => {
        const o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        selEl.appendChild(o);
      });

    selEl.value = selected;
    if (selEl.value !== selected) selEl.selectedIndex = 0;

    selEl.addEventListener(
      "change",
      (e) => {
        const tr = e.target.closest("tr");
        const idx = Array.from(tbody.children).indexOf(tr);
        if (idx >= 0) {
          state.rows[idx].name = e.target.value;
          renderRows();
          compute();
          saveToUrl();
        }
      },
      { once: true }
    );
  }

  refreshUnitOptions();
  renderRows();
  renderUnitEditor();

  return {
    getState() {
      return {
        race: get("race").value,
        bases: Number(get("bases").value) || 0,
        orbitals: Number(get("orbitals").value) || 0,
        workersPerBase: Number(get("workersPerBase").value) || 16,
        mineralsPerPatch: Number(get("mineralsPerPatch").value),
        gasPerGeyserBank: Number(get("gasPerGeyserBank").value),
        gasPerGeyserMin: Number(get("gasPerGeyserMin").value),
        muleYield: Number(get("muleYield").value),
        secTo50: Number(get("secTo50").value),
        rows: state.rows,
        actualSupply: Number(get("actualSupply").value) || 120,
        resM: Number(get("resM").value) || 0,
        resG: Number(get("resG").value) || 0,
      };
    },
    setState(s) {
      const g = get;
      g("race").value = s.race || "Terran";
      g("bases").value = s.bases ?? 2;
      g("orbitals").value = s.orbitals ?? 2;
      g("workersPerBase").value = s.workersPerBase ?? 16;
      g("mineralsPerPatch").value = s.mineralsPerPatch ?? 1500;
      g("gasPerGeyserBank").value = s.gasPerGeyserBank ?? 2250;
      g("gasPerGeyserMin").value = s.gasPerGeyserMin ?? 160;
      g("muleYield").value = s.muleYield ?? 225;
      g("secTo50").value = s.secTo50 ?? 88.9;
      g("actualSupply").value = s.actualSupply ?? 120;
      g("resM").value = s.resM ?? 0;
      g("resG").value = s.resG ?? 0;
      clampOrbitals();
      state.rows = (Array.isArray(s.rows) ? s.rows : []).map((r) => ({
        name: r.name,
        count: Math.max(0, Number(r.count) || 0),
        uptime:
          r.uptime == null
            ? 100
            : Math.max(0, Math.min(100, Number(r.uptime) || 0)),
        cap:
          r.cap == null || r.cap === ""
            ? null
            : Math.max(0, Number(r.cap) || 0),
      }));
      refreshUnitOptions();
      renderUnitEditor();
      renderRows();
      recalcSupplyCap();
    },
    root,
    getBars: () => state._bars || null,
  };
}

/* --------- Right side cloning --------- */
function buildRight() {
  const left = document.getElementById("sideL");
  const right = document.getElementById("sideR");
  const toClone = Array.from(left.children).slice(1);
  const frag = document.createDocumentFragment();
  toClone.forEach((node) => frag.appendChild(node.cloneNode(true)));
  right.appendChild(frag);

  // Fix IDs: l-* -> r-*
  right.querySelectorAll("[id^='l-']").forEach((el) => {
    const newId = el.id.replace(/^l-/, "r-");
    right
      .querySelectorAll(`label[for="${el.id}"]`)
      .forEach((lb) => (lb.htmlFor = newId));
    el.id = newId;
  });
}

window._updateBars = function updateBars() {
  if (!window.L || !window.R) return;

  function setByDenom(income, spend, denom, incEl, spEl, overEl) {
    const incPct = Math.min(income / denom, 1) * 100;
    const spPct = Math.min(spend / denom, 1) * 100;
    const overPct = Math.max(0, (spend - income) / denom) * 100;
    incEl.style.width = incPct.toFixed(2) + "%";
    spEl.style.width = Math.min(spPct, incPct).toFixed(2) + "%";
    overEl.style.width = overPct.toFixed(2) + "%";
    overEl.style.left = incPct.toFixed(2) + "%";
  }

  [window.L, window.R].forEach((app) => {
    // Skip the right app entirely when hidden
    if (!app || (document.body.classList.contains("hideR") && app === window.R))
      return;
    const p = app.getBars?.();
    if (!p) return;

    // denom is computed from THIS side only
    const denomM = Math.max(1, p.m.income, p.m.spend);
    const denomG = Math.max(1, p.g.income, p.g.spend);

    setByDenom(p.m.income, p.m.spend, denomM, p.m.incEl, p.m.spEl, p.m.overEl);
    setByDenom(p.g.income, p.g.spend, denomG, p.g.incEl, p.g.spEl, p.g.overEl);
  });
};

/* --------- Equalize details heights (paired) --------- */
function equalizeDetailHeights() {
  if (document.body.classList.contains("hideR")) {
    document
      .querySelectorAll("#sideL details.card, #sideR details.card")
      .forEach((el) => (el.style.minHeight = ""));
    return;
  }
  const Ls = Array.from(document.querySelectorAll("#sideL details.card"));
  const Rs = Array.from(document.querySelectorAll("#sideR details.card"));
  const n = Math.min(Ls.length, Rs.length);

  for (let i = 0; i < n; i++) {
    Ls[i].style.minHeight = "";
    Rs[i].style.minHeight = "";
  }

  for (let i = 0; i < n; i++) {
    const Lopen = Ls[i].open,
      Ropen = Rs[i].open;
    if (Lopen && Ropen) {
      requestAnimationFrame(() => {
        const h = Math.max(
          Ls[i].getBoundingClientRect().height,
          Rs[i].getBoundingClientRect().height
        );
        Ls[i].style.minHeight = h + "px";
        Rs[i].style.minHeight = h + "px";
      });
    } else {
      Ls[i].style.minHeight = "";
      Rs[i].style.minHeight = "";
    }
  }
}

/* --------- Keep L/R details open/closed in sync --------- */
function syncDetails() {
  const lD = Array.from(document.querySelectorAll("#sideL details.card"));
  const rD = Array.from(document.querySelectorAll("#sideR details.card"));
  function link(a, b) {
    a.addEventListener("toggle", () => {
      b.open = a.open;
      requestAnimationFrame(equalizeDetailHeights);
    });
    b.addEventListener("toggle", () => {
      a.open = b.open;
      requestAnimationFrame(equalizeDetailHeights);
    });
  }
  const n = Math.min(lD.length, rD.length);
  for (let i = 0; i < n; i++) link(lD[i], rD[i]);
}

/* ============================ BOOT ============================ */
(async () => {
  let data;
  console.log("Starting app...");
  try {
    const resp = await fetch("unit_data.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    data = await resp.json();
  } catch (e) {
    fatal(`Could not load unit_data.json (${e.message}).`);
    return;
  }

  if (!data?.T || !data?.P || !data?.Z) {
    fatal("unit_data.json is missing one or more of: T, P, Z.");
    return;
  }

  T = data.T;
  P = data.P;
  Z = data.Z;

  normalizeAll();

  computeBarMaxSec();
  GLOBAL_CAPS = computeCapsOnce();

  console.log("Data loaded and normalized, building UI...");

  // Build right side UI and init apps
  buildRight();
  window.L = App("sideL");
  window.R = App("sideR");

  /* --------- URL/save state helpers --------- */
  function encodeState() {
    const s = {
      title: (document.getElementById("buildNameGlobal")?.value || "").trim(),
      L: L.getState(),
      R: R.getState(),
      unitData: window.unitData || {},
      showR: !document.body.classList.contains("hideR"),
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
  }
  function decodeState(s) {
    try {
      const state = JSON.parse(decodeURIComponent(escape(atob(s))));
      if (state.unitData) {
        window.unitData = state.unitData;
      }
      return state;
    } catch {
      return null;
    }
  }
  window._saveState = function () {
    const b = encodeState();
    console.log("Saving state to URL:", b);
    history.replaceState(null, "", "#s=" + b);
  };

  // First bar sync after both apps exist
  if (window._updateBars) window._updateBars();
  equalizeDetailHeights();
  syncDetails();

  // Show/Hide Team 2
  const cbShowR = document.getElementById("toggleTeam2");
  if (cbShowR) {
    cbShowR.addEventListener("change", () => {
      document.body.classList.toggle("hideR", !cbShowR.checked);
      equalizeDetailHeights();
      if (window._updateBars) window._updateBars();
      window._saveState();
    });
  }

  const titleEl = document.getElementById("buildNameGlobal");
  if (titleEl) {
    console.log("Title input found, enabling title save/load.");
    titleEl.addEventListener("input", window._saveState());
    titleEl.addEventListener("change", window._saveState());
  }
  (function loadFromUrl() {
    const m = location.hash.match(/#s=([^]+)/);
    const cb = document.getElementById("toggleTeam2");
    const defaultShowR = false;

    if (!m) {
      // No state in URL: default to hideR = true (Team 2 hidden)
      document.body.classList.toggle("hideR", !defaultShowR);
      if (cb) cb.checked = defaultShowR;
      if (window._updateBars) window._updateBars();
      window._saveState();
      return;
    }

    const parsed = decodeState(m[1]);
    if (parsed && parsed.L && parsed.R) {
      window._bootLoading = true;

      const titleEl = document.getElementById("buildNameGlobal");
      if (titleEl)
        titleEl.value =
          parsed.title || parsed?.L?.name || parsed?.R?.name || "";

      // Use parsed.showR if present, otherwise default to false
      const showR = typeof parsed.showR === "boolean" ? parsed.showR : false;
      document.body.classList.toggle("hideR", !showR);
      if (cb) cb.checked = showR;

      L.setState(parsed.L);
      R.setState(parsed.R);

      window._bootLoading = false;
      if (window._updateBars) window._updateBars();
      return;
    }

    document.body.classList.toggle("hideR", !defaultShowR);
    if (cb) cb.checked = defaultShowR;
    if (window._updateBars) window._updateBars();
    window._saveState();
  })();

  // Copy URL
  document.getElementById("copyUrl").addEventListener("click", async () => {
    window._saveState();
    try {
      await navigator.clipboard.writeText(location.href);
      document.getElementById("copyMsg").textContent = "Copied!";
    } catch {
      document.getElementById("copyMsg").textContent = "URL in address bar";
    }
  });

  // PWA
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js");
    });
  }
})().catch((e) => fatal(`Boot failed: ${e.message}`));
