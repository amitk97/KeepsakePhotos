// Wedding details and app settings. Edit these to reuse the app for another event.

export const WEDDING = {
  coupleNames: "Pooja & Amit",
  venueLine: "SOMERSET ESTATE  •  OCTOBER 24, 2026",
  footerLine: "WITH LOVE & CELEBRATION  •  POOJA & AMIT",
  defaultMessage: "Cheers to Pooja & Amit!",
  presetMessages: [
    "Cheers to Pooja & Amit! 🥂",
    "Best night ever! ✨",
    "To love & laughter! 💍",
    "Dancing till midnight! 💃",
  ],
  fileNamePrefix: "Pooja_Amit_Wedding_Keepsake",
};

export const THEME = {
  ivory: "#FAF6EE",
  parchment: "#F4EEE1",
  green: "#1D3B2D",
  gold: "#B89B62",
};

export const SETTINGS = {
  apiEndpoint: "/api/generate",
  requestTimeoutMs: 280_000,
  maxPhotoEdge: 1536, // enough detail for fabric texture, small enough to upload quickly
  photoQuality: 0.9,
  maxFileBytes: 30 * 1024 * 1024,
  maxMessageLength: 60,
  heicConverterUrl: "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js",
  progressMessages: [
    "Studying your outfit…",
    "Matching fabrics & colours…",
    "Sketching in ink…",
    "Painting the watercolour…",
    "Adding the finishing touches…",
    "Warming up the studio, nearly there…",
  ],
  progressIntervalMs: 7000,
};
