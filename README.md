# SC2 Economy & Army Planner — Dual

Plan steady-state production and visualize the army you can actually field at a given income. Compare two teams side-by-side, tune upgrades/parameters, and share a prefilled build as a URL.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Live demo:** https\://allumnium.github.io/sc2-army-planner

<img width="1900" height="924" alt="image" src="https://github.com/user-attachments/assets/a939a13e-354c-4234-b1a9-834f1f7a1ed4" />

## Features

- **Dual panels**: Team 1 vs Team 2 for quick “what if” comparisons.
- **Income bars with overspend**: Minerals/Gas bars show income vs planned spend; red indicates overspend.
- **Units table**: Add any unit, set “constant production” streams, see minerals/min & gas/min.
- **Army summary and detailed analysis**
- **Qualities**: Tankiness, Damage, Utility, Micro Requirement, Easily Countered, Cost.
- **Counters & bonus profile**: Common counters vs your comp; where your DPS is focused (vs Light/Armored/Air/etc.).
- **Parameters**: Worker rates, gas weights, geysers/base, MULE math, micro efficiency, and more.
- **Sharable state**: Build is encoded in the URL hash—use **“Share Army URL”**.

---

## Roadmap / Ideas

- save/load named presets to localStorage
- UI improvements
  - color the total cost text
  - get rid of the summary text
  - combine totals
  - get rid of Damage metric, just DPS vs bars
- condense the url save data and make the build name part of the URL
- review or remove 'counterability' bars
- add "recommended buildings" section in unit production (aka, 3x Barracks + reactor, 3 Hatcheries + injector queens)

---

## Contributing

Bug reports and PRs are appreciated.

---

## License

MIT © 2025 \<Your Name or Org> — see [LICENSE](LICENSE).

**Trademark notice:**
_StarCraft II and all related names are trademarks of Blizzard Entertainment. This project is fan-made and is not affiliated with or endorsed by Blizzard._
_Fan-made tool. Not affiliated with or endorsed by Blizzard Entertainment. StarCraft II and unit names are trademarks of Blizzard._
