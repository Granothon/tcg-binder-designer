# Michify

An open-source binder art designer for TCG (Trading Card Game) collections. Design custom inserts, plan Michi Method spreads, and export print-ready layouts with millimeter precision.

Live app: https://granothon.github.io/tcg-binder-designer

## What is this?

Michify makes it easy to design and print binder art without manual measuring or complicated software. Whether you're building a Pokémon 151 spread, creating custom Magic binder pages, or planning Yu-Gi-Oh! collection layouts, Michify handles the math so you can focus on the design.

Unlike collection management apps that focus on tracking cards, Michify is a precision printing tool: it produces printable images that fit your binder pockets exactly.

## Features

- **Custom binder dimensions** — set exact pocket width, height, and seam sizes for your specific binder
- **Multi-pocket image slots** — design artwork spanning multiple pockets in any rectangular configuration
- **Undo / redo** — Ctrl+Z / Ctrl+Y (or the header buttons) step back through every edit
- **Autosave & session restore** — work is continuously saved in your browser; if the tab closes, Michify offers to restore it on the next visit
- **Flexible image input** — drag & drop files, click **Add image…** to browse (multiple files fill free pockets automatically), or paste an image straight from the clipboard with Ctrl+V
- **Expand and trim slots** — grow an image slot one pocket at a time (left, right, up, down) so a single image spans the extra pockets as one unified piece, and trim any side back if you overshoot
- **Michi Method support** — handle cut and continuous seams (side-loading binders where pockets face each other) and mark pockets as intentionally empty for balanced compositions
- **Right-click context menu** — quick access to the most common actions (mark/unmark empty, remove image, copy/paste crop, and expand) right where you're working
- **Absolute mm-based sizing** — same zoom shows the same image size across different slot dimensions
- **Smart image handling** — auto-fit cover mode, drag to pan, wheel to zoom, arrow keys for pixel-precision
- **Copy and clone** — copy image crops between slots, move or swap images between slots
- **Multi-page projects** — design a whole binder in one session, save as JSON for later editing
- **Rounded corners** — optional preview and print output with rounded corners; default radius matches the official TCG card standard
- **Print quality guidance** — the print dialog lists every image that would look soft at its intended size, with its page and pocket location
- **Clean, collapsible UI** — sidebar sections fold away and the built-in hint texts can be hidden once you know the tool
- **Smart bin-packing printing** — automatically arranges pieces on A4/A3 sheets with proper cutting margins
- **Print calibration page** — a 100 mm test ruler that verifies your printer is not scaling the page before you commit paper and ink
- **Scale compensation** — for precision printing: enter the measured lengths of the calibration bars and Michify counter-scales the output per axis to cancel your printer's remaining error

## Getting started

1. Open the live app in your browser
2. Measure your binder's actual pocket dimensions with a ruler
3. Enter the measurements in the sidebar (pocket width, height, seam sizes)
4. Set the layout (rows × columns)
5. Configure seams by clicking them (red = cut, teal = continuous)
6. Choose a corner style (no rounding by default, or rounded corners with adjustable radius)
7. Click or drag over pockets to select an area
8. Drop an image onto the selected area (or click **Add image…**, or paste one with Ctrl+V), or press E to mark the pocket as intentionally empty
9. Adjust the crop with your mouse (drag to pan, wheel to zoom) or the arrow keys
10. Use **Expand slot** in the right panel to grow the image across neighboring pockets, or right-click a pocket for quick actions
11. Click Print / PDF to export at the exact size for your binder

Your work is autosaved in the browser as you go, and Ctrl+Z undoes any misstep. Use **Save JSON** for backups and for moving projects between devices.

## Keyboard shortcuts

Michify supports common shortcuts familiar from other design and office tools.

### Global

| Shortcut | Action |
|---|---|
| Ctrl+Z / Cmd+Z | Undo |
| Ctrl+Y or Ctrl+Shift+Z | Redo |
| Ctrl+V with an image in the clipboard | Paste the image into the selected pocket |

### View zoom (when no image is selected)

| Shortcut | Action |
|---|---|
| Scroll wheel | Zoom in / out |
| + / - | Zoom in / out by 10% |
| Ctrl+0 / Cmd+0 | Reset zoom to 100% |
| Click zoom % in sidebar | Reset zoom to 100% |
| Drag the zoom slider | Fast visual adjustment |

### Image editing (when an image slot is selected)

| Shortcut | Action |
|---|---|
| Scroll wheel over the slot | Zoom the image inside the slot |
| + / - | Zoom the image by 3 mm |
| Arrow keys | Nudge the image by 1 mm (Shift for 10 mm) |
| Ctrl+C / Ctrl+V | Copy / paste image crops between slots (Ctrl+V pastes a clipboard image instead when one was copied more recently) |
| Delete | Remove the image from the selected slot |

### Selection

| Shortcut | Action |
|---|---|
| Click a pocket | Select it |
| Drag across pockets | Select a rectangular area for multi-pocket slots |
| Shift+click a pocket | Extend selection to a rectangular area |
| Right-click a pocket | Open the context menu (mark empty, remove image, copy/paste crop, expand) |
| Click empty canvas background | Clear all selections and pan freely |
| E | Mark selected pocket (or range) as intentionally empty. Press again to unmark. |
| Alt + drag an image | Move the image to another slot, or swap it with the target image |

## Understanding seams

Binders come in different styles, and the seams between pockets behave differently.

**Cut seams** are where the binder material sits between two pockets. The image is lost in this area (typically 2–5 mm). Michify shows this as a gray strip in the preview so you know what disappears.

**Continuous seams** exist in side-loading binders where two pockets face each other with their openings pointing toward the same seam. In these binders, an image can slide behind the seam material into both pockets, creating a seamless visual across the gap.

Not sure what your binder has? Look at a pair of adjacent pockets and check which direction each one opens. If they open toward each other (openings pointing at the seam), it's likely a continuous seam. If they both open the same direction, it's a cut seam.

## Understanding slots: expand vs. separate pockets

There are two ways to make an image cover more than one pocket, and they produce different results:

**Expand a slot** grows the current slot so one image spans the extra pockets as a single unified piece. Use the **Expand slot** buttons in the right panel (or the right-click menu) to grow left, right, up, or down one pocket at a time. The **Trim** buttons below them do the opposite: they remove the outermost pocket from the chosen side, so every edge of the slot can be moved outward or inward freely. This is the right choice when you want one continuous artwork across several pockets. With continuous seams the image flows across the gap; with cut seams it is split into separate printable pieces but still treated as one design.

**Copy / paste crop** places the same image into a separate, independent pocket. Use Ctrl+C / Ctrl+V (or the right-click menu) when you want the same picture in another pocket that you can adjust independently.

To move or swap images between slots, hold Alt and drag an image onto another pocket.

## Understanding corner styles

Michify offers three corner styles to match your aesthetic preference and available tools.

- **No rounding (default)** — straight corners on all images. Choose this if you're using scissors or don't have specific tools for corner cutting. Also good if you prefer the crisp look of sharp corners.
- **Round outer edges** — the outer corners of each image piece are rounded. Multi-pocket spanning artwork (with continuous seams) is treated as one unified piece with only the outermost corners rounded. This creates a look where the whole spread appears as one large card.
- **Round every card** — each individual pocket gets its own set of rounded corners. Multi-pocket spanning artwork shows rounded corners at every pocket boundary, making the layout look like separate cards placed next to each other.

The default corner radius is 3.18 mm, which matches the official TCG card corner radius exactly (1/8 inch = 3.175 mm). This makes printed inserts visually indistinguishable from real cards when placed side by side. Adjust the radius if your specific card game uses different dimensions or if you prefer a different aesthetic.

The rounded corner effect works two ways during printing:

- **On white paper** — the rounded corners blend perfectly with the paper, giving the visual appearance of pre-cut rounded cards
- **On any paper color** — the rounded areas serve as cutting guides. Cut straight along the edges and the "corners" define where your card's rounded shape ends.

No corner cutter tool needed either way.

## Measuring your binder

The pocket dimensions in Michify refer to the practical inside area where a card sits snugly (card size + small tolerance). For a standard TCG binder holding 63×88 mm cards, this is typically around 68×93 mm.

For seams, measure the visible gap between two adjacent pocket openings when cards are inserted. Most modern binders have 2–4 mm seams.

## Printing tips

Michify handles the complex parts of printing automatically.

- **Bin packing** — multiple images are arranged efficiently on each A4 or A3 sheet, rotating pieces when needed to save paper
- **Cutting margins** — the gap between printed pieces matches your binder's seam width, so you can cut straight lines with a paper cutter
- **Corner rounding** — enable rounded corners in the sidebar to add professional-looking rounded corners automatically. Works as both visual style and cutting guide.
- **Physical accuracy** — all measurements are in real millimeters. Print at 100% scale (not "fit to page") for pixel-perfect results.
- **Calibration** — not sure your printer honors 100% scale? Click **Calibration page** in the print dialog and measure the printed 100 mm ruler before printing your inserts.
- **Scale compensation** — if the calibration bars are still slightly off at 100% scale (most printers have a small paper-feed error), enter the measured bar lengths in the print dialog. Michify stretches the output by the inverse amount, separately for each axis. Reprint the calibration page to verify: the bars should then measure exactly 100 mm. The setting is remembered per browser, since it belongs to your printer rather than to any project.

The print dialog estimates each image's effective DPI and warns you if any would look soft or pixelated. If you see a low-DPI warning, the fix is a higher-resolution source image, not a Michify setting.

For best results, use matte cardstock (around 300 gsm) rather than regular printer paper. It feels closer to real cards in the binder pocket.

## Development

Michify is a single-page web app built with vanilla HTML, CSS, and JavaScript. No frameworks, no build step, no dependencies — it runs on any static host (the live app is plain GitHub Pages).

    tcg-binder-designer/
    ├── index.html          HTML structure
    ├── style.css           Styling and layout
    ├── js/
    │   ├── main.js         UI, rendering, printing, autosave (browser entry point)
    │   ├── state.js        Project state, undo history, save-file format
    │   ├── geometry.js     Pure geometry and image placement math
    │   ├── packing.js      Print-sheet bin packing
    │   └── storage.js      IndexedDB autosave
    ├── test/               Unit tests + browser test runners
    ├── package.json        Test script only — the app has no dependencies
    ├── README.md           This file
    └── LICENSE             MIT license

The code is split into ES modules, so run it from a local web server rather than opening index.html directly from disk (browsers block module loading over file://). VSCode's Live Server extension or any static server works:

    python -m http.server   # then open http://localhost:8000

### Testing

The pure logic (geometry, image placement, bin packing, undo history, save format) is covered by unit tests:

- `npm test` (or `node --test test/`) runs them in Node — no packages to install
- `test/browser.html` runs the same test files in a browser, if you don't have Node
- `test/e2e.html` drives the real app in an iframe: pastes an image, rotates it, checks undo/redo and autosave

## Contributing

Contributions are welcome. If you find a bug or want to suggest a feature, please open an issue.

## About the Michi Method

The Michi Method is a binder art technique popularized by @peeplop on Instagram. Instead of filling every pocket uniformly, it uses layouts that mix single cards, multi-slot visual panels, and intentional negative space, treating the whole page as a canvas.

Michify is an independent tool that supports designing for this method with precise measurements. It is not officially affiliated with any Michi Method creators or communities. It's built to make the design process easier and more accurate.

Community resources:

- @peeplop on Instagram — original creator
- Michi Method community Discord (link via @peeplop's Instagram bio)
- Full Michi Method guide by woahpoke — excellent introduction to the technique

## Support the project

Michify is free and open source, and always will be. If it saved you time or helped you build something cool, consider buying me a coffee ☕. Every contribution helps keep this tool maintained and improved.

## License

MIT © 2026 Risto Ruuskanen

## Author

Created and maintained by Risto Ruuskanen.

- GitHub: [@granothon](https://github.com/granothon)
- Ko-fi: [ko-fi.com/granothon](https://ko-fi.com/granothon)