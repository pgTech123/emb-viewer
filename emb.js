// .emb (Wilcom ES) reader: OLE2 container -> preview images, thread colours, summary.
// Stitch coordinates live in the proprietary "DesignDocument" stream and are not decoded here.
(function (root) {
  const { parseOle } = typeof require !== "undefined" ? require("./ole.js") : root.Ole;

  // Streams are stored as [uint32 LE uncompressed size][zlib data].
  async function inflate(bytes) {
    if (bytes.length > 6 && bytes[4] === 0x78) {
      const ds = new DecompressionStream("deflate");
      const out = new Response(new Blob([bytes.subarray(4)]).stream().pipeThrough(ds));
      return new Uint8Array(await out.arrayBuffer());
    }
    return bytes;
  }

  function bgrToHex(n) {
    const r = n & 255, g = (n >> 8) & 255, b = (n >> 16) & 255;
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  // Colour table rows (tab separated): idx, ?, '', stitches, thread length, ?, name, brand, 0, BGR
  function parseThreads(ddd) {
    const text = new TextDecoder("latin1").decode(ddd);
    const re = /(\d+)\t(\d+)\t\t(\d+)\t([\d.]+)\t(\d+)\t([^\t\n]*)\t([^\t\n]*)\t(\d+)\t(\d+)\t\n/g;
    const threads = [];
    let m;
    while ((m = re.exec(text))) {
      threads.push({ index: +m[1], stitches: +m[3], name: m[6], brand: m[7], color: bgrToHex(+m[9]) });
    }
    const pick = (re) => (text.match(re) || [])[1];
    return {
      threads,
      machine: pick(/\x1e\0\0\0[\x01-\x20]\0\0\0(Tajima|Barudan|Melco|Brother|Janome|Husqvarna|Pfaff|ZSK|Happy|Toyota|Bernina)\0/i),
      colorway: pick(/(Colorway [^\0]*)\0/),
    };
  }

  // OLE SummaryInformation: pull the string properties (title, author, ...).
  function parseSummary(b) {
    const out = {};
    try {
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const sectOff = dv.getUint32(44, true), n = dv.getUint32(sectOff + 4, true);
      const names = { 2: "Title", 3: "Subject", 4: "Author", 6: "Comments", 8: "Last author", 18: "Application" };
      for (let i = 0; i < n; i++) {
        const id = dv.getUint32(sectOff + 8 + i * 8, true), off = sectOff + dv.getUint32(sectOff + 12 + i * 8, true);
        if (names[id] && dv.getUint32(off, true) === 30) {
          const len = dv.getUint32(off + 4, true);
          const s = new TextDecoder("windows-1252").decode(b.subarray(off + 8, off + 8 + len)).replace(/\0.*$/, "");
          if (s) out[names[id]] = s;
        }
      }
    } catch (e) { /* summary is optional */ }
    return out;
  }

  async function readEmb(buf) {
    const ole = parseOle(buf);
    const find = (re) => ole.streams.find((s) => re.test(s.name));
    const get = async (re) => { const s = find(re); return s ? s.read() : null; };

    const result = { streams: ole.streams.map((s) => ({ name: s.name.replace(/[\x00-\x1f]/g, ""), size: s.size })), images: [] };

    const ddd = await get(/WilcomDesignInformationDDD/);
    if (ddd) Object.assign(result, parseThreads(ddd));
    result.threads = result.threads || [];
    result.totalStitches = result.threads.reduce((a, t) => a + t.stitches, 0);

    const sum = await get(/SummaryInformation/);
    result.summary = sum ? parseSummary(sum) : {};

    const tv = await get(/^TRUEVIEW_ICON$/);
    if (tv) result.images.push({ label: "TrueView preview", mime: "image/jpeg", data: await inflate(tv) });
    const icon = await get(/^DESIGN_ICON$/);
    if (icon) result.images.push({ label: "Design icon", mime: "image/bmp", data: await inflate(icon) });

    // CorelDraw zip holds a larger PNG preview.
    const corel = await get(/^CorelDocument$/);
    if (corel) {
      const png = await zipEntry(corel, "previews/thumbnail.png");
      if (png) result.images.unshift({ label: "Artwork preview", mime: "image/png", data: png });
    }
    return result;
  }

  // Tiny ZIP reader (central directory, stored/deflate-raw entries).
  async function zipEntry(z, name) {
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    let eocd = z.length - 22;
    while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
    if (eocd < 0) return null;
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let i = 0; i < count; i++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const n = new TextDecoder().decode(z.subarray(p + 46, p + 46 + nlen));
      if (n === name) {
        const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
        const data = z.subarray(start, start + csize);
        if (method === 0) return data;
        const out = new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")));
        return new Uint8Array(await out.arrayBuffer());
      }
      p += 46 + nlen + elen + clen;
    }
    return null;
  }

  const api = { readEmb };
  if (typeof module !== "undefined") module.exports = api; else root.Emb = api;
})(typeof self !== "undefined" ? self : this);
