// Shows today's keepsake count under the welcome text, once at least one has been painted.

import { onLangChange, t } from "../i18n/index.js";
import { fetchTodayCount } from "../services/todayCount.js";
import { $ } from "./dom.js";

let count = null;

function render() {
  const el = $("todayCount");
  el.textContent = count > 0 ? t("todayCount", count) : "";
  el.classList.toggle("hidden", !(count > 0));
}

export async function initTodayCount() {
  count = await fetchTodayCount();
  render();
  onLangChange(render);
  // Keep it fresh while the welcome page is open.
  setInterval(async () => {
    if (document.hidden) return;
    count = await fetchTodayCount();
    render();
  }, 60_000);
}
