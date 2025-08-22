import { T, P, Z } from "./data.js";

export const GLOBAL_CAPS = computeCapsOnce(T, P, Z);
export const BAR_MAX_SEC = computeBarMaxSec(T, P, Z);

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

export function normalizeAll() {
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

export const AIR_ONLY = new Set([
  "Phoenix",
  "Corruptor",
  "Observer",
  "Overseer",
  "Medivac",
  "Raven",
]);

export function canUnitHitAir(name) {
  const u = unitLookup(name);
  return !!u && (u.u.tags || []).includes("aa");
}

export function canUnitHitGround(name) {
  const u = unitLookup(name);
  if (!u) return false;
  return !AIR_ONLY.has(name);
}

export function unitLookup(name) {
  if (T[name]) return { u: T[name], race: "Terran" };
  if (P[name]) return { u: P[name], race: "Protoss" };
  if (Z[name]) return { u: Z[name], race: "Zerg" };
  return null;
}

export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function baseDps(u) {
  const g = Number(u.dpsG);
  const a = Number(u.dpsA);
  const gOk = Number.isFinite(g) && g > 0;
  const aOk = Number.isFinite(a) && a > 0;
  if (gOk && aOk) return (g + a) / 2;
  if (gOk) return g;
  if (aOk) return a;
  if (Number.isFinite(u.dps)) return Math.max(0, Number(u.dps));
  return 0;
}

export function maxDps(u) {
  return Number.isFinite(u.dpsMax) ? Math.max(0, Number(u.dpsMax)) : baseDps(u);
}

export function computeCapsOnce(T, P, Z) {
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

export function computeBarMaxSec(T, P, Z) {
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
  return Math.max(1, unitsNeeded * tMax);
}

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

export function normBonusKey(k) {
  if (!k) return null;
  const key = String(k).toLowerCase().trim();
  return BONUS_KEY_MAP[key] || key;
}

export function normalizeBonusDpsMap(bd) {
  const out = {};
  if (!bd) return out;
  Object.entries(bd).forEach(([k, v]) => {
    let key = normBonusKey(k);
    if (!key) return;
    if (key === "shield") key = "shields";
    out[key] = Number(v) || 0;
  });
  return out;
}

export const PREF_TO_LABEL = {
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

export function buildAppliesFn(spec, U) {
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

export function domainDpsForUnit(u, name) {
  const total = baseDps(u);
  const gExplicit = Number(u.dpsG);
  const aExplicit = Number(u.dpsA);
  const hasExplicit =
    (Number.isFinite(gExplicit) && gExplicit > 0) ||
    (Number.isFinite(aExplicit) && aExplicit > 0);

  if (hasExplicit) {
    return { g: Math.max(0, gExplicit || 0), a: Math.max(0, aExplicit || 0) };
  }
  const hasAir = canUnitHitAir(name);
  const hasG = canUnitHitGround(name);
  if (hasAir && !hasG) return { a: total, g: 0 };
  if (!hasAir && hasG) return { a: 0, g: total };
  if (hasAir && hasG) return { a: total, g: total };
  return { a: 0, g: 0 };
}
