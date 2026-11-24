// In-page accessibility audit (WCAG 2.2 AA basics), run by run_e2e.py with page.evaluate.
// Returns a list of problems; empty = pass.
() => {
  const problems = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest(".hidden,[hidden],[aria-hidden=true]");
  };
  const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40)}"`;

  // Colour helpers
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const blend = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // Effective background: blend each ancestor's background colour from the page up.
  const background = (el) => {
    const chain = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.push(n);
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (const n of chain.reverse()) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) bg = blend(c, bg);
    }
    return bg;
  };

  if (!document.documentElement.lang) problems.push("html has no lang");
  if (document.querySelectorAll("h1").length !== 1) problems.push("page should have exactly one h1");

  for (const img of document.querySelectorAll("img")) if (!img.hasAttribute("alt")) problems.push(`image without alt: ${describe(img)}`);

  for (const el of document.querySelectorAll("button, a[href], [role=button]")) {
    if (!visible(el)) continue;
    const name = (el.getAttribute("aria-label") || el.textContent || el.title || "").trim();
    if (!name) problems.push(`control without a name: ${describe(el)}`);
  }

  for (const el of document.querySelectorAll("input:not([type=hidden]):not([type=file]), select, textarea")) {
    if (!visible(el) && el.type !== "range") continue;
    const named = el.labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
    if (!named) problems.push(`field without a label: ${describe(el)}`);
  }

  // Text contrast: 4.5:1, or 3:1 for large text (24px, or 18.66px bold).
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const checked = new Set();
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!el || checked.has(el) || !walker.currentNode.textContent.trim() || !visible(el)) continue;
    if (el.closest("script,style,canvas,svg,option")) continue;
    checked.add(el);
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    if (!fg) continue;
    const bg = background(el);
    const size = parseFloat(s.fontSize);
    const bold = Number(s.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    // Placeholder-like disabled controls are exempt under WCAG.
    if (el.closest(":disabled")) continue;
    const r = ratio(blend(fg, bg), bg);
    if (r < need) problems.push(`low contrast ${r.toFixed(2)} < ${need}: ${describe(el)}`);
  }
  return problems;
}
