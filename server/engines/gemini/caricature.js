// The two-step portrait pipeline: describe the outfit, then paint it.

import { DESCRIBE_OUTFIT_PROMPT, buildCaricaturePrompt } from "./prompts.js";
import { extractImage, extractText } from "./client.js";

export class NoImageError extends Error {}

export async function createCaricature(client, { imageBase64, mimeType = "image/jpeg", logger = console }) {
  const photoPart = { inlineData: { mimeType, data: imageBase64 } };

  // Step 1 is best effort: if it fails we still paint from the photo alone.
  let outfitNotes = "";
  try {
    const described = await client.generateContent(
      {
        contents: [{ role: "user", parts: [{ text: DESCRIBE_OUTFIT_PROMPT }, photoPart] }],
        generationConfig: { responseModalities: ["TEXT"] },
      },
      { attempts: 2 }
    );
    outfitNotes = extractText(described);
  } catch (err) {
    logger.warn("Outfit description skipped:", err.message);
  }

  const painted = await client.generateContent({
    contents: [{ role: "user", parts: [{ text: buildCaricaturePrompt(outfitNotes) }, photoPart] }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "3:4" },
    },
  });

  const image = extractImage(painted);
  if (!image) {
    const reason = painted?.candidates?.[0]?.finishReason || painted?.promptFeedback?.blockReason || "unknown";
    throw new NoImageError(`No image returned (${reason})`);
  }
  return { ...image, outfitNotes };
}
