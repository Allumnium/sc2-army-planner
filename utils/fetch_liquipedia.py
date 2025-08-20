# utils/fetch_liquipedia.py
# Scrape Liquipedia LotV unit tables -> rawdata.min.json
# No external deps. Python 3.8+.

import os, re, json, gzip, sys, html
from io import BytesIO
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from html.parser import HTMLParser

API = "https://liquipedia.net/starcraft2/api.php"
PAGE_TITLE = "Unit_Statistics_(Legacy_of_the_Void)"
USER_AGENT = "SC2-Planner/1.1 (contact: you@example.com)"
TIMEOUT = 30

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_PATH = os.path.join(ROOT_DIR, "rawdata.min.json")
TMP_DIR = os.path.join(ROOT_DIR, "tmp")
os.makedirs(TMP_DIR, exist_ok=True)

# Things we never want as units (abilities, weapons, temp spawns, variants)
BLACKLIST_UNITS = {
    "Auto-Turret", "MULE", "ATS Laser Battery", "ATA Laser Battery","Tank Mode, 90mm Cannons","Javelin Missile Launchers", "Lanzer Torpedoes",
    "Thor's Hammer", "Lexington Rockets","Resonance Coil", "Interceptor", "Broodling", "Flying Locust", "Landed Locust", "Changeling", "Larva", "Volatile Burst", "Talons",
    "Ventral Sacs Overlord","Nydus Worm","Overlord"
}

# A little safety net: words that should never appear in a real unit name
BLACKLIST_REGEX = re.compile(
    r"\b("
    r"laser|cannon|cannons|torpedo|torpedoes|rocket|rockets|hammer|talons|burst|coil|turret"
    r")\b",
    flags=re.I
)

def is_blacklisted_unit(name: str) -> bool:
    n = (name or "").strip()
    if not n:
        return True
    if n in BLACKLIST_UNITS:
        return True
    if BLACKLIST_REGEX.search(n):
        return True
    return False


def api_url(params: dict) -> str:
    return f"{API}?{urlencode(params)}"

def fetch_page_html(title: str) -> str:
    url = api_url({
        "action": "parse",
        "page": title,
        "prop": "text",
        "format": "json",
        "formatversion": "2",
    })
    req = Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Accept-Encoding": "gzip",  # Liquipedia requires gzip
    })
    with urlopen(req, timeout=TIMEOUT) as r:
        data = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            data = gzip.GzipFile(fileobj=BytesIO(data)).read()
    j = json.loads(data.decode("utf-8"))
    html_str = j["parse"]["text"]
    with open(os.path.join(TMP_DIR, "liquipedia_units.html"), "w", encoding="utf-8") as f:
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

def normalize_header(text: str) -> str:
    t = text.lower()
    t = t.replace(".", " ")
    t = re.sub(r"[^a-z0-9\s/+-]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()

    # map common variants
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
    if t.startswith("g ") and "dps" in t:
        return "g dps"
    if t.startswith("a ") and "dps" in t:
        return "a dps"
    if "bonus" in t and "dps" in t:
        return "bonus dps"
    if t == "attributes":
        return "attributes"
    return t

def looks_like_units_header(hs):
    cols = set(hs)
    must = 0
    if "name" in cols: must += 1
    if "supply" in cols: must += 1
    if "minerals" in cols or "vespene" in cols: must += 1
    if "time" in cols: must += 1
    if "life" in cols or "shields" in cols or "armor" in cols: must += 1
    return must >= 4

class WikiTableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []  # [{headers:[], rows:[], race:str}]
        self._in_table = False
        self._is_wikitable = False
        self._headers = []
        self._rows = []
        self._cur_row = None
        self._cur_cell = None
        self._capture_text = False
        self._cell_text = []
        self._race = None
        self._header_mode = False  # inside <th>

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)

        # race based on content containers
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

        if self._in_table and self._is_wikitable and tag in ("th","td"):
            self._cur_cell = []
            self._cell_text = []
            self._capture_text = True
            self._header_mode = (tag == "th")

        # harvest titles from icons/links inside headers
        if self._cur_cell is not None and self._header_mode:
            if tag in ("a","img","abbr"):
                t = attrs.get("title") or attrs.get("alt") or ""
                if not t and tag == "img":
                    src = attrs.get("src","")
                    if "Icon_Hitpoints" in src:
                        t = "Hitpoints"
                    elif "Icon_Shields" in src:
                        t = "Shields"
                if t:
                    self._cell_text.append(t)

    def handle_endtag(self, tag):
        if self._in_table and self._is_wikitable and tag in ("th","td"):
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
                    # first tr is header
                    # normalize headers
                    self._headers = [normalize_header(norm(c)) for c in self._cur_row]
                self._cur_row = None

        if tag == "table" and self._in_table:
            if self._is_wikitable and self._headers:
                self.tables.append({
                    "headers": self._headers,
                    "rows": self._rows,
                    "race": self._race,
                })
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
    r"([+-]?\d+(?:\.\d+)?)\s*(?:\([^)]+\))?\s*vs\s*([A-Za-z ]+)",
    flags=re.I,
)

def norm_type(s: str) -> str:
    t = (s or "").strip()
    t = re.sub(r"\s*\(.*$", "", t)  # strip trailing notes like "(Prismatic Alignment)"
    t = t.lower()
    t = re.sub(r"\s+", " ", t)
    return TYPE_MAP.get(t, None)

def parse_bonus_dps(cell: str) -> dict:
    """Parse a cell like '+7.45 vs Biological' (possibly multiple lines) -> {'bio': 7.45, ...}"""
    out = {}
    txt = (cell or "").replace("<br />", "\n")
    for m in _bonus_dps_re.finditer(txt):
        val = first_number(m.group(1), 0.0)
        ty = norm_type(m.group(2))
        if not ty:
            continue
        # keep the largest figure we see for that type
        if ty not in out or val > out[ty]:
            out[ty] = val
    return out


def parse_units(html_str: str):
    p = WikiTableParser()
    p.feed(html_str); p.close()

    unit_tables = [t for t in p.tables if looks_like_units_header(t["headers"])]

    out = {"T":{}, "P":{}, "Z":{}}
    total = 0
    for t in unit_tables:
        headers = t["headers"]
        for r in t["rows"]:
            if not r: 
                continue
            row_map = {}
            for i, h in enumerate(headers):
                v = r[i] if i < len(r) else ""
                row_map[h] = norm(v)

            name = row_map.get("name") or ""
            name = re.sub(r"\s*\(.*?\)\s*$", "", name).strip()
            if not name:
                continue
            if is_blacklisted_unit(name):
                continue

            race = t.get("race")
            key = {"Terran":"T","Protoss":"P","Zerg":"Z"}.get(race or "", None)
            if not key:
                continue

            # attributes
            attrs_cell = row_map.get("attributes","")
            attrs = [a.strip() for a in re.split(r",\s*", attrs_cell) if a.strip()]

            # numerics
            sup  = first_number(row_map.get("supply","0"))
            m    = first_number(row_map.get("minerals","0"))
            g    = first_number(row_map.get("vespene","0"))
            tsec = first_number(row_map.get("time","0"))
            hp   = first_number(row_map.get("life","0"))
            sh   = first_number(row_map.get("shields","0"))
            ar   = first_number(row_map.get("armor","0"))

            # DPS (as published)
            dpsG = first_number(row_map.get("g dps","0"))
            dpsA = first_number(row_map.get("a dps","0"))
            dps  = max(dpsG, dpsA, 0.0)

            # Parse per-type Bonus DPS if present
            bonus_dps_map = parse_bonus_dps(row_map.get("bonus dps",""))

            # Build "dpsVs" = base dps + bonus dps (using the bigger of ground/air as base)
            dps_vs_map = { ty: dps + bonus for ty, bonus in bonus_dps_map.items() }

            u = {
                "m": m, "g": g, "t": tsec,
                "dps": dps, "dpsMax": dps,
                "dpsG": dpsG, "dpsA": dpsA,
                "hp": hp, "sh": sh, "armor": ar,
                "sup": sup,
                "tags": attrs, "flags": {}, "attrs": [], "pref": []
            }

            if bonus_dps_map:
                u["bonusDps"] = bonus_dps_map
                u["dpsVs"] = dps_vs_map
                # flat convenience fields (only set when present)
                alias = {
                    "light": "dpsVsLight",
                    "armored": "dpsVsArmored",
                    "bio": "dpsVsBio",
                    "mech": "dpsVsMech",
                    "massive": "dpsVsMassive",
                    "psionic": "dpsVsPsionic",
                    "shields": "dpsVsShields",
                    "buildings": "dpsVsBuildings",
                }
                for k, fname in alias.items():
                    if k in dps_vs_map:
                        u[fname] = dps_vs_map[k]

            out[key][name] = u
            total += 1

    return out, total


def main():
    print("Fetching unit tables from Liquipedia…")
    html_str = fetch_page_html(PAGE_TITLE)
    data, count = parse_units(html_str)
    if count <= 0:
        print("Could not parse any units. The page layout may have changed.")
        print(f"See {os.path.join(TMP_DIR, 'liquipedia_units.html')} for the raw HTML.")
        sys.exit(1)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",",":"))

    print(f"Wrote {OUT_PATH} with {count} units.")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", e)
        sys.exit(2)
