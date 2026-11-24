// Shared app state for one guest session.

export const state = {
  guestName: "",
  guestMessage: "",
  photoBase64: null, // resized JPEG, without the data: prefix
  smallPhotoBase64: null, // <512px copy for the free Cloudflare engine
  photoDataUrl: null, // kept for the on-phone watercolour fallback
  busy: false,
};

export function clearPhoto() {
  state.photoBase64 = null;
  state.smallPhotoBase64 = null;
  state.photoDataUrl = null;
}
