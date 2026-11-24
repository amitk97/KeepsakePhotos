// Keeps the guest's name and message if the page reloads (e.g. after the phone camera app).

const KEYS = { step: "pa_wedding_step", name: "pa_wedding_name", message: "pa_wedding_msg" };

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function saveDraft({ step, name, message }) {
  safe(() => {
    if (step !== undefined) sessionStorage.setItem(KEYS.step, String(step));
    if (name !== undefined) sessionStorage.setItem(KEYS.name, name);
    if (message !== undefined) sessionStorage.setItem(KEYS.message, message);
  });
}

export function loadDraft() {
  return safe(
    () => ({
      step: Number(sessionStorage.getItem(KEYS.step)) || 1,
      name: sessionStorage.getItem(KEYS.name) || "",
      message: sessionStorage.getItem(KEYS.message) || "",
    }),
    { step: 1, name: "", message: "" }
  );
}

export function clearDraft() {
  safe(() => Object.values(KEYS).forEach((k) => sessionStorage.removeItem(k)));
}
