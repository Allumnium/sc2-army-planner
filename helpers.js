import { T, P, Z } from "./data.js";
export const GLOBAL_CAPS = computeCapsOnce(T, P, Z);
export const BAR_MAX_SEC = computeBarMaxSec(T, P, Z);

// Race codes
const RACE_TO_CODE = { Terran: 0, Protoss: 1, Zerg: 2 };
const CODE_TO_RACE = ["Terran", "Protoss", "Zerg"];

// Per-race unit dictionaries (stable order = Object.keys as shipped)
const UNITS_BY_CODE = [Object.keys(T), Object.keys(P), Object.keys(Z)];
const NAME_TO_ID = UNITS_BY_CODE.map((list) => {
  const m = Object.create(null);
  list.forEach((n, i) => (m[n] = i));
  return m;
});
export function encodeState() {
  const title = (
    document.getElementById("buildNameGlobal")?.value || ""
  ).trim();
  const Lstate = window.L.getState(); // <-- use window.
  const Rstate = window.R.getState(); // <-- use window.
  const showR = !document.body.classList.contains("hideR");
  const includeR = showR || Rstate?.rows?.length > 0;

  // Build binary payload (your existing code)
  const bytes = [];
  bytes.push(1); // version
  const hasTitle = title.length > 0;
  const flags = (includeR ? 1 : 0) | (hasTitle ? 2 : 0);
  bytes.push(flags);

  if (hasTitle) {
    const tb = te.encode(title);
    pushVarint(bytes, tb.length);
    for (let i = 0; i < tb.length; i++) bytes.push(tb[i]);
  }

  bytes.push(
    ...sideToBinary(Lstate, RACE_TO_CODE[Lstate.race] ?? 0, NAME_TO_ID)
  );
  if (includeR) {
    bytes.push(
      ...sideToBinary(Rstate, RACE_TO_CODE[Rstate.race] ?? 0, NAME_TO_ID)
    );
  }

  // Compress + base64url (all sync now)
  const compressed = deflateRaw(new Uint8Array(bytes));
  return b64urlFromBytes(compressed);
}
export function decodeState(token) {
  const raw = inflateRaw(bytesFromB64url(token)); // Uint8Array
  const view = raw;
  const idx = { i: 0 };

  const ver = view[idx.i++];
  if (ver !== 1) throw new Error("Unknown share version");
  const flags = view[idx.i++] | 0;
  const includeR = !!(flags & 1);
  const hasTitle = !!(flags & 2);

  let title = "";
  if (hasTitle) {
    const len = readVarint(view, idx) | 0;
    title = td.decode(view.slice(idx.i, idx.i + len));
    idx.i += len;
  }

  const Lc = sideFromBinary(view, idx, UNITS_BY_CODE);
  const Rc = includeR
    ? sideFromBinary(view, idx, UNITS_BY_CODE)
    : { race: "Terran", rows: [] };
  return { title, showR: includeR, L: Lc, R: Rc };
}

// Defaults matching your UI
const DEF = {
  bases: 1,
  orbitals: 0,
  workersPerBase: 16,
  mineralsPerPatch: 1500,
  gasPerGeyserBank: 2250,
  gasPerGeyserMin: 160,
  muleYield: 225,
  secTo50d: 889, // 88.9 s -> deciseconds
  actualSupply: 120,
  resM: 0,
  resG: 0,
};
// Fixed field order + mapper
const FIELDS = [
  ["bases", "u"],
  ["orbitals", "u"],
  ["workersPerBase", "u"],
  ["mineralsPerPatch", "u"],
  ["gasPerGeyserBank", "u"],
  ["gasPerGeyserMin", "u"],
  ["muleYield", "u"],
  ["secTo50d", "u"],
  ["actualSupply", "u"],
  ["resM", "u"],
  ["resG", "u"],
];

function sideToBinary(S, raceCode, unitNameToId) {
  // Bitmask of fields that differ from defaults
  let mask = 0;
  const values = [];
  const secTo50d = Math.round((S.secTo50 ?? 88.9) * 10);
  const src = { ...S, secTo50d };

  FIELDS.forEach(([k], i) => {
    const v = src[k] ?? DEF[k];
    if (v !== DEF[k]) {
      mask |= 1 << i;
      values.push(v - DEF[k]);
    }
  });

  // Rows: [id, count, flags, (uptime), (cap)]
  // flags bit0 = has uptime (!=100), bit1 = has cap (not null)
  const rows = S.rows || [];
  const out = [];
  pushVarint(out, raceCode);
  pushVarint(out, mask >>> 0);
  values.forEach((d) => pushVarint(out, zz(d | 0)));
  pushVarint(out, rows.length);
  const rc = raceCode | 0;

  rows.forEach((r) => {
    const id = unitNameToId[rc][r.name];
    const cnt = r.count | 0;
    const up = r.uptime == null ? 100 : r.uptime | 0;
    const hasU = up !== 100;
    const hasC = r.cap != null;
    const flags = (hasU ? 1 : 0) | (hasC ? 2 : 0);
    pushVarint(out, id | 0);
    pushVarint(out, cnt);
    pushVarint(out, flags);
    if (hasU) pushVarint(out, up);
    if (hasC) pushVarint(out, r.cap | 0);
  });
  return out;
}

function sideFromBinary(view, idx, unitNamesByCode) {
  const rc = readVarint(view, idx) | 0;
  const mask = readVarint(view, idx) >>> 0;
  const side = {
    race: CODE_TO_RACE[rc] || "Terran",
    bases: DEF.bases,
    orbitals: DEF.orbitals,
    workersPerBase: DEF.workersPerBase,
    mineralsPerPatch: DEF.mineralsPerPatch,
    gasPerGeyserBank: DEF.gasPerGeyserBank,
    gasPerGeyserMin: DEF.gasPerGeyserMin,
    muleYield: DEF.muleYield,
    secTo50: DEF.secTo50d / 10,
    actualSupply: DEF.actualSupply,
    resM: DEF.resM,
    resG: DEF.resG,
    rows: [],
  };
  // Apply deltas where bits set
  FIELDS.forEach(([k], i) => {
    if (mask & (1 << i)) {
      const delta = unzz(readVarint(view, idx) | 0);
      if (k === "secTo50d") side.secTo50 = (DEF.secTo50d + delta) / 10;
      else side[k] = DEF[k] + delta;
    }
  });

  const nRows = readVarint(view, idx) | 0;
  const names = unitNamesByCode[rc] || unitNamesByCode[0];
  for (let i = 0; i < nRows; i++) {
    const id = readVarint(view, idx) | 0;
    const count = readVarint(view, idx) | 0;
    const flags = readVarint(view, idx) | 0;
    let uptime = 100,
      cap = null;
    if (flags & 1) uptime = readVarint(view, idx) | 0;
    if (flags & 2) cap = readVarint(view, idx) | 0;
    side.rows.push({ name: names[id] || names[0], count, uptime, cap });
  }
  return side;
}

// === Binary + DEFLATE helpers ===
const te = new TextEncoder();
const td = new TextDecoder();

// base64url <-> bytes (no padding)
function b64urlFromBytes(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function bytesFromB64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// varint (unsigned) + zigzag for signed
function zz(n) {
  return (n << 1) ^ (n >> 31);
} // signed -> unsigned
function unzz(n) {
  return (n >>> 1) ^ -(n & 1);
} // unsigned -> signed
function pushVarint(arr, n) {
  n >>>= 0;
  while (n >= 0x80) {
    arr.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  arr.push(n);
}
function readVarint(view, idx) {
  let x = 0,
    s = 0,
    b;
  do {
    b = view[idx.i++];
    x |= (b & 0x7f) << s;
    s += 7;
  } while (b & 0x80);
  return x >>> 0;
}

// --- Synchronous DEFLATE via pako ---
function deflateRaw(bytes) {
  // bytes: Uint8Array
  return window.pako.deflateRaw(bytes); // -> Uint8Array
}
function inflateRaw(bytes) {
  return window.pako.inflateRaw(bytes); // -> Uint8Array
}

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

function computeCapsOnce(T, P, Z) {
  let dpsPerSupMax = 0;
  let hpPerSupMax = 0;
  let costPerSupMax = 0;

  [T, P, Z].forEach((U) => {
    Object.values(U).forEach((u) => {
      const sup = Math.max(1e-6, u.sup || 1);
      const hpPerSup = ((Number(u.hp) || 0) + (Number(u.sh) || 0)) / sup;
      const cpsU = ((Number(u.m) || 0) + (Number(u.g) || 0)) / sup;
      const dpsPerSup = (Number(u.dps) || 0) / sup;
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

function computeBarMaxSec(T, P, Z) {
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

export function domainDpsForUnit(u, name) {
  const total = u.dps;
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
