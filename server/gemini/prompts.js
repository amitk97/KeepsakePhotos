// Prompts sent to Gemini. Tune the wording here.

export const DESCRIBE_OUTFIT_PROMPT = [
  "You are a wedding costume expert. Describe, in precise detail, every visible garment and accessory",
  "worn by each person in this photo, so an illustrator could reproduce them exactly.",
  "For each person (left to right) give: garment type, cut and silhouette; exact colours (with approximate hex codes);",
  "fabric or material and its texture and sheen (e.g. raw silk, velvet, brocade, chiffon, organza, sequins, wool tweed);",
  "patterns, embroidery, beadwork and borders and where they sit; how it is draped or worn",
  "(e.g. dupatta over the left shoulder, pocket square, buttoned jacket); jewellery; hair accessories; footwear if visible;",
  "and a short note on hairstyle. Say clearly where the photo cuts off (e.g. 'cropped at the waist').",
  "Plain text, no preamble, under 250 words.",
].join(" ");

export function buildCaricaturePrompt(outfitNotes = "") {
  const sections = [
    "Create a charming, flattering soft watercolour caricature painting of the person or people in the reference photo.",

    "LIKENESS: keep each person clearly recognisable: face shape, skin tone, hairstyle, facial hair, glasses and warm expression. " +
      "If there are several people, include every one of them, each equally recognisable. " +
      "Caricature exaggeration applies ONLY to the head (slightly larger head, playful expression). Bodies keep natural proportions.",

    "OUTFIT IS THE MOST IMPORTANT REQUIREMENT. Reproduce every garment and accessory exactly as in the photo: " +
      "the same colours, the same fabrics and their textures and sheen, the same patterns, embroidery, beadwork and borders, " +
      "the same cut, silhouette, drape and way it is worn, and the same jewellery. " +
      "Do NOT simplify, restyle, recolour, modernise or swap any clothing. " +
      "Pure watercolour only: soft wet-on-wet blends and gentle colour bleeds, no ink outlines, no pencil or sketch lines. " +
      "Show fabric texture visibly in the watercolour: the sheen of silk, the soft pile of velvet, the sparkle of sequins, " +
      "the fine detail of embroidery and zari work.",

    "Do not invent clothing that is not visible in the photo. If the photo is cropped, end the figures with a soft watercolour fade at that point.",
  ];

  if (outfitNotes.trim()) {
    sections.push(`Outfit reference notes (follow these exactly):\n${outfitNotes.trim()}`);
  }

  sections.push(
    "COMPOSITION: portrait orientation, figures centred and shown from head to at least the knees where the photo allows, " +
      "so the whole outfit is visible. Plain warm ivory background (#FAF6EE) with a soft watercolour wash.",
    "DO NOT include any text, letters, speech bubbles, borders, frames, watermarks or signatures."
  );

  return sections.join("\n\n");
}
