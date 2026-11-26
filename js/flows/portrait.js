// Making the keepsake. Asks AI artists in turn until one paints a caricature:
//   1. your own server's engines (Cloudflare, FLUX on Modal), once they're set up;
//   2. free public artists on Hugging Face, straight from the guest's phone (no account, no cost);
//   3. if every artist is busy, the guest is asked to try again (their photo and words are kept).
// Then lays out the keepsake and shows the result.

import { SETTINGS } from "../config.js";
import { t } from "../i18n/index.js";
import { state } from "../state.js";
import * as ui from "../ui/dom.js";
import { hideCompare, showCompare } from "../ui/compare.js";
import { getDesign } from "../ui/design.js";
import { loadImage } from "../media/photo.js";
import { fetchQueuePosition, newRequestId, requestCaricature } from "../services/api.js";
import { sendKeepsakeToHosts, stylePrompt } from "../services/siteSettings.js";
import { paintWithFreeArtists } from "../ai/huggingFace.js";
import { reportPainted } from "../services/todayCount.js";
import { composePortrait, waitForFonts } from "../portrait/compose.js";
import { tintPaper } from "../portrait/tint.js";
import { backgroundById } from "../ai/styles.js";
import { goToStep } from "./navigation.js";

const canvas = () => ui.$("portraitCanvas");

// Without fetch(), which the site's security policy doesn't allow for data: addresses.
function dataUrlToBlob(dataUrl) {
  const [head, data] = dataUrl.split(",");
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: head.match(/data:([^;]+)/)?.[1] || "image/jpeg" });
}

async function blobToImage(blob) {
  const url = URL.createObjectURL(blob);
  const image = await loadImage(url);
  const artUrl = await new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
  URL.revokeObjectURL(url);
  return { image, artUrl };
}

// Returns { image, artUrl, ticket }. Throws if no artist could paint.
async function paint(requestId) {
  let ticket = null;
  // 1. Your server's engines.
  try {
    const { image: url, keepsakeTicket } = await requestCaricature({
      photoBase64: state.photoBase64,
      smallPhotoBase64: state.smallPhotoBase64,
      requestId,
      background: state.background,
    });
    return { image: await loadImage(url), artUrl: url, ticket: keepsakeTicket || null };
  } catch (err) {
    if (!err.useFilter) throw err; // a problem with the photo or limits: tell the guest
    console.info("Server artists unavailable, asking free artists:", err.message);
    ticket = err.keepsakeTicket || null; // still lets this keepsake reach the hosts' Drive
  }

  // 2. Free artists on Hugging Face.
  const photo = dataUrlToBlob(`data:image/jpeg;base64,${state.photoBase64}`); // the copy with headroom
  const { blob } = await paintWithFreeArtists(photo, stylePrompt(state.background), {
    onTry: (n, total) => ui.showStatus(n > 1 ? t("tryingArtist", n, total) : ""),
  });
  reportPainted();
  return { ...(await blobToImage(blob)), ticket };
}

async function showKeepsake({ image, artUrl, ticket }) {
  // Make sure the chosen background colour shows, even if the AI ignored it.
  const tint = backgroundById(state.background).tint;
  if (tint) {
    try {
      const tinted = tintPaper(image, tint);
      image = tinted;
      artUrl = tinted.toDataURL("image/jpeg", 0.92);
    } catch (err) {
      console.warn("Couldn't tint the background:", err); // e.g. a picture from another site that can't be read
    }
  }
  const nameLine = t("illustratedFor", state.guestName);
  await waitForFonts(`${nameLine} ${state.guestMessage}`);
  const { frame, monogram } = getDesign();
  composePortrait(canvas(), { image, guestName: state.guestName, message: state.guestMessage, nameLine, frame, monogram });
  canvas().setAttribute("aria-label", t("keepsakeAlt", state.guestName, state.guestMessage));
  showCompare(state.photoDataUrl, artUrl);
  sendKeepsakeToHosts(canvas(), state.guestName, ticket, state.photoDataUrl, { guestMessage: state.guestMessage, background: state.background });
  goToStep(4);
  revealPainting();
}

// The keepsake appears like a watercolour wash spreading across the paper.
function revealPainting() {
  const el = canvas();
  el.classList.remove("reveal");
  void el.offsetWidth; // restart the animation for "Paint It Again"
  el.classList.add("reveal");
}

// Also used by "Paint It Again" and "Try again".
export async function makePortrait() {
  if (state.busy || !state.photoBase64) return;
  state.busy = true;
  goToStep(3);
  hideCompare();
  const stopProgress = ui.startProgress(t("progress"), SETTINGS.progressIntervalMs);

  const requestId = newRequestId();
  const poll = setInterval(async () => {
    const { position } = await fetchQueuePosition(requestId);
    if (position > 0) ui.showQueuePosition(position, SETTINGS.secondsPerPortrait);
  }, SETTINGS.queuePollMs);

  try {
    await showKeepsake(await paint(requestId));
  } catch (err) {
    console.error("No artist could paint:", err);
    goToStep(2);
    ui.showError(t(err.code || "errAllBusy"));
  } finally {
    clearInterval(poll);
    ui.showStatus("");
    stopProgress();
    state.busy = false;
  }
}
