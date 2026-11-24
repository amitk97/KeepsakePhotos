// Wedding details and app settings. Edit these to reuse the app for another event.
// Words guests read (messages, buttons) live in js/i18n/strings.js, in all three languages.

export const WEDDING = {
  coupleNames: "Pooja & Amit",
  venueLine: "SOMERSET ESTATE  •  APRIL 2028", // placeholder until the date is set
  footerLine: "WITH LOVE & CELEBRATION  •  POOJA & AMIT",
  fileNamePrefix: "Pooja_Amit_Wedding_Keepsake",
};

// Your own artwork. Put the files in public/frames/ and set the paths here (see public/frames/README.md).
export const DESIGN = {
  frameOverlay: null, // e.g. "frames/frame.png": 1200×1800 PNG with a transparent window for the painting
  monogram: null, // e.g. "frames/monogram.png": square PNG with a transparent background
};

export const THEME = {
  ivory: "#FAF6EE",
  parchment: "#F4EEE1",
  green: "#1D3B2D",
  gold: "#B89B62",
};

export const SETTINGS = {
  apiEndpoint: "api/generate", // relative, so the site also works from a sub-folder (GitHub Pages)
  requestTimeoutMs: 200_000,
  smallPhotoEdge: 496, // copy for the free Cloudflare engine (needs under 512px)
  maxPhotoEdge: 1536, // enough detail for fabric texture, small enough to upload quickly
  photoQuality: 0.9,
  maxFileBytes: 30 * 1024 * 1024,
  maxMessageLength: 60,
  heicConverterUrl: "vendor/heic2any.min.js", // MIT licence, see public/vendor/
  progressIntervalMs: 7000,
  queuePollMs: 2500,
  secondsPerPortrait: 25, // rough wait per guest ahead in line
};
