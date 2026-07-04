// Hand-authored Link light rail network geometry.
//
// Shape points are [lng, lat, altMeters] where alt < 0 means tunnel, ~0 means
// at-grade, and positive values are elevated guideway. The alignment was traced
// along the real corridors (I-5, the Downtown Seattle Transit Tunnel, the SODO
// busway, the Beacon Hill tunnel, MLK Jr Way S, SR 99, the I-90 floating bridge
// and the Bel-Red corridor). It is deliberately close but not survey-exact:
// at startup the app tries to replace these shapes with Sound Transit's official
// GTFS shapes fetched live from the OneBusAway API (see rt/oba.js), so this file
// is the always-available fallback and the source of station metadata.

import { Path } from '../geo.js';

const T = -15; // generic tunnel depth
const S = 0.5; // at-grade
const E = 9; // elevated guideway
const B = 3.5; // bridge deck (I-90 floating bridge)

// ---- Lynnwood -> International District (shared by 1 Line and 2 Line) ----
const SEG_NORTH = [
  [-122.2945, 47.816, E],
  [-122.299, 47.8125, E],
  [-122.304, 47.806, E],
  [-122.3095, 47.796, E],
  [-122.3145, 47.7852, E], // Mountlake Terrace
  [-122.318, 47.778, E],
  [-122.3215, 47.7705, E],
  [-122.3227, 47.7607, E], // Shoreline North/185th
  [-122.3238, 47.749, E],
  [-122.3245, 47.7362, E], // Shoreline South/148th
  [-122.3258, 47.725, E],
  [-122.327, 47.715, E],
  [-122.3284, 47.7063, E], // Northgate
  [-122.3277, 47.7008, E],
  [-122.327, 47.6963, S], // tunnel portal near NE 95th St
  [-122.3235, 47.6905, T],
  [-122.319, 47.6838, T],
  [-122.3173, 47.676, T], // Roosevelt
  [-122.3165, 47.67, T],
  [-122.3152, 47.665, T],
  [-122.3141, 47.6604, T], // U District
  [-122.3115, 47.656, T],
  [-122.307, 47.6528, T],
  [-122.3038, 47.6498, T], // Univ of Washington
  [-122.3055, 47.6445, T],
  [-122.31, 47.6385, T],
  [-122.315, 47.63, T],
  [-122.318, 47.6242, T],
  [-122.3202, 47.6192, T], // Capitol Hill
  [-122.3258, 47.616, T],
  [-122.331, 47.6136, T],
  [-122.3372, 47.6114, T], // Westlake
  [-122.3368, 47.6098, T],
  [-122.3357, 47.6078, T], // Symphony
  [-122.334, 47.6055, T],
  [-122.332, 47.603, T], // Pioneer Square
  [-122.33, 47.6008, T],
  [-122.3285, 47.5995, -6],
  [-122.3279, 47.5983, S], // International District/Chinatown
];

// ---- International District -> Federal Way (1 Line south) ----
const SEG_SOUTH = [
  [-122.3273, 47.5952, S],
  [-122.3271, 47.5912, S], // Stadium
  [-122.3272, 47.586, S],
  [-122.3272, 47.5811, S], // SODO
  [-122.327, 47.5745, S],
  [-122.324, 47.573, 4],
  [-122.32, 47.5738, E], // crossing I-5
  [-122.317, 47.576, E],
  [-122.315, 47.5778, S], // Beacon Hill tunnel west portal
  [-122.3135, 47.5786, -25],
  [-122.3116, 47.5791, -48], // Beacon Hill (deep station)
  [-122.308, 47.5788, -25],
  [-122.304, 47.578, S], // east portal
  [-122.3005, 47.5772, E],
  [-122.2977, 47.5764, E], // Mount Baker
  [-122.296, 47.5738, 6],
  [-122.2951, 47.571, S], // down to MLK Jr Way S
  [-122.2946, 47.567, S],
  [-122.2938, 47.564, S],
  [-122.2929, 47.562, S],
  [-122.2927, 47.5599, S], // Columbia City
  [-122.292, 47.556, S],
  [-122.289, 47.55, S],
  [-122.286, 47.546, S],
  [-122.283, 47.542, S],
  [-122.2814, 47.538, S], // Othello
  [-122.28, 47.534, S],
  [-122.2795, 47.529, S],
  [-122.2794, 47.5225, S], // Rainier Beach
  [-122.2798, 47.517, S],
  [-122.281, 47.5125, 3],
  [-122.285, 47.509, E], // Boeing Access Rd, over I-5
  [-122.2905, 47.506, E],
  [-122.294, 47.501, E],
  [-122.2965, 47.495, E],
  [-122.296, 47.487, E],
  [-122.2935, 47.479, E],
  [-122.2915, 47.472, E],
  [-122.2895, 47.468, E],
  [-122.2881, 47.4642, E], // Tukwila Int'l Blvd
  [-122.29, 47.461, E],
  [-122.2945, 47.4575, E],
  [-122.2965, 47.454, E],
  [-122.2968, 47.45, E],
  [-122.2967, 47.4451, E], // SeaTac/Airport
  [-122.297, 47.439, E],
  [-122.2975, 47.432, E],
  [-122.2977, 47.4224, E], // Angle Lake
  [-122.297, 47.415, E],
  [-122.2962, 47.406, E],
  [-122.2958, 47.397, E],
  [-122.2957, 47.3866, E], // Kent Des Moines
  [-122.2945, 47.379, E],
  [-122.2935, 47.37, E],
  [-122.2937, 47.362, E],
  [-122.2942, 47.356, E], // Star Lake
  [-122.296, 47.348, E],
  [-122.2995, 47.34, E],
  [-122.3025, 47.333, E],
  [-122.304, 47.326, E],
  [-122.3043, 47.3175, E], // Federal Way Downtown
];

// ---- International District -> Downtown Redmond (2 Line east) ----
const SEG_EAST = [
  [-122.327, 47.5968, S],
  [-122.3245, 47.5952, 4],
  [-122.3205, 47.593, 6],
  [-122.316, 47.5912, 6], // I-90 corridor
  [-122.31, 47.5903, 6],
  [-122.305, 47.5901, 6],
  [-122.3007, 47.59, S], // Judkins Park
  [-122.296, 47.59, T], // Mount Baker Ridge tunnel
  [-122.29, 47.5901, T],
  [-122.2868, 47.5902, S],
  [-122.28, 47.5901, B], // Homer Hadley floating bridge
  [-122.27, 47.5899, B],
  [-122.26, 47.5897, B],
  [-122.248, 47.5894, B],
  [-122.239, 47.5893, B],
  [-122.23, 47.5893, S], // Mercer Island
  [-122.223, 47.5891, S],
  [-122.215, 47.5886, S],
  [-122.21, 47.588, B], // east channel bridge
  [-122.204, 47.5872, B],
  [-122.199, 47.5862, S],
  [-122.194, 47.5852, S],
  [-122.1908, 47.5852, 4],
  [-122.1907, 47.5871, E], // South Bellevue
  [-122.1902, 47.593, E],
  [-122.188, 47.598, 6],
  [-122.1866, 47.602, S],
  [-122.186, 47.605, S],
  [-122.186, 47.608, S], // East Main
  [-122.1862, 47.6103, -12], // downtown Bellevue tunnel
  [-122.188, 47.6125, -12],
  [-122.1905, 47.6145, -12],
  [-122.192, 47.6159, S], // Bellevue Downtown
  [-122.188, 47.6163, E], // over I-405 on NE 6th
  [-122.183, 47.6168, E],
  [-122.1778, 47.6171, E], // Wilburton
  [-122.176, 47.618, E],
  [-122.1758, 47.6205, E],
  [-122.176, 47.6236, S], // Spring District
  [-122.173, 47.6242, S],
  [-122.17, 47.6245, S],
  [-122.166, 47.6247, S], // BelRed
  [-122.16, 47.6252, 4],
  [-122.155, 47.626, 6],
  [-122.15, 47.6272, 6],
  [-122.145, 47.629, 6],
  [-122.14, 47.6317, E], // Overlake Village
  [-122.137, 47.635, E],
  [-122.134, 47.639, E],
  [-122.1305, 47.6435, E], // Redmond Technology
  [-122.129, 47.648, 6],
  [-122.127, 47.653, B], // along SR 520
  [-122.123, 47.657, B],
  [-122.118, 47.66, B],
  [-122.113, 47.6625, B],
  [-122.1095, 47.6645, E], // Marymoor Village
  [-122.111, 47.668, 6],
  [-122.1135, 47.67, 6],
  [-122.118, 47.6716, E], // Downtown Redmond
];

const STATION_DEFS = [
  // seg, id, name, lng, lat, area, opened
  ['N', 'LNW', 'Lynnwood City Center', -122.2945, 47.816, 'Lynnwood', 2024],
  ['N', 'MLT', 'Mountlake Terrace', -122.3145, 47.7852, 'Mountlake Terrace', 2024],
  ['N', 'S185', 'Shoreline North/185th', -122.3227, 47.7607, 'Shoreline', 2024],
  ['N', 'S148', 'Shoreline South/148th', -122.3245, 47.7362, 'Shoreline', 2024],
  ['N', 'NGT', 'Northgate', -122.3284, 47.7063, 'Northgate, Seattle', 2021],
  ['N', 'ROO', 'Roosevelt', -122.3173, 47.676, 'Roosevelt, Seattle', 2021],
  ['N', 'UDI', 'U District', -122.3141, 47.6604, 'University District', 2021],
  ['N', 'UWS', 'Univ of Washington', -122.3038, 47.6498, 'Husky Stadium', 2016],
  ['N', 'CHS', 'Capitol Hill', -122.3202, 47.6192, 'Capitol Hill', 2016],
  ['N', 'WLK', 'Westlake', -122.3372, 47.6114, 'Downtown Seattle', 2009],
  ['N', 'SYM', 'Symphony', -122.3357, 47.6078, 'Downtown Seattle', 2009],
  ['N', 'PSQ', 'Pioneer Square', -122.332, 47.603, 'Pioneer Square', 2009],
  ['N', 'IDS', "Int'l District/Chinatown", -122.3279, 47.5983, 'Chinatown-ID', 2009],
  ['S', 'STA', 'Stadium', -122.3271, 47.5912, 'SODO / Stadiums', 2009],
  ['S', 'SOD', 'SODO', -122.3272, 47.5811, 'SODO', 2009],
  ['S', 'BEA', 'Beacon Hill', -122.3116, 47.5791, 'Beacon Hill (deep bore)', 2009],
  ['S', 'MBK', 'Mount Baker', -122.2977, 47.5764, 'Mount Baker', 2009],
  ['S', 'CCS', 'Columbia City', -122.2927, 47.5599, 'Columbia City', 2009],
  ['S', 'OTH', 'Othello', -122.2814, 47.538, 'Othello / New Holly', 2009],
  ['S', 'RBS', 'Rainier Beach', -122.2794, 47.5225, 'Rainier Beach', 2009],
  ['S', 'TIB', "Tukwila Int'l Blvd", -122.2881, 47.4642, 'Tukwila', 2009],
  ['S', 'SEA', 'SeaTac/Airport', -122.2967, 47.4451, 'Sea-Tac Airport', 2009],
  ['S', 'ALK', 'Angle Lake', -122.2977, 47.4224, 'SeaTac', 2016],
  ['S', 'KDM', 'Kent Des Moines', -122.2957, 47.3866, 'Kent / Highline College', 2026],
  ['S', 'STL', 'Star Lake', -122.2942, 47.356, 'Kent / S 272nd St', 2026],
  ['S', 'FWD', 'Federal Way Downtown', -122.3043, 47.3175, 'Federal Way', 2026],
  ['E', 'JUD', 'Judkins Park', -122.3007, 47.59, 'Judkins Park, Seattle', 2026],
  ['E', 'MIS', 'Mercer Island', -122.23, 47.5893, 'Mercer Island', 2026],
  ['E', 'SBE', 'South Bellevue', -122.1907, 47.5871, 'Bellevue', 2024],
  ['E', 'EMA', 'East Main', -122.186, 47.608, 'Bellevue', 2024],
  ['E', 'BDT', 'Bellevue Downtown', -122.192, 47.6159, 'Downtown Bellevue', 2024],
  ['E', 'WIL', 'Wilburton', -122.1778, 47.6171, 'Bellevue', 2024],
  ['E', 'SPD', 'Spring District', -122.176, 47.6236, 'Bellevue', 2024],
  ['E', 'BRD', 'BelRed', -122.166, 47.6247, 'Bel-Red', 2024],
  ['E', 'OVV', 'Overlake Village', -122.14, 47.6317, 'Overlake, Redmond', 2024],
  ['E', 'RTS', 'Redmond Technology', -122.1305, 47.6435, 'Microsoft campus', 2024],
  ['E', 'MMV', 'Marymoor Village', -122.1095, 47.6645, 'SE Redmond', 2025],
  ['E', 'DRD', 'Downtown Redmond', -122.118, 47.6716, 'Redmond', 2025],
];

function buildLine(id, name, color, colorBright, segPoints, segFilter) {
  const path = new Path(segPoints);
  const stations = STATION_DEFS.filter(([seg]) => segFilter.includes(seg)).map(
    ([, sid, sname, lng, lat, area, opened]) => {
      const snapped = path.snap(lng, lat);
      const pt = path.pointAt(snapped.s);
      return {
        id: sid,
        name: sname,
        area,
        opened,
        lng: pt.lng,
        lat: pt.lat,
        alt: pt.alt,
        s: snapped.s,
        lines: [id],
      };
    }
  );
  stations.sort((a, b) => a.s - b.s);
  return { id, name, color, colorBright, path, stations };
}

function makeNetwork() {
  const line1 = buildLine(
    '1',
    '1 Line',
    '#00915f',
    '#19d68f',
    [...SEG_NORTH, ...SEG_SOUTH],
    ['N', 'S']
  );
  const line2 = buildLine(
    '2',
    '2 Line',
    '#2c7bbf',
    '#4fb0ff',
    [...SEG_NORTH, ...SEG_EAST],
    ['N', 'E']
  );

  // Merge duplicate (shared-corridor) stations into single display entries.
  const stationMap = new Map();
  for (const line of [line1, line2]) {
    for (const st of line.stations) {
      const existing = stationMap.get(st.id);
      if (existing) {
        existing.lines.push(line.id);
        existing.sByLine[line.id] = st.s;
      } else {
        stationMap.set(st.id, { ...st, sByLine: { [line.id]: st.s } });
      }
    }
  }

  return {
    lines: { 1: line1, 2: line2 },
    stations: [...stationMap.values()],
    // Rough center of the whole network, used for camera fitting.
    home: {
      center: [-122.272, 47.592],
      zoom: 11.05,
      pitch: 52,
      bearing: -14,
    },
  };
}

export const network = makeNetwork();

/** Replace a line's geometry with higher-fidelity shape data (from OBA). */
export function upgradeLineGeometry(lineId, coords) {
  const line = network.lines[lineId];
  if (!line || !coords || coords.length < 50) return false;
  // Preserve authored altitude profile by sampling the old path per new vertex.
  const oldPath = line.path;
  const pts = coords.map(([lng, lat]) => {
    const snapped = oldPath.snap(lng, lat);
    // Only trust the altitude when the new geometry is near the authored line.
    const alt = snapped.dist < 400 ? oldPath.pointAt(snapped.s).alt : 0.5;
    return [lng, lat, alt];
  });
  const newPath = new Path(pts);
  // Sanity: refuse absurd results (wrong route, broken polyline).
  if (newPath.length < 15000 || newPath.length > 90000) return false;
  line.path = newPath;
  for (const st of line.stations) {
    const snapped = newPath.snap(st.lng, st.lat);
    st.s = snapped.s;
  }
  for (const st of network.stations) {
    if (st.lines.includes(lineId)) {
      st.sByLine[lineId] = newPath.snap(st.lng, st.lat).s;
    }
  }
  return true;
}
