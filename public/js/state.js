// Shared app state for one guest session.

export const state = {
  guestName: "",
  guestMessage: "",
  photoBase64: null, // resized JPEG, without the data: prefix
  busy: false,
};

export function clearPhoto() {
  state.photoBase64 = null;
}
