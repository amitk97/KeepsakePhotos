// The watercolour caricature styles: the instructions every AI engine is given.
// One list, used by the guest's phone (free Hugging Face artists) and by the server (Cloudflare, FLUX).
// Every style keeps the same rules (likeness, exact outfits, everyone in a group, watercolour, no text);
// only the character changes. The admin page's style lab picks the one every guest gets.

const KEEP_RULES =
  "Keep every person clearly recognisable: same face shape, skin tone, hair, beard and expression. " +
  "If there are several people, include every one of them, each equally recognisable, arranged naturally to fit a portrait-shaped painting. " +
  "Keep their outfits exactly the same: identical colours, fabrics, textures, sheen, patterns, embroidery, borders, " +
  "drape, silhouette and jewellery. Do not change, simplify or restyle the clothing. ";

const ENDING =
  "Pure watercolour only: no ink outlines, no pencil, no sketch lines. " +
  "Plain warm ivory paper background with a light watercolour wash. No text, no borders, no signature.";

export const STYLE_VARIANTS = [
  {
    id: "caricature",
    name: "Wedding caricature",
    description: "A real caricature: big heads, big smiles, small bodies. The default.",
    prompt:
      "Turn this photo into a hand-painted watercolour caricature, like a caricature artist at a wedding. " +
      "Exaggerate playfully: noticeably bigger heads on smaller bodies, big warm smiles, expressive eyes, " +
      "and each person's most distinctive features gently emphasised, always flattering. " +
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
export const WATERCOLOUR_PROMPT = styleById(DEFAULT_STYLE).prompt;
