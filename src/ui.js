// All DOM UI: status pill, HUD, sidebar, detail panels, tooltips, modals,
// keyboard shortcuts, and the cinematic follow camera.

import { network } from './data/network.js';
import { clamp, lerp, lerpAngle, damp } from './geo.js';
import * as oba from './rt/oba.js';

const $ = (sel) => document.querySelector(sel);

const MPH = 2.23694;

function fmtDelay(devSec) {
  if (devSec == null) return ['—', ''];
  if (devSec > 90) return [`+${Math.round(devSec / 60)} min`, 'delay-late'];
  if (devSec < -90) return [`−${Math.round(-devSec / 60)} min`, 'delay-early'];
  return ['on time', 'delay-ok'];
}

function fmtEta(ms) {
  const min = Math.round(ms / 60000);
  if (min <= 0) return 'Due';
  return `${min} min`;
}

function chip(line) {
  return `<span class="line-chip l${line}">${line}</span>`;
}

export class FollowCam {
  constructor(map, engine) {
    this.map = map;
    this.engine = engine;
    this.active = false;
    this.mode = 'chase'; // chase | overhead | orbit
    this.trainId = null;
    this.zoomOffset = 0;
    this.bearingOffset = 0;
    this._orbitAngle = 0;
    this.cam = null;
    this._onWheel = (e) => {
      e.preventDefault();
      this.zoomOffset = clamp(this.zoomOffset - Math.sign(e.deltaY) * 0.22, -3.2, 1.6);
    };
    this._drag = null;
    this._onDown = (e) => {
      this._drag = { x: e.clientX, b: this.bearingOffset };
    };
    this._onMove = (e) => {
      if (!this._drag) return;
      this.bearingOffset = this._drag.b - (e.clientX - this._drag.x) * 0.35;
    };
    this._onUp = () => {
      this._drag = null;
    };
  }

  start(trainId) {
    this.trainId = trainId;
    if (this.active) return;
    this.active = true;
    this.zoomOffset = 0;
    this.bearingOffset = 0;
    const c = this.map.getCenter();
    this.cam = {
      lng: c.lng,
      lat: c.lat,
      zoom: this.map.getZoom(),
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch(),
    };
    for (const h of ['dragPan', 'dragRotate', 'scrollZoom', 'doubleClickZoom', 'keyboard']) {
      this.map[h]?.disable();
    }
    const canvas = this.map.getCanvas();
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    $('#follow-banner').classList.remove('hidden');
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.trainId = null;
    for (const h of ['dragPan', 'dragRotate', 'scrollZoom', 'doubleClickZoom', 'keyboard']) {
      this.map[h]?.enable();
    }
    const canvas = this.map.getCanvas();
    canvas.removeEventListener('wheel', this._onWheel);
    canvas.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    $('#follow-banner').classList.add('hidden');
  }

  cycleMode() {
    const modes = ['chase', 'overhead', 'orbit'];
    this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
    $('#follow-mode').textContent = this.mode;
  }

  update(dt) {
    if (!this.active) return;
    const tr = this.engine.getTrain(this.trainId);
    if (!tr) {
      this.stop();
      return;
    }
    const ctx = this.engine.trainContext(tr);
    const heading =
      ctx.line.path.bearingAt(tr.s, 40) + (tr.dir < 0 ? 180 : 0);

    let target;
    if (this.mode === 'chase') {
      target = { zoom: 16.4, pitch: 62, bearing: heading + this.bearingOffset };
    } else if (this.mode === 'overhead') {
      target = { zoom: 14.6, pitch: 22, bearing: this.bearingOffset };
    } else {
      this._orbitAngle += dt * 9;
      target = { zoom: 16.1, pitch: 58, bearing: this._orbitAngle + this.bearingOffset };
    }
    target.zoom += this.zoomOffset;

    const k = damp(2.4, dt);
    const kSlow = damp(1.6, dt);
    this.cam.lng = lerp(this.cam.lng, ctx.pt.lng, k);
    this.cam.lat = lerp(this.cam.lat, ctx.pt.lat, k);
    this.cam.zoom = lerp(this.cam.zoom, target.zoom, kSlow);
    this.cam.pitch = lerp(this.cam.pitch, target.pitch, kSlow);
    this.cam.bearing = lerpAngle(this.cam.bearing, target.bearing, kSlow);
    this.map.jumpTo({
      center: [this.cam.lng, this.cam.lat],
      zoom: this.cam.zoom,
      pitch: this.cam.pitch,
      bearing: this.cam.bearing,
    });
  }
}

export function initUI(app) {
  const { map, engine, layer } = app;

  const followCam = new FollowCam(map, engine);
  app.followCam = followCam;

  let detailKind = null; // 'train' | 'station'
  let detailId = null;
  let detailTimer = null;
  let arrivalsTimer = null;

  // ---------- status pill / HUD ----------

  function renderStatus() {
    const pill = $('#status-pill');
    const text = $('#status-text');
    pill.classList.remove('live', 'sim', 'err');
    if (engine.mode === 'live') {
      pill.classList.add('live');
      text.textContent = 'LIVE · Sound Transit';
    } else if (engine.mode === 'sim') {
      pill.classList.add('sim');
      text.textContent =
        engine.simReason === 'no-service'
          ? 'SIMULATION · no trains in service right now'
          : 'SIMULATION · live feed unreachable';
    } else {
      text.textContent = 'Connecting to live data…';
    }
    document.querySelectorAll('.sim-only').forEach((el) => {
      el.classList.toggle('hidden', engine.mode !== 'sim');
    });
  }
  engine.addEventListener('mode', renderStatus);
  renderStatus();

  const clockFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  setInterval(() => {
    $('#hud-clock').textContent = clockFmt.format(new Date()) + ' PT';
    const n = engine.trains.size;
    $('#hud-trains').textContent = `${n} train${n === 1 ? '' : 's'}`;
    const age = engine.dataAgeSec();
    $('#hud-age').textContent =
      age == null
        ? engine.mode === 'sim'
          ? 'schedule simulation'
          : '—'
        : `updated ${Math.max(0, Math.round(age))}s ago`;
  }, 1000);

  document.querySelectorAll('#hud .speed').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#hud .speed').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      engine.setSimSpeed(Number(btn.dataset.speed));
    });
  });

  // ---------- sidebar ----------

  document.querySelectorAll('.sidebar-tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tabs .tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $(`#tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  $('#sidebar-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('collapsed');
  });
  if (window.innerWidth < 900) $('#sidebar').classList.add('collapsed');

  function renderTrainList() {
    const wrap = $('#train-list');
    const trains = [...engine.trains.values()].sort(
      (a, b) => a.line.localeCompare(b.line) || String(a.id).localeCompare(String(b.id))
    );
    $('#train-list-hint').classList.toggle('hidden', trains.length > 0);
    const frag = document.createDocumentFragment();
    for (const tr of trains) {
      if (!app.lineVisible[tr.line]) continue;
      const ctx = engine.trainContext(tr);
      const [delayTxt, delayCls] = fmtDelay(tr.source === 'live' ? tr.deviation : 0);
      const btn = document.createElement('button');
      btn.className = 'row-item' + (tr.id === engine.selectedId ? ' selected' : '');
      btn.innerHTML = `
        ${chip(tr.line)}
        <span class="grow">
          <span class="title">→ ${tr.headsign ?? '…'}</span>
          <span class="sub">${ctx.next ? 'next: ' + ctx.next.name : ctx.prev ? 'at ' + ctx.prev.name : ''}</span>
        </span>
        <span class="meta">${Math.round((tr.dispSpeed ?? 0) * MPH)} mph<br><span class="${delayCls}">${delayTxt}</span></span>`;
      btn.addEventListener('click', () => selectTrain(tr.id, { fly: true }));
      frag.appendChild(btn);
    }
    wrap.replaceChildren(frag);
  }
  engine.addEventListener('trains', renderTrainList);
  setInterval(renderTrainList, 5000);

  function renderStationList(filter = '') {
    const wrap = $('#station-list');
    const q = filter.trim().toLowerCase();
    const frag = document.createDocumentFragment();
    const sorted = [...network.stations].sort((a, b) => b.lat - a.lat);
    for (const st of sorted) {
      if (q && !st.name.toLowerCase().includes(q) && !st.area.toLowerCase().includes(q)) continue;
      const btn = document.createElement('button');
      btn.className = 'row-item';
      btn.innerHTML = `
        ${st.lines.map(chip).join('')}
        <span class="grow">
          <span class="title">${st.name}</span>
          <span class="sub">${st.area}</span>
        </span>`;
      btn.addEventListener('click', () => showStation(st.id, { fly: true }));
      frag.appendChild(btn);
    }
    wrap.replaceChildren(frag);
  }
  renderStationList();
  $('#station-filter').addEventListener('input', (e) => renderStationList(e.target.value));

  function renderLineList() {
    const wrap = $('#line-list');
    const frag = document.createDocumentFragment();
    for (const line of Object.values(network.lines)) {
      const first = line.stations[0].name;
      const last = line.stations[line.stations.length - 1].name;
      const row = document.createElement('div');
      row.className = 'line-row';
      row.innerHTML = `
        ${chip(line.id)}
        <span class="name">${line.name}<br><span class="ends">${first} ⇄ ${last}</span></span>
        <label class="switch"><input type="checkbox" ${app.lineVisible[line.id] ? 'checked' : ''} data-line="${line.id}"><span class="knob"></span></label>`;
      row.querySelector('.name').addEventListener('click', () => {
        const coords = line.path.coords();
        const lngs = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        followCam.stop();
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 90, pitch: 45, bearing: line.id === '2' ? 24 : -12, duration: 2400 }
        );
      });
      row.querySelector('input').addEventListener('change', (e) => {
        app.setLineVisible(line.id, e.target.checked);
        renderTrainList();
      });
      frag.appendChild(row);
    }
    wrap.replaceChildren(frag);
  }
  renderLineList();

  // ---------- detail panel ----------

  function closeDetail() {
    $('#detail').classList.add('hidden');
    clearInterval(detailTimer);
    clearInterval(arrivalsTimer);
    detailKind = null;
    detailId = null;
    if (app.selectedStationId != null) {
      map.setFeatureState({ source: 'stations', id: app.selectedStationId }, { selected: false });
      app.selectedStationId = null;
    }
  }
  $('#detail-close').addEventListener('click', () => {
    closeDetail();
    engine.selectedId = null;
    followCam.stop();
  });

  function renderTrainDetail() {
    const tr = engine.getTrain(detailId);
    if (!tr) {
      closeDetail();
      return;
    }
    const ctx = engine.trainContext(tr);
    const [delayTxt, delayCls] = fmtDelay(tr.source === 'live' ? tr.deviation : 0);
    const speed = Math.round((tr.dispSpeed ?? 0) * MPH);
    const alt = ctx.pt.alt;
    const gradeTxt = alt < -1 ? 'Tunnel' : alt >= 2.5 ? 'Elevated' : 'At grade';
    const following = followCam.active && followCam.trainId === tr.id;
    const age =
      tr.source === 'live' && tr.lastUpdate
        ? Math.max(0, Math.round((Date.now() - tr.lastUpdate) / 1000))
        : null;
    $('#detail-body').innerHTML = `
      <div class="detail-head">${chip(tr.line)}<h2>→ ${tr.headsign ?? '…'}</h2></div>
      <div class="detail-sub">${tr.source === 'live' ? `Vehicle ${String(tr.id).replace(/^40_/, '')} · live` : 'Simulated service'}${age != null ? ` · seen ${age}s ago` : ''}</div>
      <div class="stat-grid">
        <div class="stat"><div class="k">Status</div><div class="v"><span class="${delayCls}">${delayTxt}</span></div></div>
        <div class="stat"><div class="k">Speed</div><div class="v">${speed} mph</div></div>
        <div class="stat"><div class="k">Guideway</div><div class="v small">${gradeTxt}</div></div>
        <div class="stat"><div class="k">Consist</div><div class="v small">${tr.cars} cars</div></div>
      </div>
      <div class="next-stop-bar">
        <div class="lbl">Progress to next stop</div>
        <div class="progress"><div class="fill" style="width:${Math.round(ctx.progress * 100)}%"></div></div>
        <div class="stops-flank"><span>${ctx.prev?.name ?? '—'}</span><b>${ctx.next?.name ?? 'Terminus'}</b></div>
      </div>
      <div class="detail-actions">
        <button id="act-follow" class="${following ? 'follow-active' : ''}">${following ? '◉ Following' : 'Follow'}</button>
        <button id="act-fly">Fly to</button>
      </div>`;
    $('#act-follow').addEventListener('click', () => {
      if (followCam.active && followCam.trainId === tr.id) followCam.stop();
      else startFollow(tr.id);
      renderTrainDetail();
    });
    $('#act-fly').addEventListener('click', () => flyToTrain(tr));
  }

  function showTrainDetail(id) {
    detailKind = 'train';
    detailId = id;
    clearInterval(detailTimer);
    clearInterval(arrivalsTimer);
    $('#detail').classList.remove('hidden');
    renderTrainDetail();
    detailTimer = setInterval(() => {
      if (detailKind === 'train') renderTrainDetail();
    }, 1000);
  }

  async function renderArrivals(st) {
    const board = $('#detail .board');
    if (!board) return;
    const arrivals = await engine.getArrivals(st);
    if (detailKind !== 'station' || detailId !== st.id) return;
    if (!arrivals || arrivals.length === 0) {
      board.innerHTML = `<p class="board-note">${
        arrivals === null
          ? 'Waiting for live arrival data…'
          : 'No upcoming trains in the next hour.'
      }</p>`;
      return;
    }
    board.innerHTML = arrivals
      .map((a) => {
        const lineId = a.line ?? (a.route.includes('2') ? '2' : '1');
        const due = a.etaMs < 60000;
        return `<div class="board-row">${chip(lineId)}<span class="dest">${a.headsign}</span>
          <span class="eta ${due ? 'due' : ''} ${a.predicted ? '' : 'sched'}">${fmtEta(a.etaMs)}</span></div>`;
      })
      .join('');
    board.insertAdjacentHTML(
      'beforeend',
      `<p class="board-note">${engine.mode === 'live' ? 'Real-time predictions · OneBusAway' : 'Estimated from simulated schedule'}</p>`
    );
  }

  function showStation(id, { fly = false } = {}) {
    const st = network.stations.find((s) => s.id === id);
    if (!st) return;
    if (app.selectedStationId != null) {
      map.setFeatureState({ source: 'stations', id: app.selectedStationId }, { selected: false });
    }
    app.selectedStationId = id;
    map.setFeatureState({ source: 'stations', id }, { selected: true });
    detailKind = 'station';
    detailId = id;
    clearInterval(detailTimer);
    clearInterval(arrivalsTimer);
    $('#detail').classList.remove('hidden');
    const gradeTxt = st.alt < -1 ? 'Underground station' : st.alt >= 2.5 ? 'Elevated station' : 'At-grade station';
    $('#detail-body').innerHTML = `
      <div class="detail-head">${st.lines.map(chip).join('')}<h2>${st.name}</h2></div>
      <div class="detail-sub">${st.area} · ${gradeTxt} · opened ${st.opened}</div>
      <div class="next-stop-bar"><div class="lbl">Next departures</div></div>
      <div class="board"><p class="board-note">Loading arrivals…</p></div>
      <div class="detail-actions"><button id="act-flysta">Fly to station</button></div>`;
    $('#act-flysta').addEventListener('click', () => flyToStation(st));
    renderArrivals(st);
    arrivalsTimer = setInterval(() => renderArrivals(st), 20000);
    if (fly) flyToStation(st);
  }

  function flyToStation(st) {
    followCam.stop();
    map.flyTo({
      center: [st.lng, st.lat],
      zoom: 15.6,
      pitch: 58,
      bearing: map.getBearing(),
      duration: 2200,
      essential: true,
    });
  }

  function flyToTrain(tr) {
    const ctx = engine.trainContext(tr);
    map.flyTo({
      center: [ctx.pt.lng, ctx.pt.lat],
      zoom: 16.2,
      pitch: 60,
      duration: 1900,
      essential: true,
    });
  }

  function startFollow(id) {
    engine.selectedId = id;
    followCam.start(id);
    const tr = engine.getTrain(id);
    $('#follow-label').textContent = tr ? `Following → ${tr.headsign ?? tr.id}` : 'Following';
    $('#follow-mode').textContent = followCam.mode;
  }

  function selectTrain(id, { fly = false, follow = false } = {}) {
    engine.selectedId = id;
    showTrainDetail(id);
    renderTrainList();
    const tr = engine.getTrain(id);
    if (!tr) return;
    if (follow) startFollow(id);
    else if (fly) flyToTrain(tr);
  }
  app.selectTrain = selectTrain;
  app.showStation = showStation;

  $('#follow-exit').addEventListener('click', () => followCam.stop());
  $('#follow-mode').addEventListener('click', () => followCam.cycleMode());

  // ---------- map interactions ----------

  map.on('click', (e) => {
    const trainId = layer.pick(e.point.x, e.point.y);
    if (trainId) {
      // the marquee interaction: click a train -> chase it
      selectTrain(trainId, { follow: true });
      return;
    }
    const feats = map.queryRenderedFeatures(
      [
        [e.point.x - 8, e.point.y - 8],
        [e.point.x + 8, e.point.y + 8],
      ],
      { layers: ['sta-core', 'sta-halo', 'sta-label'] }
    );
    if (feats.length) {
      showStation(feats[0].properties.id);
      return;
    }
    // empty click: clear selection
    engine.selectedId = null;
    followCam.stop();
    closeDetail();
    renderTrainList();
  });

  const tooltip = $('#tooltip');
  let hoverRaf = 0;
  map.on('mousemove', (e) => {
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      const trainId = layer.pick(e.point.x, e.point.y, 22);
      const canvas = map.getCanvas();
      if (trainId) {
        const tr = engine.getTrain(trainId);
        const ctx = tr && engine.trainContext(tr);
        if (tr) {
          tooltip.innerHTML = `<div class="tt-title">${chip(tr.line)} → ${tr.headsign ?? ''}</div>
            <div class="tt-sub">${ctx?.next ? 'Next: ' + ctx.next.name : ''} · ${Math.round((tr.dispSpeed ?? 0) * MPH)} mph · click to follow</div>`;
          tooltip.style.left = `${e.point.x}px`;
          tooltip.style.top = `${e.point.y}px`;
          tooltip.classList.remove('hidden');
          canvas.style.cursor = 'pointer';
          return;
        }
      }
      const feats = map.queryRenderedFeatures(
        [
          [e.point.x - 6, e.point.y - 6],
          [e.point.x + 6, e.point.y + 6],
        ],
        { layers: ['sta-core', 'sta-halo'] }
      );
      if (feats.length) {
        canvas.style.cursor = 'pointer';
        tooltip.classList.add('hidden');
      } else {
        canvas.style.cursor = '';
        tooltip.classList.add('hidden');
      }
    });
  });

  // ---------- top-right controls ----------

  $('#btn-daynight').addEventListener('click', () => {
    app.setTheme(app.theme === 'night' ? 'day' : 'night', { manual: true });
  });
  $('#btn-home').addEventListener('click', () => {
    followCam.stop();
    map.flyTo({ ...network.home, duration: 2600, essential: true });
  });
  $('#btn-buildings').addEventListener('click', (e) => {
    app.toggles.buildings = !app.toggles.buildings;
    e.currentTarget.classList.toggle('active', app.toggles.buildings);
    map.setLayoutProperty('building-3d', 'visibility', app.toggles.buildings ? 'visible' : 'none');
  });
  $('#btn-labels').addEventListener('click', (e) => {
    app.toggles.labels = !app.toggles.labels;
    e.currentTarget.classList.toggle('active', app.toggles.labels);
    for (const id of ['label-water', 'label-road', 'label-place', 'label-city', 'label-airport', 'sta-label']) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', app.toggles.labels ? 'visible' : 'none');
      }
    }
  });
  $('#btn-settings').addEventListener('click', () => {
    $('#set-apikey').value = oba.getApiKey() === 'TEST' ? '' : oba.getApiKey();
    $('#set-terrain').checked = app.toggles.terrain;
    $('#set-autotime').checked = app.toggles.autoTheme;
    $('#modal-settings').classList.remove('hidden');
  });
  $('#btn-help').addEventListener('click', () => $('#modal-help').classList.remove('hidden'));

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.hasAttribute('data-close')) {
        modal.classList.add('hidden');
      }
    });
  });

  $('#set-apply').addEventListener('click', () => {
    const key = $('#set-apikey').value.trim();
    const keyChanged = key !== (oba.getApiKey() === 'TEST' ? '' : oba.getApiKey());
    oba.setApiKey(key || null);
    app.toggles.autoTheme = $('#set-autotime').checked;
    const wantTerrain = $('#set-terrain').checked;
    if (wantTerrain !== app.toggles.terrain) app.setTerrain(wantTerrain);
    app.toggles.sky = $('#set-sky').checked;
    $('#modal-settings').classList.add('hidden');
    if (keyChanged) location.reload();
  });

  // ---------- keyboard ----------

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    switch (e.key.toLowerCase()) {
      case 'escape':
        if (!$('#modal-settings').classList.contains('hidden')) {
          $('#modal-settings').classList.add('hidden');
        } else if (!$('#modal-help').classList.contains('hidden')) {
          $('#modal-help').classList.add('hidden');
        } else if (followCam.active) {
          followCam.stop();
        } else {
          engine.selectedId = null;
          closeDetail();
          renderTrainList();
        }
        break;
      case 'f':
        if (engine.selectedId) startFollow(engine.selectedId);
        break;
      case 'c':
        if (followCam.active) followCam.cycleMode();
        break;
      case 'n': {
        const ids = [...engine.trains.keys()];
        if (!ids.length) break;
        const idx = ids.indexOf(engine.selectedId);
        const next = ids[(idx + 1) % ids.length];
        selectTrain(next, { follow: followCam.active, fly: !followCam.active });
        break;
      }
      case 'd':
        app.setTheme(app.theme === 'night' ? 'day' : 'night', { manual: true });
        break;
      case 'h':
        followCam.stop();
        map.flyTo({ ...network.home, duration: 2600, essential: true });
        break;
      case 'b':
        $('#btn-buildings').click();
        break;
      case 'l':
        $('#btn-labels').click();
        break;
      case '?':
        $('#modal-help').classList.toggle('hidden');
        break;
    }
  });

  return { followCam, closeDetail, renderTrainList };
}
