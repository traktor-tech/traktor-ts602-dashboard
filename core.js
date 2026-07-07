/* core.js — Lógica de datos pura del dashboard Traktor.
 * Sin DOM ni localStorage acá: solo funciones puras, testeables en Node.
 * Funciona como <script> en el navegador (global TraktorCore) y como require() en Node.
 */
(function (global) {
  "use strict";

  // "YYYY/MM/DD HH:MM:SS" (UTC, como lo manda el device) -> Date | null
  function parseTime(s) {
    if (s == null) return null;
    var d = new Date(String(s).replace(/\//g, "-").replace(" ", "T") + "Z");
    return isNaN(d.getTime()) ? null : d;
  }

  // Payload del device -> [{key, ms, temp, hum}] (lectura actual + histórico "1".."8")
  function extractReadings(payload) {
    var out = [];
    function push(timeStr, temp, hum) {
      var d = parseTime(timeStr);
      if (!d) return;
      var t = Number(temp), h = Number(hum);
      if (!isFinite(t) || !isFinite(h)) return;
      out.push({ key: String(timeStr), ms: d.getTime(), temp: t, hum: h });
    }
    if (!payload || typeof payload !== "object") return out;
    if (payload.time != null && payload.temperature != null) {
      push(payload.time, payload.temperature, payload.humidity);
    }
    for (var k in payload) {
      if (!Object.prototype.hasOwnProperty.call(payload, k)) continue;
      if (/^\d+$/.test(k) && Array.isArray(payload[k]) && payload[k].length >= 3) {
        push(payload[k][2], payload[k][0], payload[k][1]);
      }
    }
    return out;
  }

  // DELTA: agrega al store SOLO las claves nuevas (dedupe por timestamp).
  // store: { key: {ms, temp, hum} }. Muta store y devuelve cuántas se agregaron.
  function mergeReadings(store, readings) {
    var added = 0;
    for (var i = 0; i < readings.length; i++) {
      var r = readings[i];
      if (!Object.prototype.hasOwnProperty.call(store, r.key)) {
        store[r.key] = { ms: r.ms, temp: r.temp, hum: r.hum };
        added++;
      }
    }
    return added;
  }

  // Recorta el store a los maxCount más recientes (por ms). Muta y devuelve store.
  function capStore(store, maxCount) {
    var keys = Object.keys(store);
    if (!maxCount || keys.length <= maxCount) return store;
    keys.sort(function (a, b) { return store[a].ms - store[b].ms; });
    for (var i = 0, drop = keys.length - maxCount; i < drop; i++) delete store[keys[i]];
    return store;
  }

  // store -> [{key, ms, temp, hum}] ordenado ascendente por tiempo
  function sortedReadings(store) {
    return Object.keys(store)
      .map(function (k) { return { key: k, ms: store[k].ms, temp: store[k].temp, hum: store[k].hum }; })
      .sort(function (a, b) { return a.ms - b.ms; });
  }

  // Filtra lecturas (ya ordenadas o no) por [fromMs, toMs] inclusive; null = extremo abierto.
  function filterReadings(readings, fromMs, toMs) {
    return readings.filter(function (r) {
      if (fromMs != null && r.ms < fromMs) return false;
      if (toMs != null && r.ms > toMs) return false;
      return true;
    });
  }

  // Última lectura conocida (para la "foto" cuando está offline). null si no hay datos.
  function pickSnapshot(store) {
    var best = null;
    for (var k in store) {
      if (!Object.prototype.hasOwnProperty.call(store, k)) continue;
      if (!best || store[k].ms > best.ms) {
        best = { key: k, ms: store[k].ms, temp: store[k].temp, hum: store[k].hum };
      }
    }
    return best;
  }

  function serialize(store) { return JSON.stringify(store); }

  // Tolerante: descarta entradas corruptas y devuelve {} ante cualquier error.
  function deserialize(str) {
    if (!str) return {};
    try {
      var o = JSON.parse(str);
      if (!o || typeof o !== "object" || Array.isArray(o)) return {};
      var clean = {};
      for (var k in o) {
        if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
        var v = o[k];
        if (v && isFinite(v.ms) && isFinite(v.temp) && isFinite(v.hum)) {
          clean[k] = { ms: +v.ms, temp: +v.temp, hum: +v.hum };
        }
      }
      return clean;
    } catch (e) { return {}; }
  }

  var api = {
    parseTime: parseTime, extractReadings: extractReadings, mergeReadings: mergeReadings,
    capStore: capStore, sortedReadings: sortedReadings, filterReadings: filterReadings,
    pickSnapshot: pickSnapshot, serialize: serialize, deserialize: deserialize
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.TraktorCore = api;
})(typeof self !== "undefined" ? self : this);
