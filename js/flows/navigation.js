// Moving between the four screens (welcome → details → painting → result), remembering where the guest was.

import * as ui from "../ui/dom.js";
import { saveDraft } from "../services/drafts.js";

export function goToStep(n) {
  ui.goToStep(n, { focus: ui.currentStep() !== n });
  saveDraft({ step: n });
}
