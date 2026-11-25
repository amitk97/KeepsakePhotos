// The example before/after on the welcome card. Put two pictures in public/images/
// (sample-before.jpg and sample-after.jpg); until both load, the example stays hidden.

import { $ } from "./dom.js";

export function initSample() {
  const imgs = [$("sampleBefore"), $("sampleAfter")];
  let loaded = 0;
  for (const img of imgs) {
    img.addEventListener("load", () => {
      if (++loaded === imgs.length) $("welcomeSample").classList.remove("hidden");
    });
    img.src = img.dataset.src;
  }
}
