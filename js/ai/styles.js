// The watercolour caricature styles: the instructions every AI engine is given.
// One list, used by the guest's phone (free Hugging Face artists) and by the server (Cloudflare, FLUX).
// Every style keeps the same rules (likeness, exact outfits, everyone in a group, watercolour, no text);
// only the character changes. The admin page's style lab picks the one every guest gets.

const KEEP_RULES =
  "Zoom out so everyone fits fully inside the picture: show the whole head and hair of every person, with empty paper above the tallest head (about a tenth of the picture), and never crop heads, hair, hands or feet at the edges. " +
  "Keep each person instantly recognisable as themselves: the same face shape, eyes, eyebrows, nose, lips, smile, beard or moustache, glasses and any marks like a bindi or a mole. " +
  "Then exaggerate these real features in a playful caricature way (bigger smile, bolder eyebrows, rounder cheeks), never replacing them with generic cartoon features. " +
  "Keep each person's real hairstyle: the same length, colour, parting, fringe, curls or volume, and the same position (over a shoulder, behind an ear, in a bun or plait, under a dupatta or turban). " +
  "Paint the hair in loose, exaggerated watercolour strokes, so it is clearly their hair but in caricature style. " +
  "Keep everyone in their original positions relative to each other, and keep their real relative heights (children smaller, tall people taller) so family photos look natural. " +
  "Keep each person's exact pose from the photo, with the same arm and hand positions. Only paint someone sitting if the photo clearly shows them sitting on something you can see (a car seat, chair, sofa or the floor); never stand a seated person up. " +
  "If the legs are not in the photo, the person is standing: paint them standing upright, never sitting or cross-legged. " +
  "Keep any jewellery, mehndi, glasses and turbans exactly as they are. " +
  "Keep natural, true skin tones with no colour cast from the background. " +
  "Paint only the main subjects: the people at the front who are posing for the photo, in focus and facing the camera. Leave out everyone else, such as people in the background, passers-by, or anyone partly cut off at the edges, and never add anyone. Include every main subject, each equally recognisable. " +
  "Keep their outfits exactly the same: identical colours, fabrics, textures, sheen, patterns, embroidery, borders, " +
  "drape, silhouette and jewellery. Do not change, simplify or restyle the clothing. " +
  "Leave out any writing or logos on clothes rather than inventing letters. ";

const ENDING =
  "Pure watercolour only: no ink outlines, no pencil, no sketch lines. " +
  "BACKGROUND No text, no borders, no signature.";

// Background colours guests can pick. "BACKGROUND" in a prompt is replaced with the chosen one.
export const BACKGROUNDS = [
  { id: "ivory", swatch: "#f7f1e6", tint: "#eadfc8", prompt: "Background: white watercolour paper with only very faint, cloudy warm ivory washes around the edges, fading to plain white behind the people." },
  { id: "blush", swatch: "#f3d9dc", tint: "#eab4bf", prompt: "Background: white watercolour paper with soft, cloudy blush pink watercolour washes in light and deeper shades of blush pink only, pooling darker in places and blooming where the paint bled, mostly around the edges and corners, fading to plain white paper behind and around the people, with rough uneven edges, faint paper grain and a few tiny blush pink speckles; light and pastel, never strong." },
  { id: "sage", swatch: "#d5e0cf", tint: "#b3cca5", prompt: "Background: white watercolour paper with soft, cloudy sage green watercolour washes in light and deeper shades of sage green only, pooling darker in places and blooming where the paint bled, mostly around the edges and corners, fading to plain white paper behind and around the people, with rough uneven edges, faint paper grain and a few tiny sage green speckles; light and pastel, never strong." },
  { id: "blue", swatch: "#d6e4f0", tint: "#a7c6e6", prompt: "Background: white watercolour paper with soft, cloudy powder blue watercolour washes in light and deeper shades of powder blue only, pooling darker in places and blooming where the paint bled, mostly around the edges and corners, fading to plain white paper behind and around the people, with rough uneven edges, faint paper grain and a few tiny powder blue speckles; light and pastel, never strong." },
  { id: "lilac", swatch: "#e2d8ee", tint: "#c6b3e3", prompt: "Background: white watercolour paper with soft, cloudy lilac watercolour washes in light and deeper shades of lilac only, pooling darker in places and blooming where the paint bled, mostly around the edges and corners, fading to plain white paper behind and around the people, with rough uneven edges, faint paper grain and a few tiny lilac speckles; light and pastel, never strong." },
  { id: "peach", swatch: "#f8dcc8", tint: "#f2bf9c", prompt: "Background: white watercolour paper with soft, cloudy peach watercolour washes in light and deeper shades of peach only, pooling darker in places and blooming where the paint bled, mostly around the edges and corners, fading to plain white paper behind and around the people, with rough uneven edges, faint paper grain and a few tiny peach speckles; light and pastel, never strong." },
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
      "Paint standing people as full standing figures from head to feet (add matching legs and shoes if the photo is cropped), and seated people sitting. Make the head huge, about as big as the rest of the body, on a small, cute body. " +
      "Give every person in the picture the same caricature treatment: each one gets the big head and small body, not just one of them. " +
      "Strongly exaggerate each person's most distinctive features (smile, eyebrows, hair, beard, nose, cheeks) in a fun, flattering way. " +
      "Remove the original background completely: no lights, lamps, decorations, furniture, plants, walls, stages or scenery from the photo. The only exception is what a person is sitting on (a car seat, chair or sofa), kept as a simple sketch so the pose makes sense. Keep anything a person is holding, such as a glass, bag or bouquet. " +
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
