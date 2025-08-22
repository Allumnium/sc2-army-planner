import { T, P, Z } from "./data.js";
import {
  unitLookup,
  baseDps,
  maxDps,
  canUnitHitAir,
  canUnitHitGround,
  clamp01,
  normalizeBonusDpsMap,
  normBonusKey,
  domainDpsForUnit,
  PREF_TO_LABEL,
  GLOBAL_CAPS,
  BAR_MAX_SEC,
} from "./helpers.js";

/* =================== App factory =================== */
export function App(rootId) {
  console.log("Creating app for " + rootId);
  const root = document.getElementById(rootId);
  const get = (key) => root.querySelector(`[data-id="${key}"]`);
  const state = { rows: [], supAuto: true };

  function raceData() {
    console.log("Getting race data");
    const r = get("race").value;
    if (r === "Terran") return { U: T, race: r };
    if (r === "Protoss") return { U: P, race: r };
    return { U: Z, race: r };
  }

  function removeRow(i) {
    console.log("Removing row at index " + i);
    state.rows.splice(i, 1);
    renderRows();
  }

  function updateRowCount(i, v) {
    console.log("Updating row count at index " + i + " to " + v);
    state.rows[i].count = Math.max(0, Number(v) || 0);
    if (state.rows[i].count === 0) {
      state.rows.splice(i, 1);
    }
    renderRows();
  }

  function renderQualities(summary, tgt) {
    console.log("Rendering qualities for summary and target units");
    const totalUnits = tgt.reduce((s, x) => s + x.count, 0);
    const totalSup = tgt.reduce((s, x) => s + x.sup * x.count, 0);
    const dpsPerSup = totalSup
      ? tgt.reduce((s, x) => s + x.dps * x.count, 0) / totalSup
      : 0;
    const hpPerSup = totalSup
      ? tgt.reduce((s, x) => s + x.hp * x.count, 0) / totalSup
      : 0;
    const avgCostPerSup = totalSup
      ? tgt.reduce((s, x) => s + x.costW * x.count, 0) / totalSup
      : 0;
    function setQ(el, val) {
      el.style.width = (val * 100).toFixed(0) + "%";
    }
    function setQV(el, val) {
      el.textContent = Math.round(val * 100);
    }
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
    const caps = GLOBAL_CAPS || { dpsPerSup: 1, hpPerSup: 1, costPerSup: 1 };
    const g = (k) => root.querySelector(`[data-id="${k}"]`);
    setQ(g("qTank"), clamp01(hpPerSup / Math.max(1e-6, caps.hpPerSup)));
    setQV(g("qTankV"), clamp01(hpPerSup / Math.max(1e-6, caps.hpPerSup)));
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
    g("qTank").parentElement.title = `HP per supply: ${hpPerSup.toFixed(
      1
    )} (cap: ${caps.hpPerSup.toFixed(1)})`;
    g(
      "qCost"
    ).parentElement.title = `Avg cost per supply: ${avgCostPerSup.toFixed(
      2
    )} (cap: ${caps.costPerSup.toFixed(2)})`;
    const typeSumsPS = new Map();
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
    let groundPS = 0,
      airPS = 0;
    tgt.forEach((x) => {
      const cnt = Number(x.count) || 0;
      groundPS += ((Number(x.dpsG) || 0) * cnt) / totalSup;
      airPS += ((Number(x.dpsA) || 0) * cnt) / totalSup;
    });
    typeSumsPS.set("ground", groundPS);
    typeSumsPS.set("air", airPS);
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
    const EPS = 1e-6;
    const allVal = typeSumsPS.get("all") || 0;
    const entries = Array.from(typeSumsPS.entries())
      .filter(([k, v]) => v > 0)
      .filter(
        ([k, v]) => k === "ground" || k === "air" || Math.abs(v - allVal) > EPS
      )
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
            const pct = clamp01(vPS / Math.max(1e-6, caps.dpsPerSup)) * 100;
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
    console.log("Refreshing unit options");
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
    console.log("Rendering unit editor");
    const wrap = get("unitEditorWrap");
    if (!wrap) return;
    const { U, race } = raceData();
    const rows = Object.keys(U)
      .sort()
      .map((name) => {
        const u = U[name];
        const prefStr = Array.isArray(u.pref)
          ? u.pref.join(", ")
          : u.pref ?? "";
        let dpsG = Number.isFinite(u.dpsG) ? u.dpsG : null;
        let dpsA = Number.isFinite(u.dpsA) ? u.dpsA : null;
        if (dpsG === null && dpsA === null) {
          const total = Number(u.dps) || 0;
          const hitsAir = canUnitHitAir(name);
          const hitsGround = canUnitHitGround(name);
          dpsG = hitsGround ? total : 0;
          dpsA = hitsAir ? total : 0;
        }
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
          const arr = String(val)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          U[name][f] = arr;
        } else {
          U[name][f] = Number(val) || 0;
        }
        if (f === "dpsG" || f === "dpsA") {
          const g = Number(tr.querySelector('input[data-f="dpsG"]').value) || 0;
          const a = Number(tr.querySelector('input[data-f="dpsA"]').value) || 0;
          const total = g + a;
          tr.querySelector('[data-f="dpsTotal"]').textContent =
            total.toFixed(1);
          U[name].dps = total;
        }
        renderRows();
        compute();
        if (typeof window._saveState === "function") window._saveState();
      });
    });
  }

  function clampOrbitals() {
    console.log("Clamping orbitals");
    const bases = Math.max(0, Number(get("bases").value) || 0);
    const orbEl = get("orbitals");
    const wrap = root.querySelector('[data-id="orbitalsWrap"]');
    wrap.style.display = "";
    const v = Math.max(0, Math.min(bases, Number(orbEl.value) || 0));
    if (Number(orbEl.value) !== v) orbEl.value = v;
  }

  function spendAndDps(u, row) {
    console.log("Calculating spend and DPS for unit", u.name, "with row", row);
    const streams = Math.max(0, Number(row.count) || 0);
    const uptimeF = Math.max(0, Math.min(100, Number(row.uptime ?? 100))) / 100;
    const effStreams = streams * uptimeF;
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
      if (typeof window._saveState === "function") window._saveState();
    });
  }

  function recalcSupplyCap() {
    console.log("Recalculating supply cap");
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
    console.log("Moving row from", from, "to", to);
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
    if (typeof window._saveState === "function") window._saveState();
  }

  function renderRows() {
    console.log("Rendering rows");
    const tbody = root.querySelector("[data-id='tbody']");
    if (!tbody) return;
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
      const spend = spendAndDps(u, r);
      sumM += spend.m;
      sumG += spend.g;
      sumStreams += Number(r.count) || 0;
      sumUptime += r.uptime ?? 100;
      if (r.cap != null) sumCap += Number(r.cap) || 0;
      const tr = document.createElement("tr");
      if (!tr) return;
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
        if (typeof window._saveState === "function") window._saveState();
      });
      tr.querySelector('[data-act="uptime"]').addEventListener("change", () => {
        renderRows();
        compute();
        if (typeof window._saveState === "function") window._saveState();
      });
      tr.querySelector('[data-act="cap"]').addEventListener("input", (e) => {
        const v = e.target.value.trim();
        state.rows[i].cap = v === "" ? null : Math.max(0, Number(v) || 0);
        compute();
        if (typeof window._saveState === "function") window._saveState();
      });
      tr.querySelector('[data-act="cap"]').addEventListener("change", () => {
        renderRows();
        compute();
        if (typeof window._saveState === "function") window._saveState();
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
    const tableWrap = root.querySelector("[data-id='unitTableWrap']");
    const anyRows = state.rows.length > 0;
    if (anyRows) tableWrap.style.display = "block";
    get("uStreams").textContent = sumStreams;
    get("uUptimeAvg").textContent =
      (state.rows.length ? Math.round(sumUptime / state.rows.length) : 0) + "%";
    get("uCapCount").textContent = sumCap > 0 ? sumCap : "—";
    get("uMin").textContent = Math.round(sumM);
    get("uGas").textContent = Math.round(sumG);
    compute();
    if (typeof window._saveState === "function") window._saveState();
    if (typeof window.equalizeDetailHeights === "function")
      window.equalizeDetailHeights();
  }

  function satMineralsPerBase() {
    console.log("Calculating minerals per base");
    const W = Math.max(0, Number(get("workersPerBase").value) || 0);
    const w12 = Math.min(16, W);
    const w3 = Math.max(0, Math.min(8, W - 16));
    return w12 * 40 + w3 * 20;
  }
  function satGasPerBase() {
    console.log("Calculating gas per base");
    return (
      Number(get("geysersPerBase").value) * Number(get("gasPerGeyserMin").value)
    );
  }
  function muleIncomePerMinute() {
    console.log("Calculating MULE income per minute");
    return (
      Number(get("orbitals").value) *
      (60 / Number(get("secTo50").value)) *
      Number(get("muleYield").value)
    );
  }

  const COUNTERS = {
    light: ["Hellion", "Hellbat", "Colossus", "Adept", "Baneling"],
    armored: ["Marauder", "Immortal", "Cyclone", "Void Ray"],
    air: ["Viking", "Corruptor", "Phoenix", "Stalker"],
    bio: ["Archon", "Hellbat", "Baneling"],
    mech: ["Immortal", "Tempest", "Marauder"],
    ground: ["Liberator", "Colossus", "Lurker"],
  };

  function compute() {
    console.log("Computing resources and army");
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

    computeActualArmy();
  }

  function computeActualArmy() {
    const S = Number(get("actualSupply").value) || 0;
    const items = state.rows
      .map((r) => {
        const info = unitLookup(r.name);
        if (!info) return null;
        const { u, race } = info;
        const uptimeF =
          Math.max(0, Math.min(100, Number(r.uptime ?? 100))) / 100;
        const perMin =
          (u.t > 0 ? 60 / u.t : 0) * (Number(r.count) || 0) * uptimeF;
        const base = baseDps(u),
          peak = maxDps(u);
        const dom = domainDpsForUnit(u, r.name);
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
          hp: u.hp + u.sh,
          dps: base,
          dpsMax: peak,
          dpsG: dom.g,
          dpsA: dom.a,
          armor: u.armor,
          costW: u.m + u.g,
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
    const raceNow = get("race").value;
    const basesNow = Math.max(0, Number(get("bases").value) || 0);
    const wpbNow = Math.max(0, Number(get("workersPerBase").value) || 0);
    const workerCount = basesNow * wpbNow;
    const workerLabel =
      raceNow === "Terran" ? "SCV" : raceNow === "Protoss" ? "Probe" : "Drone";
    const workersEl = get("workersLine");
    if (workersEl)
      workersEl.textContent = `${workerCount.toLocaleString()} ${workerLabel}${
        workerCount === 1 ? "" : "s"
      }`;
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
    const compBigEl = get("finalComp");
    if (compBigEl) {
      console.log("Rendering composition HTML");
      const compHtml = tgt
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count * b.sup - a.count * a.sup)
        .map((x) => `<span class="u r${x.race}">${x.name} × ${x.count}</span>`)
        .join("");
      compBigEl.innerHTML = compHtml || "—";
    }
    let totalM = 0,
      totalG = 0;
    tgt.forEach((x) => {
      const Ux = T[x.name] || P[x.name] || Z[x.name];
      if (!Ux) return;
      totalM += (Number(Ux.m) || 0) * x.count;
      totalG += (Number(Ux.g) || 0) * x.count;
    });
    const totalCostMinsEl = get("totalCostMin");
    if (totalCostMinsEl)
      totalCostMinsEl.textContent = `${Math.round(totalM).toLocaleString()}m`;
    const totalCostGasEl = get("totalCostGas");
    if (totalCostGasEl)
      totalCostGasEl.textContent = `${Math.round(totalG).toLocaleString()}g`;
    const usedS = tgt.reduce((s, x) => s + x.count * x.sup, 0);
    const totalUnits = tgt.reduce((s, x) => s + x.count, 0);
    const hp = tgt.reduce((s, x) => s + x.hp * x.count, 0);
    const dps = tgt.reduce((s, x) => s + x.dps * x.count, 0);
    const armorAvg = totalUnits
      ? tgt.reduce((s, x) => s + x.armor * x.count, 0) / totalUnits
      : 0;
    const det = tgt.some((x) => x.flags.detector),
      bur = tgt.some((x) => x.flags.burrow),
      clk = tgt.some((x) => x.flags.cloak),
      aa = tgt.some((x) => x.aa);
    const heals = tgt.some((x) => x.flags.heals);
    get("analysisWrap").style.display = tgt.length ? "" : "none";
    get(
      "actualTotals"
    ).textContent = `HP ${hp.toLocaleString()} | Armor ${armorAvg.toFixed(2)}`;
    const costW = tgt.reduce((s, x) => s + x.costW * x.count, 0);
    renderQualities(
      {
        hp,
        sup: usedS,
        dps,
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
    const airHeavy = shares.air >= 0.4;
    const groundHeavy = shares.ground >= 0.6;
    if (airHeavy && !groundHeavy) {
      counterList = counterList.filter(canUnitHitAir);
    } else if (groundHeavy && !airHeavy) {
      counterList = counterList.filter(canUnitHitGround);
    } else {
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

  root.querySelectorAll("input,select").forEach((el) => {
    el.addEventListener("input", () => {
      if (el === get("race")) {
        clampOrbitals();
        renderRows();
        compute();
        renderUnitEditor();
        if (typeof window._saveState === "function") window._saveState();
        if (typeof window.equalizeDetailHeights === "function")
          requestAnimationFrame(window.equalizeDetailHeights);
      } else if (el === get("bases") || el === get("workersPerBase")) {
        clampOrbitals();
        recalcSupplyCap();
        compute();
        if (typeof window._saveState === "function") window._saveState();
      } else if (el === get("orbitals")) {
        clampOrbitals();
        compute();
        if (typeof window._saveState === "function") window._saveState();
      } else {
        compute();
        if (typeof window._saveState === "function") window._saveState();
      }
    });
  });

  const tbody = root.querySelector("[data-id='tbody']");
  get("addRow").addEventListener("click", () => {
    const { U } = raceData();
    const first = Object.keys(U).sort()[0] || "Marine";
    state.rows.push({ name: first, count: 1, uptime: 100, cap: null });
    renderRows();
    compute();
    if (typeof window._saveState === "function") window._saveState();
  });

  function populateUnitSelect(selEl, selected) {
    const { U } = raceData();
    if (!selEl) return;
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
          if (typeof window._saveState === "function") window._saveState();
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
      console.log("Getting state");
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
      console.log("Setting state:", s);
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
