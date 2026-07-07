# Michify

An open-source binder art designer for TCG (Trading Card Game) collections. Design custom inserts, plan Michi Method spreads, and export print-ready layouts with millimeter precision.

**Live app:** https://granothon.github.io/tcg-binder-designer

## What is this?

Michify makes it easy to design and print binder art without manual measuring or complicated software. Whether you're building a Pokémon 151 spread, creating custom Magic binder pages, or planning Yu-Gi-Oh! collection layouts, Michify handles the math so you can focus on the design.

Unlike collection management apps that focus on tracking cards, Michify is a precision printing tool: it produces printable images that fit your binder pockets exactly.

## Features

- **Custom binder dimensions** — set exact pocket width, height, and seam sizes for your specific binder
- **Multi-pocket image slots** — design artwork spanning multiple pockets in any rectangular configuration
- **Michi Method support** — handle cut and continuous seams (side-loading binders where pockets face each other) and mark pockets as intentionally empty for balanced compositions
- **Absolute mm-based sizing** — same zoom shows the same image size across different slot dimensions
- **Smart image handling** — auto-fit cover mode, drag to pan, wheel to zoom, arrow keys for pixel-precision
- **Clone and duplicate** — copy image crops between slots, extend images seamlessly to neighboring slots
- **Multi-page projects** — design a whole binder in one session, save as JSON for later editing
- **Rounded corners** — optional preview and print output with rounded corners; default radius matches the official TCG card standard
- **Print quality guidance** — the print dialog warns you if any image would look soft at its intended size
- **Smart bin-packing printing** — automatically arranges pieces on A4/A3 sheets with proper cutting margins

## Getting started

1. Open the [live app](https://granothon.github.io/tcg-binder-designer) in your browser
2. Measure your binder's actual pocket dimensions with a ruler
3. Enter the measurements in the sidebar (pocket width, height, seam sizes)
4. Set the layout (rows × columns)
5. Configure seams by clicking them (red = cut, teal = continuous)
6. Choose a corner style (no rounding by default, or rounded corners with adjustable radius)
7. Click or drag over pockets to select an area
8. Drop an image onto the selected area, or press `E` to mark the pocket as intentionally empty
9. Adjust the crop with your mouse (drag to pan, wheel to zoom) or the arrow keys
10. Click **Print / PDF** to export at the exact size for your binder

## Keyboard shortcuts

Michify supports common shortcuts familiar from other design and office tools.

### View zoom (when no image is selected)

| Shortcut | Action |
|---|---|
| Scroll wheel | Zoom in / out |
| `+` / `-` | Zoom in / out by 10% |
| `Ctrl+0` / `Cmd+0` | Reset zoom to 100% |
| Click zoom % in sidebar | Reset zoom to 100% |
| Drag the zoom slider | Fast visual adjustment |

### Image editing (when an image slot is selected)

| Shortcut | Action |
|---|---|
| Scroll wheel over the slot | Zoom the image inside the slot |
| `+` / `-` | Zoom the image by 3 mm |
| Arrow keys | Nudge the image by 1 mm (`Shift` for 10 mm) |
| `Ctrl+C` / `Ctrl+V` | Copy / paste image crops between slots |
| `Delete` | Remove the image from the selected slot |

### Selection

| Shortcut | Action |
|---|---|
| Click a pocket | Select it |
| Drag across pockets | Select a rectangular area for multi-pocket slots |
| `Shift`+click a pocket | Extend selection to a rectangular area |
| Click empty canvas background | Clear all selections and pan freely |
| `E` | Mark selected pocket (or range) as intentionally empty. Press again to unmark. |

## Understanding seams

Binders come in different styles, and the seams between pockets behave differently.

**Cut seams** are where the binder material sits between two pockets. The image is lost in this area (typically 2–5 mm). Michify shows this as a gray strip in the preview so you know what disappears.

**Continuous seams** exist in side-loading binders where two pockets face each other with their openings pointing toward the same seam. In these binders, an image can slide behind the seam material into both pockets, creating a seamless visual across the gap.

> **Not sure what your binder has?** Look at a pair of adjacent pockets and check which direction each one opens. If they open toward each other (openings pointing at the seam), it's likely a continuous seam. If they both open the same direction, it's a cut seam.

## Understanding corner styles

Michify offers three corner styles to match your aesthetic preference and available tools.

- **No rounding (default)** — straight corners on all images. Choose this if you're using scissors or don't have specific tools for corner cutting. Also good if you prefer the crisp look of sharp corners.
- **Round outer edges** — the outer corners of each image piece are rounded. Multi-pocket spanning artwork (with continuous seams) is treated as one unified piece with only the outermost corners rounded. This creates a look where the whole spread appears as one large card.
- **Round every card** — each individual pocket gets its own set of rounded corners. Multi-pocket spanning artwork shows rounded corners at every pocket boundary, making the layout look like separate cards placed next to each other.

The default corner radius is `3.18 mm`, which matches the official TCG card corner radius exactly (1/8 inch = 3.175 mm). This makes printed inserts visually indistinguishable from real cards when placed side by side. Adjust the radius if your specific card game uses different dimensions or if you prefer a different aesthetic.

The rounded corner effect works two ways during printing:

- **On white paper** — the rounded corners blend perfectly with the paper, giving the visual appearance of pre-cut rounded cards
- **On any paper color** — the rounded areas serve as cutting guides. Cut straight along the edges and the "corners" define where your card's rounded shape ends. No corner cutter tool needed either way.

## Measuring your binder

The pocket dimensions in Michify refer to the practical inside area where a card sits snugly (card size + small tolerance). For a standard TCG binder holding 63×88 mm cards, this is typically around **68×93 mm**.

For seams, measure the visible gap between two adjacent pocket openings when cards are inserted. Most modern binders have 2–4 mm seams.

## Printing tips

Michify handles the complex parts of printing automatically.

- **Bin packing** — multiple images are arranged efficiently on each A4 or A3 sheet, rotating pieces when needed to save paper
- **Cutting margins** — the gap between printed pieces matches your binder's seam width, so you can cut straight lines with a paper cutter
- **Corner rounding** — enable rounded corners in the sidebar to add professional-looking rounded corners automatically. Works as both visual style and cutting guide.
- **Physical accuracy** — all measurements are in real millimeters. Print at 100% scale (not "fit to page") for pixel-perfect results.

The print dialog estimates each image's effective DPI and warns you if any would look soft or pixelated. If you see a low-DPI warning, the fix is a higher-resolution source image, not a Michify setting.

For best results, use matte cardstock (around 300 gsm) rather than regular printer paper. It feels closer to real cards in the binder pocket.

## Development

Michify is a single-page web app built with vanilla HTML, CSS, and JavaScript. No frameworks, no build step, no dependencies.

```
tcg-binder-designer/
├── index.html      HTML structure
├── style.css       Styling and layout
├── app.js          Application logic
├── README.md       This file
└── LICENSE         MIT license
```

To run locally, just open `index.html` in a browser. For development with hot reload, use VSCode's Live Server extension or any local static server.

## Contributing

Contributions are welcome. If you find a bug or want to suggest a feature, please [open an issue](https://github.com/granothon/tcg-binder-designer/issues).

## About the Michi Method

The Michi Method is a binder art technique popularized by [@peeplop](https://www.instagram.com/peeplop/) on Instagram. Instead of filling every pocket uniformly, it uses layouts that mix single cards, multi-slot visual panels, and intentional negative space, treating the whole page as a canvas.

Michify is an independent tool that supports designing for this method with precise measurements. It is not officially affiliated with any Michi Method creators or communities. It's built to make the design process easier and more accurate.

**Community resources:**

- [@peeplop on Instagram](https://www.instagram.com/peeplop/) — original creator
- Michi Method community Discord (link via @peeplop's Instagram bio)
- [Full Michi Method guide by woahpoke](https://www.woahpoke.com/michi-method) — excellent introduction to the technique

## Support the project

Michify is free and open source, and always will be. If it saved you time or helped you build something cool, consider [buying me a coffee](https://ko-fi.com/granothon) ☕. Every contribution helps keep this tool maintained and improved.

## License

[MIT](LICENSE) © 2026 Risto Ruuskanen

## Author

Created and maintained by Risto Ruuskanen.

- GitHub: [@granothon](https://github.com/granothon)
- Ko-fi: [ko-fi.com/granothon](https://ko-fi.com/granothon)