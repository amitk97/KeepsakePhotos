// The watercolour caricature styles: the instructions every AI engine is given.
// One list, used by the guest's phone (free Hugging Face artists) and by the server (Cloudflare, FLUX).
// Every style keeps the same rules (likeness, exact outfits, everyone in a group, watercolour, no text);
// only the character changes. The admin page's style lab picks the one every guest gets.

// Keep prompts SHORT (about 130 words in all). The AI reads only roughly the first 400 words, and every
// object it is told about, even "no chairs" or "children smaller", tends to appear in the picture.
// So: most important rules first, and describe what we want rather than listing things to avoid.
const KEEP_RULES =
  "Paint only the main subjects posing at the front, the same number of people as in the photo; leave out people in the background. " +
  "Keep every face recognisable: same face shape, eyes, nose, smile, beard, glasses, hairstyle and skin tone. " +
  "Keep their outfits exactly the same: identical colours, fabrics, patterns and layers. " +
  "Keep each person's pose and their places next to each other. ";

const ENDING = "Pure watercolour, no ink outlines. BACKGROUND No text.";

// Background colours guests can pick. "BACKGROUND" in a prompt is replaced with the chosen one.
export const BACKGROUNDS = [
  { id: "ivory", swatch: "#f7f1e6", tint: "#eadfc8", prompt: "Background: plain white paper with faint warm ivory washes at the edges." },
  { id: "blush", swatch: "#f3d9dc", tint: "#eab4bf", prompt: "Background: white paper with soft, cloudy blush pink watercolour washes around the edges, fading to white behind the people." },
  { id: "sage", swatch: "#d5e0cf", tint: "#b3cca5", prompt: "Background: white paper with soft, cloudy sage green watercolour washes around the edges, fading to white behind the people." },
  { id: "blue", swatch: "#d6e4f0", tint: "#a7c6e6", prompt: "Background: white paper with soft, cloudy powder blue watercolour washes around the edges, fading to white behind the people." },
  { id: "lilac", swatch: "#e2d8ee", tint: "#c6b3e3", prompt: "Background: white paper with soft, cloudy lilac watercolour washes around the edges, fading to white behind the people." },
  { id: "peach", swatch: "#f8dcc8", tint: "#f2bf9c", prompt: "Background: white paper with soft, cloudy peach watercolour washes around the edges, fading to white behind the people." },
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
      "Turn this photo into a watercolour caricature. " +
      KEEP_RULES +
      "Give every person a big head on a small body and playfully exaggerate their real features. " +
      "Show them full length; if their legs are outside the photo, paint them standing. " +
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
