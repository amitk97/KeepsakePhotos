// Canvas text layout helpers. Pure functions: they only need ctx.measureText.

// Wraps by word, breaking any single word that is too wide on its own.
export function wrapText(ctx, text, maxWidth) {
  const words = [];
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (ctx.measureText(word).width <= maxWidth) {
      words.push(word);
      continue;
    }
    let chunk = "";
    for (const ch of Array.from(word)) {
      if (chunk && ctx.measureText(chunk + ch).width > maxWidth) {
        words.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    if (chunk) words.push(chunk);
  }

  if (!words.length) return [""];
  const lines = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const test = `${current} ${word}`;
    if (ctx.measureText(test).width <= maxWidth) current = test;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

// Limits to maxLines, adding an ellipsis to the last line if text was cut.
export function clampLines(ctx, lines, maxLines, maxWidth) {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = fitText(ctx, `${kept[maxLines - 1]} ${lines[maxLines]}`, maxWidth, true);
  return kept;
}

// Shortens text with an ellipsis until it fits.
export function fitText(ctx, text, maxWidth, forceEllipsis = false) {
  if (!forceEllipsis && ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && ctx.measureText(chars.join("") + "…").width > maxWidth) chars.pop();
  return chars.join("").trimEnd() + "…";
}
