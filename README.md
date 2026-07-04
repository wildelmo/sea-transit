# Seattle Link 3D 🚈

A polished, interactive **3D map of the Seattle Link light rail** with real-time
train tracking. Fly around a cinematic 3D rendering of Puget Sound, watch every
train on the **1 Line** (Lynnwood → Seattle → SeaTac → Federal Way) and the
**2 Line** (Seattle → Mercer Island → Bellevue → Redmond) move live, click any
train to chase it with a follow camera, and pull up real-time arrival boards
for all 38 stations.

*(Part of the broader sea-transit project: real-time maps of the Seattle
area's transit — light rail first; ferries next.)*

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
npm run build      # static production build in dist/
```

No API key or backend required — the app is a fully static site that talks
directly to the OneBusAway Puget Sound API from the browser.

## Features

**Live tracking**
- Real-time vehicle positions from the OneBusAway Puget Sound API
  (Sound Transit's official open-data feed), polled every 10 s, snapped to the
  track and smoothly dead-reckoned between updates
- Schedule deviation (early/late), headsign, next stop, speed and progress for
  every train
- Real-time **arrival boards** per station (predicted vs scheduled)
- **Simulation fallback**: if the live feed is unreachable — or it's 3 AM and
  nothing is running — the app seamlessly switches to a realistic schedule
  simulation (true headways, acceleration curves, station dwells) and keeps
  probing the live feed to switch back. The badge at the top always tells you
  which mode you're in. In simulation you can run time at 1× / 10× / 60×.

**The trains**
- Procedurally modeled **Siemens S700-style Link LRV**: white body, black
  window mask sweeping into the raked windshield, Sound Transit teal/green
  wave livery, gray roof pods, pantograph, articulated three-section body
- Full consists (4 cars on the 1 Line) that visibly **bend through curves**
- Headlight beams and glowing windows at night, blob shadows, and ghosted
  "x-ray" rendering while trains run underground (DSTT, Beacon Hill,
  Mount Baker Ridge, downtown Bellevue)

**The world**
- Custom dark and daylight basemap styles (OpenFreeMap vector tiles), 3D
  building extrusions, optional 3D terrain, sky + atmosphere
- Elevated **concrete guideway with piers** — and none over Lake Washington,
  because the I-90 bridge floats, just like the real one
- Station platforms with canopies; tracks glow with line colors, tunnels
  render dashed
- Fleet-wide train dots at city zoom that cross-fade into the 3D models as
  you fly in

**Interaction**
- **Click a train → chase cam.** Three follow modes (chase / overhead / orbit,
  press `C`), scroll to adjust distance, drag to look around, `Esc` to release
- Click stations for live departures; searchable station list; per-line
  show/hide and fit-to-line
- Cinematic intro fly-in, day/night toggle (auto by Seattle clock), keyboard
  shortcuts (`?` in-app for the list)

## Data sources & API key

| What | Source |
|------|--------|
| Vehicle positions, arrivals, official track shapes | [OneBusAway Puget Sound API](https://developer.onebusaway.org/) (Sound Transit GTFS-RT) |
| Basemap vector tiles | [OpenFreeMap](https://openfreemap.org/) (no key required) |
| Terrain | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) |

The app ships with the public **`TEST`** demo key, which works out of the box
but is rate-limited and not meant for production use. For a personal key,
request one for free through Sound Transit's
[Open Transit Data program](https://www.soundtransit.org/help-contacts/business-information/open-transit-data-otd)
(OneBusAway Puget Sound keys are issued by email — see
[developer.onebusaway.org](https://developer.onebusaway.org/api/where)).
Then either paste it in **Settings ⚙ → OneBusAway API key** (stored in
localStorage) or open the app once with `?key=YOUR_KEY`.

### Track geometry

The repo ships with a hand-traced alignment of both lines (correct corridors:
I-5, the DSTT, the SODO busway, Beacon Hill tunnel, MLK Jr Way S, SR 99, the
I-90 floating bridge, the Bel-Red corridor) including per-segment
tunnel/surface/elevated classification. On startup the app fetches Sound
Transit's **official route shapes** from the OneBusAway API and hot-swaps them
in, so with connectivity the geometry is survey-accurate; offline, the baked-in
alignment keeps everything working.

## Architecture

```
src/
  main.js            boot, map, theme/terrain plumbing, animation loop, intro
  basemap.js         programmatic MapLibre style (night + day palettes)
  overlay.js         2D layers: route ribbons, tunnel dashes, stations, train dots
  geo.js             polyline math (distance param, snapping, bearings)
  data/network.js    line geometry + station metadata (upgradeable at runtime)
  layers/trains3d.js Three.js custom layer: instanced trains, guideway, piers,
                     platforms, headlights, shadows, selection ring, picking
  model/lrv.js       procedural Siemens S700-style LRV (two merged geometries)
  rt/oba.js          OneBusAway client (routes, vehicles, arrivals, shapes)
  rt/engine.js       unified live/simulation engine + interpolation
  ui.js              sidebar, panels, HUD, tooltips, modals, follow camera
```

Rendering notes: the whole fleet is drawn with four `InstancedMesh` pools
(cab/center sections × solid/ghost), so 30+ full trains cost a handful of draw
calls. Train picking is screen-space (projected car positions), which works at
every zoom including against the 2D dots.

## Testing

```bash
node scripts/smoke.mjs   # boots the app headless, asserts trains exist,
                         # saves smoke.png (set CHROMIUM_PATH if needed)
```

## Deploying

`npm run build` produces a fully static `dist/` — host it on GitHub Pages,
Netlify, S3, anywhere. Relative asset paths are already configured
(`base: './'`).

---

*Not affiliated with Sound Transit. Data courtesy of Sound Transit open data
via OneBusAway; map data © OpenStreetMap contributors.*
