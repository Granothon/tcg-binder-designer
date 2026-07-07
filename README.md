# Michify

An open-source binder art designer for TCG (Trading Card Game) collections. Design custom inserts, plan Michi Method spreads, and export print-ready layouts with millimeter precision.

**Live app:** [granothon.github.io/tcg-binder-designer](https://granothon.github.io/tcg-binder-designer)

## What is this?

Michify makes it easy to design and print binder art without manual measuring or complicated software. Whether you're building a Pokémon 151 spread, creating custom Magic binder pages, or planning Yu-Gi-Oh! collection layouts, Michify handles the math so you can focus on the design.

Unlike collection management apps that focus on tracking cards, Michify is a precision printing tool: it produces printable images that fit your binder pockets exactly.

## Features
- **Custom binder dimensions:** Set exact pocket width, height, and seam sizes for your specific binder
- **Multi-pocket image slots:** Design artwork spanning multiple pockets in any rectangular configuration
- **Michi Method support:** Handle cut and continuous seams (side-loading binders where pockets face each other)
- **Absolute mm-based sizing:** Same zoom shows the same image size across different slot dimensions
- **Smart image handling:** Auto-fit cover mode, drag to pan, wheel to zoom, arrow keys for pixel-precision
- **Automatic image downscaling:** Large uploads are resized to save memory without visible quality loss. Configurable from 2000 px to original resolution.
- **Office-style zoom slider:** Fast visual zoom control with slider, +/− buttons, and percentage display. Ctrl+0 resets to 100%.
- **Smooth canvas navigation:** Scroll wheel over empty area zooms the whole view. Click background to clear selection and pan freely.
- **Clone and duplicate:** Copy image crops between slots, extend images seamlessly to neighboring slots
- **Multi-page projects:** Design a whole binder in one session, save as JSON for later editing
- **Rounded corners:** Optional preview and print output with rounded corners in two styles (outer edges only or every card). Default radius matches the official TCG card standard. Works as visual cutting guides even on non-white paper.
- **Locked panning:** Images can't create empty white space, only zoom and crop within the slot
- **Smart bin-packing printing:** Automatically arranges pieces on A4/A3 sheets with proper cutting margins
- **A4 and A3 printing:** Portrait or landscape orientation with automatic fit checking

## How to use
1. Open the [live app](https://granothon.github.io/tcg-binder-designer) in your browser
2. Measure your binder's actual pocket dimensions with a ruler
3. Enter the measurements in the sidebar (pocket width, height, seam sizes)
4. Set the layout (rows × columns)
5. Configure seams by clicking them (red = cut, teal = continuous)
6. Choose a corner style (no rounding by default, or rounded corners with adjustable radius)
7. (Optional) Adjust image quality in the sidebar. Default is "Balanced (3000 px)" which is enough for 300 DPI printing.
8. Click or drag over pockets to select an area
9. Drop an image onto the selected area
10. Adjust the crop with your mouse (drag to pan, wheel to zoom) or arrow keys
11. Click "Print / PDF" to export at the exact size for your binder

## Keyboard shortcuts and navigation

Michify supports common shortcuts familiar from other design and office tools:

**View zoom (when no image is selected):**
- Scroll wheel over the canvas: zoom in/out
- `+` / `-` keys: zoom in/out by 10%
- **Ctrl+0** (Cmd+0 on Mac): reset zoom to 100%
- Click the zoom percentage in the sidebar for the same reset
- Drag the zoom slider directly for fast visual adjustments

**Image editing (when an image slot is selected):**
- Scroll wheel over the selected slot: zoom the image inside the slot
- `+` / `-` keys: zoom the image by 3 mm
- Arrow keys: nudge the image by 1 mm (hold Shift for 10 mm)
- **Ctrl+C** / **Ctrl+V**: copy and paste image crops between slots
- **Delete**: remove the image from the selected slot

**Selection:**
- Click a pocket: select it
- Drag across pockets: select a rectangular area for multi-pocket slots
- Shift+click a pocket: extend selection to a rectangular area
- Click empty canvas background: clear all selections and pan freely

## Understanding seams

Binders come in different styles, and the seams between pockets behave differently:

**Cut seams** are where the binder material sits between two pockets. The image is lost in this area (typically 2-5mm). Michify shows this as a gray strip in the preview so you know what disappears.

**Continuous seams** exist in side-loading binders where two pockets face each other with their openings pointing toward the same seam. In these binders, an image can slide behind the seam material into both pockets, creating a seamless visual across the gap.

**Not sure what your binder has?** Look at a pair of adjacent pockets and check which direction each one opens. If they open toward each other (openings pointing at the seam), it's likely a continuous seam. If they both open the same direction, it's a cut seam.

## Understanding corner styles

Michify offers three corner styles to match your aesthetic preference and available tools:
- **No rounding (default):** Straight corners on all images. Choose this if you're using scissors or don't have specific tools for corner cutting. Also good if you prefer the crisp look of sharp corners.
- **Round outer edges:** The outer corners of each image piece are rounded. Multi-pocket spanning artwork (with continuous seams) is treated as one unified piece with only the outermost corners rounded. This creates a look where the whole spread appears as one large card.
- **Round every card:** Each individual pocket gets its own set of rounded corners. Multi-pocket spanning artwork shows rounded corners at every pocket boundary, making the layout look like separate cards placed next to each other.

**About the corner radius:** The default value is 3.18 mm which matches the official TCG card corner radius exactly (1/8 inch = 3.175 mm). This makes printed inserts visually indistinguishable from real cards when placed side by side. Adjust the radius if your specific card game uses different dimensions or if you prefer a different aesthetic.

The rounded corner effect works two ways during printing:
- **On white paper:** The rounded corners blend perfectly with the paper, giving the visual appearance of pre-cut rounded cards
- **On any paper color:** The rounded areas serve as cutting guides. Cut straight along the edges and the "corners" define where your card's rounded shape ends. No corner cutter tool needed either way.

## Image quality and performance

Modern phone and camera photos are often much larger than needed for printing. A 12 MP phone photo has ~4000×3000 pixels, while a full 3×3 binder page spread only needs about 3000 pixels on its longest side for perfect 300 DPI print quality.

Michify automatically downscales images when you drop them onto the canvas. This keeps memory usage low and the app responsive, especially for multi-page projects.

**Available quality settings:**
- **Balanced (3000 px, default):** Enough for 300 DPI print quality on full 3×3 spreads. Recommended for almost all use cases.
- **Small (2000 px):** More aggressive downscale for very large projects or older devices. Enough for 300 DPI on 2×2 slots.
- **High (4000 px):** Extra margin for very large slot spans or 600 DPI professional printing.
- **Original (no downscale):** Keeps full resolution. Use for extremely detailed artwork or when memory is not a concern. Note that 20+ page projects with 4K photos may use over a gigabyte of RAM.

PNG images retain transparency. JPEG images are re-encoded at 92% quality, which is visually indistinguishable from the original.

## Tips for measuring your binder

The pocket dimensions in Michify refer to the practical inside area where a card sits snugly (card size + small tolerance). For a standard TCG binder holding 63×88mm cards, this is typically around 68×93mm.

For seams, measure the visible gap between two adjacent pocket openings when cards are inserted. Most modern binders have 2-4mm seams.

## Printing tips

Michify handles the complex parts of printing automatically:
- **Bin packing:** Multiple images are arranged efficiently on each A4 or A3 sheet, rotating pieces when needed to save paper
- **Cutting margins:** The gap between printed pieces matches your binder's seam width, so you can cut straight lines with a paper cutter
- **Corner rounding:** Enable rounded corners in the sidebar to add professional-looking rounded corners automatically. Works as both visual style and cutting guide.
- **Physical accuracy:** All measurements are in real millimeters. Print at 100% scale (not "fit to page") for pixel-perfect results.

For best results, use matte cardstock (around 300gsm) rather than regular printer paper. It feels closer to real cards in the binder pocket.

## Development

Michify is a single-page web app built with vanilla HTML, CSS, and JavaScript. No frameworks, no build step, no dependencies.

**Project structure:**

```
tcg-binder-designer/
├── index.html      HTML structure
├── style.css       Styling and layout
├── app.js          Application logic
├── README.md       This file
└── LICENSE         MIT license
```

To run locally, just open `index.html` in a browser. For development with hot reload, use VSCode's Live Server extension or any local static server.

Contributions are welcome. If you find a bug or want to suggest a feature, [open an issue on GitHub](https://github.com/granothon/tcg-binder-designer/issues).

## Support the project

Michify is free and open source, and always will be. If it saved you time or helped you build something cool, consider buying me a coffee. ☕

**[Buy me a coffee](https://ko-fi.com/granothon)**

Every contribution helps keep this tool maintained and improved.

## About the Michi Method

The Michi Method is a binder art technique popularized by [@peeplop](https://www.instagram.com/peeplop/) on Instagram. Instead of filling every pocket uniformly, it uses layouts that mix single cards, multi-slot visual panels, and intentional negative space, treating the whole page as a canvas.

Michify is an independent tool that supports designing for this method with precise measurements, but is not officially affiliated with any Michi Method creators or communities. It's built to make the design process easier and more accurate.

**Community resources:**
- [@peeplop on Instagram](https://www.instagram.com/peeplop/) - original creator
- Michi Method community Discord (link available via @peeplop's Instagram bio)
- [Full Michi Method guide by woahpoke](https://www.woahpoke.com/michi-method) - excellent introduction to the technique

## License

MIT License. See [LICENSE](LICENSE) file for details.

Copyright © 2026 Risto Ruuskanen

## Author

Created and maintained by Risto Ruuskanen.
- GitHub: [@granothon](https://github.com/granothon)
- Ko-fi: [ko-fi.com/granothon](https://ko-fi.com/granothon)