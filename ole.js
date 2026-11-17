// Minimal OLE2 / Compound File Binary reader. Works in browser and Node.
(function (root) {
  const ENDOFCHAIN = 0xfffffffe, FREESECT = 0xffffffff;

  function parseOle(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    if (u8.length < 512 || sig.some((b, i) => u8[i] !== b)) throw new Error("Not an OLE2 compound file");

    const sectorSize = 1 << dv.getUint16(30, true);
    const miniSize = 1 << dv.getUint16(32, true);
    const numFat = dv.getUint32(44, true);
    const dirStart = dv.getUint32(48, true);
    const miniCutoff = dv.getUint32(56, true);
    const miniFatStart = dv.getUint32(60, true);
    const difStart = dv.getUint32(68, true);
    const numDif = dv.getUint32(72, true);
    const secOff = (s) => (s + 1) * sectorSize;

    // FAT sector list: 109 in header, rest via DIFAT chain
    const fatSecs = [];
    for (let i = 0; i < 109 && fatSecs.length < numFat; i++) {
      const s = dv.getUint32(76 + i * 4, true);
      if (s !== FREESECT) fatSecs.push(s);
    }
    let dif = difStart;
    for (let n = 0; n < numDif && dif < 0xfffffffa; n++) {
      const o = secOff(dif), per = sectorSize / 4 - 1;
      for (let i = 0; i < per && fatSecs.length < numFat; i++) {
        const s = dv.getUint32(o + i * 4, true);
        if (s !== FREESECT) fatSecs.push(s);
      }
      dif = dv.getUint32(o + per * 4, true);
    }
    const fat = [];
    for (const s of fatSecs) {
      const o = secOff(s);
      for (let i = 0; i < sectorSize / 4; i++) fat.push(dv.getUint32(o + i * 4, true));
    }

    function chain(start, table) {
      const out = [];
      let s = start;
      while (s < 0xfffffffa && out.length <= table.length) { out.push(s); s = table[s]; }
      return out;
    }
    function readChain(start, size, secBytes, table, offFn, src) {
      const out = new Uint8Array(size);
      let pos = 0;
      for (const s of chain(start, table)) {
        if (pos >= size) break;
        const o = offFn(s), n = Math.min(secBytes, size - pos);
        out.set(src.subarray(o, o + n), pos);
        pos += n;
      }
      return out;
    }

    // Directory
    const dirChain = chain(dirStart, fat);
    const entries = [];
    for (const s of dirChain) {
      for (let i = 0; i < sectorSize / 128; i++) {
        const o = secOff(s) + i * 128;
        const nameLen = dv.getUint16(o + 64, true);
        let name = "";
        for (let j = 0; j < Math.max(0, nameLen / 2 - 1); j++) name += String.fromCharCode(dv.getUint16(o + j * 2, true));
        entries.push({
          name, type: u8[o + 66], left: dv.getUint32(o + 68, true), right: dv.getUint32(o + 72, true),
          child: dv.getUint32(o + 76, true), start: dv.getUint32(o + 116, true),
          size: dv.getUint32(o + 120, true), // high 32 bits ignored (files < 4GB)
        });
      }
    }
    const root = entries[0];

    // Mini stream
    const miniFat = [];
    if (miniFatStart < 0xfffffffa) {
      for (const s of chain(miniFatStart, fat))
        for (let i = 0; i < sectorSize / 4; i++) miniFat.push(dv.getUint32(secOff(s) + i * 4, true));
    }
    const miniStream = root.start < 0xfffffffa ? readChain(root.start, root.size, sectorSize, fat, secOff, u8) : new Uint8Array(0);

    function read(e) {
      if (e.size < miniCutoff) return readChain(e.start, e.size, miniSize, miniFat, (s) => s * miniSize, miniStream);
      return readChain(e.start, e.size, sectorSize, fat, secOff, u8);
    }

    // Build tree
    const NOSTREAM = 0xffffffff;
    function walk(id, path, acc) {
      if (id === NOSTREAM || !entries[id]) return;
      const e = entries[id];
      walk(e.left, path, acc);
      const full = path ? path + "/" + e.name : e.name;
      if (e.type === 2) acc.push({ path: full, name: e.name, size: e.size, read: () => read(e) });
      if (e.type === 1) walk(e.child, full, acc);
      walk(e.right, path, acc);
    }
    const streams = [];
    walk(root.child, "", streams);
    return { streams };
  }

  const api = { parseOle };
  if (typeof module !== "undefined") module.exports = api; else root.Ole = api;
})(typeof self !== "undefined" ? self : this);
