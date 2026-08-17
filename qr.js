/* Gerador de QR Code (modo byte, nivel de correcao M, versoes 1-10).
   Implementacao propria, sem dependencias externas. Retorna SVG. */
var QR = (function () {
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function rsGen(n) {
    var p = [1];
    for (var i = 0; i < n; i++) {
      var np = new Array(p.length + 1);
      for (var k = 0; k < np.length; k++) np[k] = 0;
      for (var j = 0; j < p.length; j++) {
        np[j] ^= p[j];
        np[j + 1] ^= mul(p[j], EXP[i]);
      }
      p = np;
    }
    return p;
  }

  function rsRemainder(data, ecLen) {
    var gen = rsGen(ecLen);
    var buf = new Uint8Array(data.length + ecLen);
    buf.set(data);
    for (var i = 0; i < data.length; i++) {
      var c = buf[i];
      if (c !== 0) for (var j = 0; j < gen.length; j++) buf[i + j] ^= mul(gen[j], c);
    }
    return buf.subarray(data.length);
  }

  // [totalCodewords, ecPorBloco, g1Blocos, g1Dados, g2Blocos, g2Dados] - nivel M
  var SPEC = {
    1:  [26,  10, 1, 16, 0, 0],
    2:  [44,  16, 1, 28, 0, 0],
    3:  [70,  26, 1, 44, 0, 0],
    4:  [100, 18, 2, 32, 0, 0],
    5:  [134, 24, 2, 43, 0, 0],
    6:  [172, 16, 4, 27, 0, 0],
    7:  [196, 18, 4, 31, 0, 0],
    8:  [242, 22, 2, 38, 2, 39],
    9:  [292, 22, 3, 36, 2, 37],
    10: [346, 26, 4, 43, 1, 44]
  };
  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  function dataCapacity(v) {
    var s = SPEC[v];
    var cw = s[2] * s[3] + s[4] * s[5];
    var overhead = 4 + (v < 10 ? 8 : 16);
    return Math.floor((cw * 8 - overhead) / 8);
  }

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return out;
  }

  function bch(value, poly, bits) {
    var v = value << (bits - 1);
    var polyBits = 0, t = poly;
    while (t) { polyBits++; t >>= 1; }
    while (true) {
      var vb = 0, u = v;
      while (u) { vb++; u >>= 1; }
      if (vb < polyBits) break;
      v ^= poly << (vb - polyBits);
    }
    return (value << (bits - 1)) | v;
  }

  function maskFn(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  }

  // test=true: modulos de formato ficam claros (usado so para pontuar mascaras)
  function buildMatrix(version, codewords, mask, test) {
    var size = version * 4 + 17;
    var m = [], reserved = [];
    for (var i = 0; i < size; i++) {
      m.push(new Uint8Array(size));
      reserved.push(new Uint8Array(size));
    }

    function finder(r, c) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        var inner = (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        m[rr][cc] = inner ? 1 : 0;
        reserved[rr][cc] = 1;
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    // padroes de sincronismo
    for (var k = 8; k < size - 8; k++) {
      var bit = (k % 2 === 0) ? 1 : 0;
      m[6][k] = bit; reserved[6][k] = 1;
      m[k][6] = bit; reserved[k][6] = 1;
    }

    // padroes de alinhamento
    var pos = ALIGN[version];
    for (var a = 0; a < pos.length; a++) for (var b = 0; b < pos.length; b++) {
      var ar = pos[a], ac = pos[b];
      if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 9) || (ar >= size - 9 && ac <= 8)) continue;
      for (var dr2 = -2; dr2 <= 2; dr2++) for (var dc2 = -2; dc2 <= 2; dc2++) {
        m[ar + dr2][ac + dc2] = (Math.max(Math.abs(dr2), Math.abs(dc2)) !== 1) ? 1 : 0;
        reserved[ar + dr2][ac + dc2] = 1;
      }
    }

    // modulo escuro fixo + area de formato reservada
    m[size - 8][8] = 1; reserved[size - 8][8] = 1;
    for (var f = 0; f <= 8; f++) {
      if (f !== 6) { reserved[8][f] = 1; reserved[f][8] = 1; }
    }
    for (var g = 0; g < 8; g++) { reserved[8][size - 1 - g] = 1; reserved[size - 1 - g][8] = 1; }

    // informacao de versao (v >= 7)
    if (version >= 7) {
      var vinfo = bch(version, 0x1f25, 13);
      for (var i2 = 0; i2 < 18; i2++) {
        var bitv = (vinfo >> i2) & 1;
        var rr2 = Math.floor(i2 / 3), cc2 = i2 % 3;
        m[rr2][size - 11 + cc2] = bitv; reserved[rr2][size - 11 + cc2] = 1;
        m[size - 11 + cc2][rr2] = bitv; reserved[size - 11 + cc2][rr2] = 1;
      }
    }

    // dados em zigue-zague
    var bitIdx = 0, total = codewords.length * 8;
    var upward = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var n = 0; n < size; n++) {
        var row = upward ? (size - 1 - n) : n;
        for (var s = 0; s < 2; s++) {
          var c3 = col - s;
          if (reserved[row][c3]) continue;
          var v2 = 0;
          if (bitIdx < total) v2 = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
          bitIdx++;
          if (maskFn(mask, row, c3)) v2 ^= 1;
          m[row][c3] = v2;
        }
      }
      upward = !upward;
    }

    // informacao de formato (nivel M = 0b00), MSB primeiro
    var fmt = bch((0 << 3) | mask, 0x537, 11) ^ 0x5412;
    for (var i3 = 0; i3 < 15; i3++) {
      var bf = test ? 0 : ((fmt >> (14 - i3)) & 1);
      if (i3 < 6) m[8][i3] = bf;
      else if (i3 === 6) m[8][7] = bf;
      else if (i3 === 7) m[8][8] = bf;
      else if (i3 === 8) m[7][8] = bf;
      else m[14 - i3][8] = bf;

      // copia 2: 7 modulos verticais, 1 em (8, size-8), 7 horizontais
      if (i3 < 7) m[size - 1 - i3][8] = bf;
      else if (i3 === 7) m[8][size - 8] = bf;
      else m[8][size - 15 + i3] = bf;
    }
    m[size - 8][8] = test ? 0 : 1; // modulo escuro fixo
    return m;
  }

  function penalty(m) {
    var size = m.length, score = 0, i, j, run, last;
    for (i = 0; i < size; i++) {
      run = 1; last = m[i][0];
      for (j = 1; j < size; j++) {
        if (m[i][j] === last) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; last = m[i][j]; }
      }
      if (run >= 5) score += 3 + (run - 5);
      run = 1; last = m[0][i];
      for (j = 1; j < size; j++) {
        if (m[j][i] === last) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; last = m[j][i]; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (i = 0; i < size - 1; i++) for (j = 0; j < size - 1; j++) {
      var v = m[i][j];
      if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) score += 3;
    }
    var pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    var patR = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function check(get, len) {
      for (var s = 0; s + 11 <= len; s++) {
        var okA = true, okB = true;
        for (var t = 0; t < 11; t++) {
          if (get(s + t) !== pat[t]) okA = false;
          if (get(s + t) !== patR[t]) okB = false;
        }
        if (okA || okB) score += 40;
      }
    }
    for (i = 0; i < size; i++) {
      (function (row) { check(function (x) { return m[row][x]; }, size); })(i);
      (function (col) { check(function (x) { return m[x][col]; }, size); })(i);
    }
    var dark = 0;
    for (i = 0; i < size; i++) for (j = 0; j < size; j++) dark += m[i][j];
    var pct = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function encode(text) {
    var bytes = utf8Bytes(text);
    var version = 0;
    for (var v = 1; v <= 10; v++) { if (bytes.length <= dataCapacity(v)) { version = v; break; } }
    if (!version) throw new Error('Texto longo demais para QR versao 10');

    var spec = SPEC[version];
    var ecLen = spec[1], g1n = spec[2], g1d = spec[3], g2n = spec[4], g2d = spec[5];
    var totalData = g1n * g1d + g2n * g2d;

    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); }
    push(4, 4);
    push(bytes.length, version < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);
    var cap = totalData * 8;
    for (var t = 0; t < 4 && bits.length < cap; t++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    var pad = [0xec, 0x11], pi = 0;
    while (bits.length < cap) push(pad[pi++ % 2], 8);

    var data = new Uint8Array(totalData);
    for (var b = 0; b < totalData; b++) {
      var byteVal = 0;
      for (var k = 0; k < 8; k++) byteVal = (byteVal << 1) | bits[b * 8 + k];
      data[b] = byteVal;
    }

    var blocks = [], ecs = [], off = 0, n;
    for (n = 0; n < g1n; n++) { blocks.push(data.subarray(off, off + g1d)); off += g1d; }
    for (n = 0; n < g2n; n++) { blocks.push(data.subarray(off, off + g2d)); off += g2d; }
    for (n = 0; n < blocks.length; n++) ecs.push(rsRemainder(blocks[n], ecLen));

    var out = [];
    var maxData = Math.max(g1d, g2n ? g2d : 0);
    for (var c = 0; c < maxData; c++) for (n = 0; n < blocks.length; n++) if (c < blocks[n].length) out.push(blocks[n][c]);
    for (var e = 0; e < ecLen; e++) for (n = 0; n < ecs.length; n++) out.push(ecs[n][e]);
    var cw = new Uint8Array(spec[0]);
    cw.set(out.slice(0, spec[0]));

    var bestMask = 0, bestScore = Infinity;
    for (var mk = 0; mk < 8; mk++) {
      var sc = penalty(buildMatrix(version, cw, mk, true));
      if (sc < bestScore) { bestScore = sc; bestMask = mk; }
    }
    return buildMatrix(version, cw, bestMask, false);
  }

  function toSvg(text, opts) {
    opts = opts || {};
    var quiet = opts.quiet == null ? 4 : opts.quiet;
    var m = encode(text);
    var size = m.length, total = size + quiet * 2;
    var path = '';
    for (var r = 0; r < size; r++) {
      var c = 0;
      while (c < size) {
        if (m[r][c]) {
          var start = c;
          while (c < size && m[r][c]) c++;
          path += 'M' + (start + quiet) + ' ' + (r + quiet) + 'h' + (c - start) + 'v1h-' + (c - start) + 'z';
        } else c++;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total +
      '" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="' + total +
      '" height="' + total + '" fill="#ffffff"/><path d="' + path + '" fill="#000000"/></svg>';
  }

  return { toSvg: toSvg, encode: encode };
})();
