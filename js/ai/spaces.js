// Free public AI artists on Hugging Face ("Spaces"), tried in this order from the guest's phone.
// No account or key: each guest uses Hugging Face's free allowance for their own phone.
// Each entry: the Space's web address and the name of its painting function.
// They all run FLUX.1 Kontext [dev] with the same inputs (photo, prompt, seed, random seed, guidance, steps).
//
// To add one: find a FLUX.1 Kontext Space on huggingface.co/spaces, open "Use via API" at the bottom
// of its page, and check it takes those inputs. Its address is https://OWNER-SPACE-NAME.hf.space
// (lowercase, dots become hyphens).

export const SPACES = [
  { name: "FLUX Kontext (official)", url: "https://black-forest-labs-flux-1-kontext-dev.hf.space", fn: "infer" },
  { name: "FLUX Kontext (zerogpu-aoti)", url: "https://zerogpu-aoti-flux-1-kontext-dev.hf.space", fn: "infer" },
  { name: "FLUX Kontext (victor)", url: "https://victor-flux-1-kontext-dev.hf.space", fn: "infer" },
  { name: "FLUX Kontext (mcp-tools)", url: "https://mcp-tools-flux-1-kontext-dev.hf.space", fn: "infer" },
  { name: "FLUX Kontext (echo3700)", url: "https://echo3700-flux-1-kontext-dev.hf.space", fn: "infer" },
];

// Settings sent with each painting. Fewer steps = faster and uses less free allowance.
export const PAINT_OPTIONS = { guidance: 2.5, steps: 24 };

// Give up on one artist after this long and try the next.
export const SPACE_TIMEOUT_MS = 150_000;

// Tests can swap the list: window.__KEEPSAKE_SPACES__ = [...]
export function activeSpaces() {
  return (typeof window !== "undefined" && window.__KEEPSAKE_SPACES__) || SPACES;
}
