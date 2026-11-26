// Contact sheet: all of one day's keepsakes in a grid, made in the browser and saved to Drive.

const $ = (id) => document.getElementById(id);
const COLS = 4;
const CELL_W = 400;
const CELL_H = 600; // keepsakes are 2:3
const GAP = 24;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function makeSheet() {
  const day = $("sheetDay").value;
  const status = (t) => ($("sheetStatus").textContent = t);
  if (!day) return status("Pick a date first.");
  $("sheetBtn").disabled = true;
  try {
    status("Finding that day's keepsakes…");
    const res = await fetch(`/api/admin/day?day=${day}`, { credentials: "same-origin" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't list the keepsakes.");
    if (!data.files.length) return status("No keepsakes were saved to Drive that day.");

    const rows = Math.ceil(data.files.length / COLS);
    const header = 140;
    const canvas = document.createElement("canvas");
    canvas.width = COLS * CELL_W + (COLS + 1) * GAP;
    canvas.height = header + rows * (CELL_H + GAP) + GAP;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f7f1e6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1e3a2c";
    ctx.textAlign = "center";
    ctx.font = "600 56px 'Cormorant Garamond', Georgia, serif";
    ctx.fillText("Pooja & Amit", canvas.width / 2, 72);
    ctx.font = "500 26px 'Plus Jakarta Sans', sans-serif";
    ctx.fillStyle = "#8a6a2b";
    const nice = new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    ctx.fillText(`${nice} · ${data.files.length} keepsake${data.files.length === 1 ? "" : "s"}`, canvas.width / 2, 115);

    for (let i = 0; i < data.files.length; i++) {
      status(`Adding keepsake ${i + 1} of ${data.files.length}…`);
      const x = GAP + (i % COLS) * (CELL_W + GAP);
      const y = header + Math.floor(i / COLS) * (CELL_H + GAP);
      try {
        const img = await loadImage(`/api/admin/thumb?id=${encodeURIComponent(data.files[i].id)}`);
        const scale = Math.min(CELL_W / img.naturalWidth, CELL_H / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, x + (CELL_W - w) / 2, y + (CELL_H - h) / 2, w, h);
      } catch {
        ctx.fillStyle = "#e9e1d0";
        ctx.fillRect(x, y, CELL_W, CELL_H);
      }
    }

    const jpeg = canvas.toDataURL("image/jpeg", 0.85);
    $("sheetPreview").src = jpeg;
    $("sheetPreview").classList.remove("hidden");
    status("Saving to Drive…");
    const save = await fetch("/api/admin/contact-sheet", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, image: jpeg }),
    });
    const saved = await save.json();
    if (!save.ok) throw new Error(saved.error || "Couldn't save it.");
    status(`Saved as "Contact sheet ${day}.jpg" in that day's Keepsakes folder.`);
  } catch (err) {
    status(err.message);
  } finally {
    $("sheetBtn").disabled = false;
  }
}

export function initContactSheet() {
  $("sheetDay").value = new Date().toLocaleDateString("en-CA");
  $("sheetBtn").addEventListener("click", makeSheet);
}
