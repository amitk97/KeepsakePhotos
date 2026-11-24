// Before/after slider: the guest's photo on the left, the painting on the right.

import { $ } from "./ui.js";

function setPosition(pct) {
  $("compare").style.setProperty("--pos", `${pct}%`);
}

export function showCompare(beforeUrl, afterUrl) {
  $("compareBefore").src = beforeUrl;
  $("compareAfter").src = afterUrl;
  $("compareRange").value = 50;
  setPosition(50);
  $("compareSection").classList.remove("hidden");
}

export function hideCompare() {
  $("compareSection").classList.add("hidden");
  $("compareBefore").removeAttribute("src");
  $("compareAfter").removeAttribute("src");
}

export function initCompare() {
  $("compareRange").addEventListener("input", (e) => setPosition(e.target.value));
}
