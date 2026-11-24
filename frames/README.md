# Your own frame and monogram

Open `frame-template.svg` in Figma, Canva, Procreate or Illustrator. It shows where the app draws everything.

## Frame

- **Size:** 1200 × 1800 px (a 4×6 print), saved as **PNG with transparency**.
- **Keep transparent:**
  - the **painting window**: x 192, y 442, 816 × 1088 px (rounded corners, 16 px radius);
  - the **message bubble**: x 140, y 210, 920 × 194 px;
  - the **text areas**: couple names and venue (y 60–190) and guest name (y 1560–1680).
- Your frame is drawn **on top** of everything, so anything solid will cover the painting or text.
- It replaces the built-in gold and green border.

Save it as `public/frames/frame.png`, then in `public/js/config.js` set:

```js
frameOverlay: "frames/frame.png",
```

## Monogram

- A **square PNG with a transparent background**, at least 400 × 400 px.
- It appears small at the bottom of each keepsake (56 px tall, centred under the guest's name) and on the welcome screen.

Save it as `public/frames/monogram.png`, then set:

```js
monogram: "frames/monogram.png",
```

Then add `/frames/frame.png` and `/frames/monogram.png` to the `SHELL` list in `public/sw.js` so they work offline, and bump `CACHE` (e.g. `keepsake-v3`).
