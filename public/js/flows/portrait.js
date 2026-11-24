// Making the keepsake: ask the AI (with place-in-line updates), fall back to the on-phone
// watercolour if no AI is free, lay out the keepsake, and show the result.

import { SETTINGS } from "../config.js";
import { t } from "../i18n/index.js";
import { state } from "../state.js";
import * as ui from "../ui/dom.js";
import { hideCompare, showCompare } from "../ui/compare.js";
import { getDesign } from "../ui/design.js";
import { loadImage } from "../media/photo.js";
import { fetchQueuePosition, newRequestId, requestCaricature } from "../services/api.js";
import { sendKeepsakeToHosts } from "../services/siteSettings.js";
import { canShareFiles } from "../services/share.js";
import { watercolorize } from "../fallback/watercolour.js";
import { composePortrait, waitForFonts } from "../portrait/compose.js";
import { goToStep } from "./navigation.js";

const canvas = () => ui.$("portraitCanvas");

// Returns { image, artUrl, ticket, quick }.
async function paint(requestId) {
  try {
    const { image: url, keepsakeTicket } = await requestCaricature({
      photoBase64: state.photoBase64,
      smallPhotoBase64: state.smallPhotoBase64,
      requestId,
    });
    return { image: await loadImage(url), artUrl: url, ticket: keepsakeTicket || null, quick: false };
  } catch (err) {
    if (!err.useFilter) throw err;
    console.warn("Using on-phone watercolour:", err.message);
    const image = watercolorize(await loadImage(state.photoDataUrl));
    return { image, artUrl: image.toDataURL("image/jpeg", 0.9), ticket: err.keepsakeTicket || null, quick: true };
  }
}

async function showKeepsake({ image, artUrl, ticket, quick }) {
  const nameLine = t("illustratedFor", state.guestName);
  await waitForFonts(`${nameLine} ${state.guestMessage}`);
  const { frame, monogram } = getDesign();
  composePortrait(canvas(), { image, guestName: state.guestName, message: state.guestMessage, nameLine, frame, monogram });
  canvas().setAttribute("aria-label", t("keepsakeAlt", state.guestName, state.guestMessage));
  showCompare(state.photoDataUrl, artUrl);
  sendKeepsakeToHosts(canvas(), state.guestName, ticket);
  ui.setQuickNote(quick);
  goToStep(4);
  ui.$("shareBtn").classList.toggle("hidden", !(await canShareFiles(canvas(), state.guestName)));
}

// Also used by "Paint It Again".
export async function makePortrait() {
  if (state.busy || !state.photoBase64) return;
  state.busy = true;
  goToStep(3);
  ui.setQuickNote(false);
  hideCompare();
  const stopProgress = ui.startProgress(t("progress"), SETTINGS.progressIntervalMs);

  const requestId = newRequestId();
  const poll = setInterval(async () => {
    const { position } = await fetchQueuePosition(requestId);
    ui.showQueuePosition(position, SETTINGS.secondsPerPortrait);
  }, SETTINGS.queuePollMs);

  try {
    await showKeepsake(await paint(requestId));
  } catch (err) {
    console.error("Generation failed:", err);
    goToStep(2);
    ui.showError(t(err.code || "errGeneric"));
  } finally {
    clearInterval(poll);
    ui.showQueuePosition(-1);
    stopProgress();
    state.busy = false;
  }
}
