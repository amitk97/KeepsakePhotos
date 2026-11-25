// The watercolour caricature styles: the instructions every AI engine is given.
// One list, used by the guest's phone (free Hugging Face artists) and by the server (Cloudflare, FLUX).
// Every style keeps the same rules (likeness, exact outfits, everyone in a group, watercolour, no text);
// only the character changes. The admin page's style lab picks the one every guest gets.

const KEEP_RULES =
  "Fit everyone fully inside the picture: show the whole head and hair of every person with clear empty space above the tallest head, and never crop heads, hair, hands or feet at the edges. " +
  "Keep every person clearly recognisable: same face shape, skin tone, hair, beard and expression. " +
  "Keep everyone in their original positions relative to each other, and keep their real relative heights (children smaller, tall people taller) so family photos look natural. " +
  "Keep each person's pose: anyone standing stays standing and anyone sitting stays sitting. " +
  "Keep any jewellery, mehndi, glasses and turbans exactly as they are. " +
  "Keep natural, true skin tones with no colour cast from the background. " +
  "Paint only the people who are in the photo, exactly as many as there are: never add anyone. If there are several people, include every one of them, each equally recognisable. " +
  "Keep their outfits exactly the same: identical colours, fabrics, textures, sheen, patterns, embroidery, borders, " +
  "drape, silhouette and jewellery. Do not change, simplify or restyle the clothing. " +
  "Leave out any writing or logos on clothes rather than inventing letters. ";

const ENDING =
  "Pure watercolour only: no ink outlines, no pencil, no sketch lines. " +
  "BACKGROUND No text, no borders, no signature.";

// Background colours guests can pick. "BACKGROUND" in a prompt is replaced with the chosen one.
export const BACKGROUNDS = [
  { id: "ivory", swatch: "#f7f1e6", prompt: "Plain soft ivory paper background, almost white, with only a very faint wash." },
  { id: "blush", swatch: "#f3d9dc", prompt: "Plain paper background with a soft blush pink watercolour wash." },
  { id: "sage", swatch: "#d5e0cf", prompt: "Plain paper background with a soft sage green watercolour wash." },
  { id: "blue", swatch: "#d6e4f0", prompt: "Plain paper background with a soft powder blue watercolour wash." },
  { id: "lilac", swatch: "#e2d8ee", prompt: "Plain paper background with a soft lilac watercolour wash." },
];
export const DEFAULT_BACKGROUND = "ivory";

export function backgroundById(id) {
  return BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS.find((b) => b.id === DEFAULT_BACKGROUND);
}

export const STYLE_VARIANTS = [
  {
    id: "caricature",
    name: "Wedding caricature",
    description: "A real caricature: big heads, big smiles, small bodies. The default.",
    prompt:
      "Turn this photo into a classic caricature painted in watercolour, like a caricature artist at a wedding. " +
      "Show the whole person from head to feet. Make the head huge, about as big as the rest of the body, on a small, cute body. " +
      "Give every person in the picture the same caricature treatment: each one gets the big head and small body, not just one of them. " +
      "Strongly exaggerate each person's most distinctive features (smile, eyebrows, hair, beard, nose, cheeks) in a fun, flattering way. " +
      "Replace the background with plain paper; keep only a hint of the setting. " +
      KEEP_RULES +
      "Paint the clothes in soft watercolour washes with clear detail. " +
      ENDING,
  },
  {
    id: "classic",
    name: "Classic soft",
    description: "Gentle washes, only a slightly bigger head.",
    prompt:
      "Repaint this photo as a soft, charming watercolour caricature painting for a wedding keepsake, with slightly enlarged heads. " +
      KEEP_RULES +
      "Paint the outfits in delicate watercolour washes with soft wet-on-wet blends, gentle colour bleeds and visible paper grain. " +
      ENDING,
  },
  {
    id: "fabric",
    name: "Rich fabric detail",
    description: "Deeper colour and more care on embroidery, zari and jewellery.",
    prompt:
      "Repaint this photo as a rich, detailed watercolour caricature painting for a wedding keepsake. " +
      KEEP_RULES +
      "Give the clothing extra care: layered transparent washes for deep, saturated colour, fine brush detail on embroidery, " +
      "zari and beadwork, and glints of light on silk and jewellery. Faces stay soft and luminous. " +
      ENDING,
  },
  {
    id: "loose",
    name: "Loose and airy",
    description: "Freer brushwork, lighter colour, lots of white paper.",
    prompt:
      "Repaint this photo as a loose, airy watercolour caricature painting for a wedding keepsake. " +
      KEEP_RULES +
      "Use confident, flowing brushstrokes, light transparent colour, soft blooms and plenty of white paper showing through, " +
      "while keeping each garment's true colours and patterns readable. " +
      ENDING,
  },
  {
    id: "storybook",
    name: "Storybook",
    description: "Warm, gentle picture-book feel, slightly more playful.",
    prompt:
      "Repaint this photo as a warm storybook-style watercolour caricature painting for a wedding keepsake. " +
      KEEP_RULES +
      "Use a gentle, cosy picture-book feel: rounded friendly shapes, rosy cheeks, warm golden light and soft graded washes, " +
      "with the outfits still painted faithfully. " +
      ENDING,
  },
];

export const DEFAULT_STYLE = "caricature";

export function styleById(id) {
  return STYLE_VARIANTS.find((v) => v.id === id) || STYLE_VARIANTS[0];
}

// Kept for anything that wants the default text directly.
// The full instructions for a style and background.
export function promptFor(styleId, backgroundId) {
  return styleById(styleId).prompt.replace("BACKGROUND", backgroundById(backgroundId).prompt + " ");
}

export const WATERCOLOUR_PROMPT = promptFor(DEFAULT_STYLE, DEFAULT_BACKGROUND);
