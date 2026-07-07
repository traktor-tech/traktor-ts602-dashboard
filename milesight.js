/* milesight.js — Decoder del payload del Milesight TS60x (TS601/TS602).
 * El equipo publica por MQTT un paquete BINARIO (TLV por canales, little-endian),
 * no JSON. Esto lo traduce a {temperature, humidity, battery, signal, ms, imei}.
 * Funciona como <script> en el navegador (global MilesightTS) y con require() en Node.
 *
 * Canales (del user guide TS60x):
 *   0x01 battery   UINT8  %          (1 byte)
 *   0x04 temp      INT32/100 °C      (4 bytes LE)
 *   0x05 humidity  UINT16/10 %RH     (2 bytes LE)
 *   0x06 location  lat/long          (8 bytes)
 *   0x07 flight    (1) · 0x0c probe (1) · 0x0e report type (1)
 *   0xed time      flag(1)+UINT32 s  (5 bytes; ts en byte2-5 LE)
 *   Cabecera opcional: 0xbe02 IMEI(15) · be03 IMSI(15) · be04 ICCID(20) · be05 signal(2)
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
    var b = toBytes(input), i = 0, out = {};
    while (i < b.length) {
      var ch = b[i];
      if (ch === 0xbe) {                                   // cabecera
        var t = b[i + 1];
        if (t === 0x02) { out.imei = ascii(b, i + 2, 15); i += 2 + 15; }
        else if (t === 0x03) { i += 2 + 15; }
        else if (t === 0x04) { i += 2 + 20; }
        else if (t === 0x05) { out.signal = s8(b[i + 2]); i += 2 + 2; }
        else break;
      }
      else if (ch === 0x01) { out.battery = b[i + 1]; i += 2; }
      else if (ch === 0x04) { out.temperature = s32le(b, i + 1) / 100; i += 5; }
      else if (ch === 0x05) { out.humidity = u16le(b, i + 1) / 10; i += 3; }
      else if (ch === 0x06) { i += 9; }                    // location (ignorada)
      else if (ch === 0x07) { i += 2; }                    // flight mode
      else if (ch === 0x0c) { i += 2; }                    // probe status
      else if (ch === 0x0e) { i += 2; }                    // report type
      else if (ch === 0xed) { out.ms = u32le(b, i + 2) * 1000; i += 6; }  // time
      else { i += 1; }                                     // desconocido: avanzar defensivo
    }
    return out;
  }

  var api = { decode: decode, toBytes: toBytes };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.MilesightTS = api;
})(typeof self !== "undefined" ? self : this);
