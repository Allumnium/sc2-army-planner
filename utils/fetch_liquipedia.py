# utils/fetch_liquipedia.py
# Scrape Liquipedia LotV unit tables -> data.js
# No external deps. Python 3.8+.

import os, re, json, gzip, sys, html
from io import BytesIO
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from html.parser import HTMLParser

API = "https://liquipedia.net/starcraft2/api.php"
PAGE_TITLE = "Unit_Statistics_(Legacy_of_the_Void)"
USER_AGENT = "SC2-Planner/1.1 (https://allumnium.github.io/sc2-army-planner) (contact: grassblade-dev@gmail.com)"
TIMEOUT = 30

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_PATH = os.path.join(ROOT_DIR, "data.js")  # Changed to data.js
TMP_DIR = os.path.join(ROOT_DIR, "tmp")
os.makedirs(TMP_DIR, exist_ok=True)

# Things we never want as units (abilities, weapons, temp spawns, variants)
BLACKLIST_UNITS = {
    "Auto-Turret",
    "MULE",
    "ATS Laser Battery",
    "ATA Laser Battery",
    "Tank Mode, 90mm Cannons",
    "Javelin Missile Launchers",
    "Lanzer Torpedoes",
    "Thor's Hammer",
    "Lexington Rockets",
    "Resonance Coil",
    "Interceptor",
    "Broodling",
    "Flying Locust",
    "Landed Locust",
    "Changeling",
    "Larva",
    "Volatile Burst",
    "Talons",
    "Ventral Sacs Overlord",
    "Nydus Worm",
    "Overlord",
}
BLACKLIST_REGEX = re.compile(
    r"\b(laser|cannon|cannons|torpedo|torpedoes|rocket|rockets|hammer|talons|burst|coil|turret)\b",
    re.I,
)


def is_blacklisted_unit(name: str) -> bool:
    n = (name or "").strip()
    return (not n) or (n in BLACKLIST_UNITS) or bool(BLACKLIST_REGEX.search(n))


def api_url(params: dict) -> str:
    return f"{API}?{urlencode(params)}"


def fetch_page_html(title: str) -> str:
    url = api_url(
        {
            "action": "parse",
            "page": title,
            "prop": "text",
            "format": "json",
            "formatversion": "2",
        }
    )
    req = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
        },
    )
    with urlopen(req, timeout=TIMEOUT) as r:
        data = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            data = gzip.GzipFile(fileobj=BytesIO(data)).read()
    j = json.loads(data.decode("utf-8"))
    html_str = j["parse"]["text"]
    with open(
        os.path.join(TMP_DIR, "liquipedia_units.html"), "w", encoding="utf-8"
    ) as f:
        f.write(html_str)
    return html_str


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip()


_num = re.compile(r"-?\d+(?:\.\d+)?")


def first_number(s: str, default=0.0) -> float:
    if not s:
        return default
    m = _num.search(s.replace(",", ""))
    return float(m.group(0)) if m else default


def estimate_micro(name: str) -> int:
    n = name.lower()
    very_easy = {
        "zealot",
        "zergling",
        "hellbat",
        "immortal",
        "ultralisk",
    }
    easy = {
        "marine",
        "hydralisk",
        "colossus",
        "archon",
        "thor",
        "roach",
    }
    hard = {
        "banshee",
        "phoenix",
        "oracle",
        "ghost",
        "adept",
        "widow mine",
        "infestor",
        "sentry",
        "stalker",
        "high templar",
        "medivac",
        "warp prism",
        "liberator",
        "baneling",
        "cyclone",
        "reaper",
        "siege tank",
    }
    very_hard = {"mothership", "swarm host", "lurker", "disruptor", "raven", "viper"}
    if n in very_hard:
        return 5
    if n in hard:
        return 4
    if n in easy:
        return 2
    if n in very_easy:
        return 1
    return 3


def normalize_header(text: str) -> str:
    t = text.lower().replace(".", " ")
    t = re.sub(r"[^a-z0-9\s/+-]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    if "game speed" in t or "buildtime" in t or t == "time" or "/ wg" in t:
        return "time"
    if "supply" in t or "psi" in t or "control" in t:
        return "supply"
    if "minerals" in t:
        return "minerals"
    if "vespene" in t or t == "gas":
        return "vespene"
    if "hitpoints" in t or t == "hp" or t == "life":
        return "life"
    if "shield" in t:
        return "shields"
    if "armor" in t:
        return "armor"
    if t == "name" or "unit" in t:
        return "name"
    # Keep G/A DPS distinct
    if t.startswith("g ") and "dps" in t:
        return "g dps"
    if t.startswith("a ") and "dps" in t:
        return "a dps"
    # Keep G/A Attack distinct so we can detect Splash
    if t.startswith("g ") and "attack" in t:
        return "g attack"
    if t.startswith("a ") and "attack" in t:
        return "a attack"
    if "bonus" in t and "dps" in t:
        return "bonus dps"
    if t == "attributes":
        return "attributes"
    if "attack" in t:
        return "attack name"
    return t


def looks_like_units_header(hs):
    cols = set(hs)
    must = 0
    if "name" in cols:
        must += 1
    if "supply" in cols:
        must += 1
    if "minerals" in cols or "vespene" in cols:
        must += 1
    if "time" in cols:
        must += 1
    if "life" in cols or "shields" in cols or "armor" in cols:
        must += 1
    return must >= 4


def header_row_map(table_dict):
    return table_dict["headers"][:]


def row_to_map(row_cells, headers):
    row = [norm(c) for c in (row_cells or [])]
    if len(row) == len(headers) - 1 and headers and headers[0] == "name":
        row = [""] + row
    if len(row) < len(headers):
        row += [""] * (len(headers) - len(row))
    return {headers[i]: row[i] for i in range(len(headers))}


def first_text(v) -> str:
    return norm(v) if isinstance(v, str) else ""


def split_csv(cell: str):
    s = norm(cell)
    if not s:
        return []
    parts = re.split(r",|/|<br\s*/?>", s, flags=re.I)
    return [norm(p) for p in parts if norm(p)]


class WikiTableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self._in_table = False
        self._is_wikitable = False
        self._headers = []
        self._rows = []
        self._cur_row = None
        self._cur_cell = None
        self._capture_text = False
        self._cell_text = []
        self._race = None
        self._header_mode = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "div" and "class" in attrs:
            cls = attrs["class"]
            if "content1" in cls:
                self._race = "Protoss"
            elif "content2" in cls:
                self._race = "Terran"
            elif "content3" in cls:
                self._race = "Zerg"
        if tag == "table":
            cls = attrs.get("class", "")
            self._in_table = True
            self._is_wikitable = "wikitable" in cls
        if self._in_table and self._is_wikitable and tag == "tr":
            self._cur_row = []
        if self._in_table and self._is_wikitable and tag in ("th", "td"):
            self._cur_cell = []
            self._cell_text = []
            self._capture_text = True
            self._header_mode = tag == "th"
        if self._cur_cell is not None and self._header_mode:
            if tag in ("a", "img", "abbr"):
                t = attrs.get("title") or attrs.get("alt") or ""
                if not t and tag == "img":
                    src = attrs.get("src", "")
                    if "Icon_Hitpoints" in src:
                        t = "Hitpoints"
                    elif "Icon_Shields" in src:
                        t = "Shields"
                if t:
                    self._cell_text.append(t)

    def handle_endtag(self, tag):
        if self._in_table and self._is_wikitable and tag in ("th", "td"):
            text = norm(" ".join(self._cell_text) or " ".join(self._cur_cell or []))
            self._cur_row.append(text)
            self._cur_cell = None
            self._cell_text = []
            self._capture_text = False
            self._header_mode = False
        if self._in_table and self._is_wikitable and tag == "tr":
            if self._cur_row is not None:
                if self._headers:
                    self._rows.append(self._cur_row)
                else:
                    self._headers = [normalize_header(norm(c)) for c in self._cur_row]
                self._cur_row = None
        if tag == "table" and self._in_table:
            if self._is_wikitable and self._headers:
                self.tables.append(
                    {"headers": self._headers, "rows": self._rows, "race": self._race}
                )
            self._in_table = False
            self._is_wikitable = False
            self._headers = []
            self._rows = []
            self._cur_row = None

    def handle_data(self, data):
        if self._capture_text:
            self._cell_text.append(data)


TYPE_MAP = {
    "light": "light",
    "armored": "armored",
    "biological": "bio",
    "mechanical": "mech",
    "massive": "massive",
    "psionic": "psionic",
    "shields": "shields",
    "shield": "shields",
    "buildings": "buildings",
    "building": "buildings",
}

_bonus_dps_re = re.compile(
    r"([+-]?\d+(?:\.\d+)?)\s*(?:\([^)]+\))?\s*vs\s*([A-Za-z ]+)", re.I
)


def norm_type(s: str) -> str:
    t = (s or "").strip()
    t = re.sub(r"\s*\(.*$", "", t).lower()
    t = re.sub(r"\s+", " ", t)
    return TYPE_MAP.get(t, None)


def parse_bonus_dps(cell: str) -> dict:
    out = {}
    txt = (cell or "").replace("<br />", "\n")
    for m in _bonus_dps_re.finditer(txt):
        val = first_number(m.group(1), 0.0)
        ty = norm_type(m.group(2))
        if not ty:
            continue
        if ty not in out or val > out[ty]:
            out[ty] = val
    return out


def _parse_table_units(table_dict, race_code):
    headers = header_row_map(table_dict)
    if not looks_like_units_header(headers):
        return {}
    out = {}
    last_name = None
    for row in table_dict["rows"]:
        row_map = row_to_map(row, headers)
        candidate = first_text(row_map.get("name"))
        name = candidate or last_name
        if not name:
            continue
        if not candidate:
            pass
        else:
            last_name = name
        if candidate and is_blacklisted_unit(candidate):
            continue
        u = out.get(name)
        if not u:
            sup = first_number(row_map.get("supply"))
            mins = first_number(row_map.get("minerals"))
            gas = first_number(row_map.get("vespene"))
            tsec = first_number(row_map.get("time"))
            armor = first_number(row_map.get("armor"))
            hp = first_number(row_map.get("life"))
            sh = first_number(row_map.get("shields"))
            attrs = split_csv(row_map.get("attributes"))
            u = {
                "sup": sup,
                "m": mins,
                "g": gas,
                "t": tsec,
                "armor": armor,
                "hp": hp,
                "sh": sh,
                "attrs": attrs,
                "tags": [],
                "dpsG": 0.0,
                "dpsA": 0.0,
                "dps": 0.0,
                "dpsMax": 0.0,
                "micro": estimate_micro(name),
            }
            out[name] = u
        g_dps = first_number(row_map.get("g dps"))
        a_dps = first_number(row_map.get("a dps"))
        if g_dps:
            u["dpsG"] = max(u["dpsG"], g_dps)
        if a_dps:
            u["dpsA"] = max(u["dpsA"], a_dps)
        g_attack = first_text(row_map.get("g attack"))
        a_attack = first_text(row_map.get("a attack"))
        attack_any = " ".join([g_attack, a_attack]).lower()
        if "splash" in attack_any:
            u["splash"] = True
        if name.lower() == "widow mine":
            gm = first_number(g_attack, 0.0)
            am = first_number(a_attack, 0.0)
            if gm:
                u["dpsG"] = max(u["dpsG"], gm)
            if am:
                u["dpsA"] = max(u["dpsA"], am)
        u["dps"] = max(u["dpsG"], u["dpsA"])
        u["dpsMax"] = u["dps"]
        bdps = parse_bonus_dps(row_map.get("bonus dps"))
        if bdps:
            store = u.setdefault("bonusDps", {})
            for ty, val in bdps.items():
                if ty not in store or val > store[ty]:
                    store[ty] = val
        bhit = parse_bonus_dps(row_map.get("bonus"))
        if bhit:
            store = u.setdefault("bonus", {})
            for ty, val in bhit.items():
                if ty not in store or val > store[ty]:
                    store[ty] = val
    return out


def apply_transform_costs(groups):
    """Make morphers cost = base + morph (values on Liquipedia are morph-only)."""
    Z = groups["Z"]
    pairs = {
        "Ravager": "Roach",
        "Lurker": "Hydralisk",
        "Brood Lord": "Corruptor",
    }
    for child, base in pairs.items():
        if child in Z and base in Z:
            Z[child]["m"] = (Z[child].get("m") or 0) + (Z[base].get("m") or 0)
            Z[child]["g"] = (Z[child].get("g") or 0) + (Z[base].get("g") or 0)


def apply_overrides(groups):
    """Hardcode/patch known values."""
    Z = groups["Z"]
    if "Baneling" in Z:
        b = Z["Baneling"]
        b["dpsG"] = 16.0
        b["dpsA"] = 0.0
        b["dps"] = 16.0
        b["dpsMax"] = 16.0
        b.setdefault("bonusDps", {})["light"] = 19.0
        b["pref"] = ["light"]
    T = groups["T"]
    if "Widow Mine" in T:
        wm = T["Widow Mine"]
        wm["dpsG"] = 15.0
        wm["dpsA"] = 15.0
        wm["dps"] = 15.0
        wm["dpsMax"] = 15.0
        wm.setdefault("bonusDps", {})["shield"] = 22.0
        wm["pref"] = ["shield"]
    P = groups["P"]
    if "Archon" in P:
        a = P["Archon"]
        a["m"] = 100
        a["g"] = 300


def apply_splash_multiplier(groups):
    """Any unit marked as Splash gets its DPS multiplied slightly."""
    for bucket in groups.values():
        for u in bucket.values():
            if u.get("splash"):
                for k in ("dpsG", "dpsA"):
                    if u.get(k):
                        u[k] = u[k] * 1.2
                u["dps"] = max(u.get("dpsG", 0.0), u.get("dpsA", 0.0))
                u["dpsMax"] = u["dps"]


def parse_units(html_str):
    """Parse all tables and return grouped dict {T:{},P:{},Z:{}} and a total count."""
    p = WikiTableParser()
    p.feed(html_str)
    groups = {"T": {}, "P": {}, "Z": {}}
    for tbl in p.tables:
        race = (tbl.get("race") or "").strip().lower()
        race_code = {"protoss": "P", "terran": "T", "zerg": "Z"}.get(race, "")
        if not race_code:
            continue
        units = _parse_table_units(tbl, race_code)
        groups[race_code].update(units)
    apply_transform_costs(groups)
    apply_overrides(groups)
    apply_splash_multiplier(groups)
    total = sum(len(bucket) for bucket in groups.values())
    return groups, total


def main():
    print("Fetching unit tables from Liquipedia…")
    html_str = fetch_page_html(PAGE_TITLE)
    data, count = parse_units(html_str)
    if count <= 0:
        print("Could not parse any units. The page layout may have changed.")
        print(f"See {os.path.join(TMP_DIR, 'liquipedia_units.html')} for the raw HTML.")
        sys.exit(1)

    # Format output as a JavaScript file
    js_output = f"""
export const T = {json.dumps(data['T'], indent=2)};
export const P = {json.dumps(data['P'], indent=2)};
export const Z = {json.dumps(data['Z'], indent=2)};
"""
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(js_output)

    print(f"Wrote {OUT_PATH} with {count} units.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", e)
        sys.exit(2)
