const results = document.getElementById("results"), drop = document.getElementById("drop"), input = document.getElementById("file");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function show(file) {
  const card = document.createElement("section");
  card.className = "card";
  results.prepend(card);
  try {
    const r = await Emb.readEmb(new Uint8Array(await file.arrayBuffer()));
    const imgs = r.images.map((i) => `<figure><img src="${URL.createObjectURL(new Blob([i.data], { type: i.mime }))}" alt=""><figcaption>${i.label}</figcaption></figure>`).join("");
    const total = r.totalStitches || 1;
    const bar = r.threads.map((t) => `<span style="flex:${t.stitches};background:${t.color}" title="${esc(t.name)}"></span>`).join("");
    const rows = r.threads.map((t, i) => `<tr><td>${i + 1}</td><td><span class="sw" style="background:${t.color}"></span>${esc(t.name)}</td><td>${t.color}</td><td class="num">${t.stitches.toLocaleString()}</td></tr>`).join("");
    const meta = Object.entries(r.summary).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
    card.innerHTML = `
      <h2>${esc(file.name)}</h2>
      <div class="sub">${(file.size / 1024).toFixed(1)} KB · ${r.threads.length} colours · ${r.totalStitches.toLocaleString()} stitches${r.machine ? " · " + esc(r.machine) : ""}</div>
      <div class="grid">
        <div class="imgs">${imgs || "<p>No preview in this file.</p>"}</div>
        <div>
          ${r.threads.length ? `<div class="bar">${bar}</div>
          <table><thead><tr><th>#</th><th>Thread</th><th>RGB</th><th class="num">Stitches</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="sub">No colour table (older .emb layout). Only the design icon is available.</p>'}
          <dl>${meta}</dl>
        </div>
      </div>`;
  } catch (e) {
    card.innerHTML = `<h2>${esc(file.name)}</h2><p class="err">${esc(e.message)}</p>`;
  }
}

const handle = (files) => [...files].forEach(show);
input.addEventListener("change", () => handle(input.files));
["dragenter", "dragover"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (ev) => handle(ev.dataTransfer.files));
