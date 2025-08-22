import { App } from "./app-core.js";
import { normalizeAll, computeCapsOnce, computeBarMaxSec } from "./helpers.js";
import { T, P, Z } from "./data.js"; // This is the new import statement.

function fatal(msg) {
  console.error("[SC2 Planner] " + msg);
  const main = document.getElementById("main");
  if (!main) return;
  const div = document.createElement("div");
  div.className = "card";
  div.style.borderColor = "var(--danger)";
  div.style.background = "#1a0f12";
  div.innerHTML = `<div class="big" style="color:var(--danger)">Data error</div><div class="small">${msg}</div>`;
  main.prepend(div);
}

function encodeState() {
  console.log("Encoding state for URL");
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
  console.log("Decoding state from URL");
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

function buildRight() {
  console.log("Building right side UI");
  const left = document.getElementById("sideL");
  const right = document.getElementById("sideR");
  const toClone = Array.from(left.children).slice(1);
  const frag = document.createDocumentFragment();
  toClone.forEach((node) => frag.appendChild(node.cloneNode(true)));
  right.appendChild(frag);
  right.querySelectorAll("[id^='l-']").forEach((el) => {
    const newId = el.id.replace(/^l-/, "r-");
    right
      .querySelectorAll(`label[for="${el.id}"]`)
      .forEach((lb) => (lb.htmlFor = newId));
    el.id = newId;
  });
}

window._updateBars = function updateBars() {
  console.log("Updating resource bars");
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
    if (!app || (document.body.classList.contains("hideR") && app === window.R))
      return;
    const p = app.getBars?.();
    if (!p) return;
    const denomM = Math.max(1, p.m.income, p.m.spend);
    const denomG = Math.max(1, p.g.income, p.g.spend);
    setByDenom(p.m.income, p.m.spend, denomM, p.m.incEl, p.m.spEl, p.m.overEl);
    setByDenom(p.g.income, p.g.spend, denomG, p.g.incEl, p.g.spEl, p.g.overEl);
  });
};

function equalizeDetailHeights() {
  console.log("Equalizing detail heights");
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

function syncDetails() {
  console.log("Syncing details between sides");
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

(async () => {
  console.log("Starting app...");

  normalizeAll();
  BAR_MAX_SEC = computeBarMaxSec(T, P, Z);
  GLOBAL_CAPS = computeCapsOnce(T, P, Z);

  console.log("Data loaded and normalized, building UI...");

  buildRight();
  window.L = App("sideL");
  window.R = App("sideR");

  window._saveState = function () {
    const b = encodeState();
    console.log("Saving state to URL:", b);
    history.replaceState(null, "", "#s=" + b);
  };

  if (window._updateBars) window._updateBars();
  equalizeDetailHeights();
  syncDetails();

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
    titleEl.addEventListener("input", window._saveState);
    titleEl.addEventListener("change", window._saveState);
  }

  (function loadFromUrl() {
    console.log("Loading state from URL...");
    const m = location.hash.match(/#s=([^]+)/);
    const cb = document.getElementById("toggleTeam2");
    const defaultShowR = false;
    if (!m) {
      document.body.classList.toggle("hideR", !defaultShowR);
      if (cb) cb.checked = defaultShowR;
      if (window._updateBars) window._updateBars();
      window._saveState();
      return;
    }
    const parsed = decodeState(m[1]);
    if (parsed && parsed.L && parsed.R) {
      console.log("Parsed state from URL:", parsed);
      window._bootLoading = true;
      const titleEl = document.getElementById("buildNameGlobal");
      if (titleEl)
        titleEl.value =
          parsed.title || parsed?.L?.name || parsed?.R?.name || "";
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

  document.getElementById("copyUrl").addEventListener("click", async () => {
    window._saveState();
    try {
      await navigator.clipboard.writeText(location.href);
      document.getElementById("copyMsg").textContent = "Copied!";
    } catch {
      document.getElementById("copyMsg").textContent = "URL in address bar";
    }
  });

  if ("serviceWorker" in navigator) {
    console.log("Registering service worker...");
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js");
    });
  }
})().catch((e) => fatal(`Boot failed: ${e.message}`));
