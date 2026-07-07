/* milesight.js — Decoder del payload del Milesight TS60x (TS601/TS602).
 * Validado contra el payload REAL del equipo (2026-07-07): bytes crudos, con cabecera
 * be02/03/04/05 y uno o varios registros 'ed' (tiempo) con sus canales.
 *
 * Devuelve: { signal, imei, readings: [ {ms, temperature, humidity, battery,
 *             tempStatus, humStatus, probe} ] }
 *   temperature/humidity = null si el equipo reporta error de lectura (canal 08/09).
 *
 * Canales:
 *   be02 IMEI(15 ascii) · be03 IMSI(15) · be04 ICCID(20) · be05 señal(int8 dBm + 1)
 *   ed  time: flag(1)+UINT32 s (LE)        0e report type(1)
 *   01  battery UINT8 %                     06 location(8)
 *   04  temp INT32/100 °C (LE)              05 humidity UINT16/10 %RH (LE)
 *   08  temp status  (00=error lectura, 01=under, 02=over, 03=sin dato)
 *   09  humidity status (idem)              0c probe status(1)  07 flight(1)
 * Funciona como <script> (global MilesightTS) y con require() en Node.
 */
(function (global) {
  "use strict";
  function toBytes(input) {
    if (input && input.length != null && typeof input !== "string") return Array.prototype.slice.call(input);
    var s = String(input).trim().replace(/[^0-9a-fA-F]/g, "");
    var out = [];
    for (var i = 0; i + 1 < s.length; i += 2) out.push(parseInt(s.substr(i, 2), 16));
    return out;
  }
  var s8 = function (v) { return v > 127 ? v - 256 : v; };
  var u16le = function (b, i) { return b[i] | (b[i + 1] << 8); };
  var s32le = function (b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)); };
  var u32le = function (b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 16777216; };
  function ascii(b, s, n) { var r = ""; for (var k = 0; k < n; k++) r += String.fromCharCode(b[s + k] || 0); return r; }

  function decode(input) {
    var b = toBytes(input), i = 0, hdr = { signal: null, imei: null }, readings = [], cur = null;
    function flush() { if (cur) { readings.push(cur); cur = null; } }
    while (i < b.length) {
      var ch = b[i];
      if (ch === 0xbe) {                                   // cabecera
        var t = b[i + 1];
        if (t === 0x02) { hdr.imei = ascii(b, i + 2, 15); i += 17; }
        else if (t === 0x03) { i += 17; }
        else if (t === 0x04) { i += 22; }
        else if (t === 0x05) { hdr.signal = s8(b[i + 2]); i += 4; }
        else { i += 1; }
      }
      else if (ch === 0xed) {                              // nuevo registro (tiempo)
        flush();
        cur = { ms: u32le(b, i + 2) * 1000, temperature: null, humidity: null, battery: null };
        i += 6;
      }
      else if (cur) {
        if (ch === 0x01) { cur.battery = b[i + 1]; i += 2; }
        else if (ch === 0x04) { cur.temperature = s32le(b, i + 1) / 100; i += 5; }
        else if (ch === 0x05) { cur.humidity = u16le(b, i + 1) / 10; i += 3; }
        else if (ch === 0x08) { cur.tempStatus = b[i + 1]; i += 2; }
        else if (ch === 0x09) { cur.humStatus = b[i + 1]; i += 2; }
        else if (ch === 0x06) { i += 9; }                  // location (ignorada)
        else if (ch === 0x07) { i += 2; }                  // flight
        else if (ch === 0x0c) { cur.probe = b[i + 1]; i += 2; }
        else if (ch === 0x0e) { i += 2; }                  // report type
        else { i += 1; }                                   // desconocido: defensivo
      }
      else { i += 1; }
    }
    flush();
    return { signal: hdr.signal, imei: hdr.imei, readings: readings };
  }

  var api = { decode: decode, toBytes: toBytes };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.MilesightTS = api;
})(typeof self !== "undefined" ? self : this);
