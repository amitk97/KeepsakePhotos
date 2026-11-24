// Admin page: status, studio switch, wedding-day test, wording and limits.

const $ = (id) => document.getElementById(id);
const LANGS = ["en", "gu", "hi"];
let refreshTimer = null;

async function api(path, body) {
  const res = await fetch(`/api/admin/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "login") {
    showLogin();
    throw new Error("Please log in.");
  }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c instanceof Node ? c : document.createTextNode(String(c ?? "")));
  return node;
}

function pill(text, kind) {
  return el("span", { className: `pill ${kind}` }, text);
}

function showLogin() {
  clearInterval(refreshTimer);
  $("dash").classList.add("hidden");
  $("loginCard").classList.remove("hidden");
}

function showDash() {
  $("loginCard").classList.add("hidden");
  $("dash").classList.remove("hidden");
}

/* ---------- Rendering ---------- */

function engineRow(e) {
  let status;
  if (!e.configured) status = pill("Not set up", "off");
  else if (e.coolingDown) status = pill("Resting after an error", "warn");
  else if (!e.usable) status = pill("Allowance used up", "warn");
  else status = pill("Ready", "good");
  const allowance = e.budget ? `${e.usedToday} of ${e.budget} ${e.unit}` : "Monthly credit (see provider)";
  return el("tr", {}, el("td", {}, e.name), el("td", {}, status), el("td", {}, e.configured ? allowance : "–"));
}

function render(s) {
  $("statPortraits").textContent = s.portraitsToday;
  $("statCap").textContent = s.dailyPortraitCap;
  $("statQueue").textContent = `${s.queue.active} / ${s.queue.waiting}`;
  $("statUploads").textContent = s.drive.connected ? s.drive.uploaded : "Off";
  $("studioOpen").checked = s.studioOpen;

  $("enginesBody").replaceChildren(...s.engines.map(engineRow));

  $("driveStatus").textContent = s.drive.connected
    ? `Connected. ${s.drive.uploaded} keepsakes uploaded, ${s.drive.pending} waiting, ${s.drive.failed} failed.` +
      (s.drive.lastError ? ` Last problem: ${s.drive.lastError}` : "")
    : "Not connected yet, so keepsakes are only saved on guests' phones. See SETUP.md → Google Drive.";

  $("problems").replaceChildren(
    ...(s.recentProblems.length
      ? s.recentProblems.slice(0, 15).map((p) =>
          el("li", {}, el("time", {}, new Date(p.time).toLocaleTimeString("en-GB")), pill(p.level, p.level === "error" ? "bad" : "warn"), " ", p.message)
        )
      : [el("li", {}, "Nothing since the server started.")])
  );
}

function fillSettings(st) {
  $("coupleNames").value = st.coupleNames || "";
  $("keepsakeVenueLine").value = st.keepsakeVenueLine || "";
  $("keepsakeFooterLine").value = st.keepsakeFooterLine || "";
  for (const l of LANGS) {
    $(`venue-${l}`).value = st.siteVenueLine?.[l] || "";
    $(`presets-${l}`).value = (st.presets?.[l] || []).join("\n");
  }
  $("dailyPortraitCap").value = st.dailyPortraitCap;
}

async function refresh({ withSettings = false } = {}) {
  const s = await api("status");
  render(s);
  if (withSettings) fillSettings(s.settings);
}

/* ---------- Actions ---------- */

async function startDash() {
  showDash();
  await refresh({ withSettings: true });
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => refresh().catch(() => {}), 10_000);
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginError").classList.add("hidden");
  try {
    await api("login", { password: $("password").value });
    $("password").value = "";
    await startDash();
  } catch (err) {
    $("loginError").textContent = err.message;
    $("loginError").classList.remove("hidden");
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await api("logout", {}).catch(() => {});
  showLogin();
});

$("studioOpen").addEventListener("change", async (e) => {
  try {
    render(await api("settings", { studioOpen: e.target.checked }));
  } catch (err) {
    alert(err.message);
  }
});

$("settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("settingsMsg");
  const patch = {
    coupleNames: $("coupleNames").value,
    keepsakeVenueLine: $("keepsakeVenueLine").value,
    keepsakeFooterLine: $("keepsakeFooterLine").value,
    siteVenueLine: {},
    presets: {},
    dailyPortraitCap: $("dailyPortraitCap").value,
  };
  for (const l of LANGS) {
    patch.siteVenueLine[l] = $(`venue-${l}`).value;
    const lines = $(`presets-${l}`).value.split("\n").map((s) => s.trim()).filter(Boolean);
    patch.presets[l] = lines.length ? lines : null;
  }
  try {
    const s = await api("settings", patch);
    render(s);
    fillSettings(s.settings);
    msg.textContent = "Saved. Guests see the change next time they open the page.";
  } catch (err) {
    msg.textContent = err.message;
  }
  msg.classList.remove("hidden");
});

$("testBtn").addEventListener("click", async () => {
  const btn = $("testBtn");
  const out = $("testResult");
  btn.disabled = true;
  btn.textContent = "Testing… (can take a few minutes if an engine is asleep)";
  out.classList.add("hidden");
  try {
    const r = await api("test", {});
    const items = r.engines.map((e) =>
      el(
        "li",
        {},
        e.image ? el("img", { src: e.image, alt: `${e.name} test portrait` }) : "",
        el("div", {}, el("strong", {}, e.name), " ", e.ok ? pill(`Worked in ${e.seconds}s`, "good") : pill(e.skipped ? "Not set up" : "Failed", e.skipped ? "off" : "bad"), el("br"), e.error || "")
      )
    );
    items.push(
      el("li", {}, el("div", {}, el("strong", {}, "Google Drive"), " ", r.drive.ok ? pill("Connected", "good") : pill(r.drive.skipped ? "Not connected" : "Failed", r.drive.skipped ? "off" : "bad"), el("br"), r.drive.error || ""))
    );
    const verdict = r.anyEngineWorks
      ? r.studioOpen
        ? "✅ Ready: at least one AI engine works."
        : "⚠️ An AI engine works, but the studio is switched off."
      : "⚠️ No AI engine worked. Guests will get the on-phone watercolour.";
    out.replaceChildren(el("p", { className: "verdict" }, verdict), el("ul", {}, ...items));
    out.classList.remove("hidden");
    refresh().catch(() => {});
  } catch (err) {
    out.replaceChildren(el("p", { className: "verdict" }, err.message));
    out.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Run the test";
  }
});

/* ---------- Start ---------- */

startDash().catch(() => showLogin());
