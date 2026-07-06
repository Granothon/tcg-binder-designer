# Michify

An open-source binder art designer for TCG (Trading Card Game) collections. Design custom inserts, plan Michi Method spreads, and export print-ready layouts with millimeter precision.

**Live app:** [granothon.github.io/tcg-binder-designer](https://granothon.github.io/tcg-binder-designer/)

## What is this?

Michify makes it easy to design and print binder art without manual measuring or complicated software. Whether you're building a Pokémon 151 spread, creating custom Magic binder pages, or planning Yu-Gi-Oh! collection layouts, Michify handles the math so you can focus on the design.

Unlike collection management apps that focus on tracking cards, Michify is a **precision printing tool**: it produces printable images that fit your binder pockets exactly.

## Features

- **Custom binder dimensions**: Set exact pocket width, height, and seam sizes for your specific binder
- **Multi-pocket image slots**: Design artwork spanning multiple pockets in any rectangular configuration
- **Michi Method support**: Handle cut and continuous seams (side-loading binders where pockets face each other)
- **Absolute mm-based sizing**: Same zoom shows the same image size across different slot dimensions
- **Smart image handling**: Auto-fit cover mode, drag to pan, wheel to zoom, arrow keys for pixel-precision
- **Clone and duplicate**: Copy image crops between slots, extend images seamlessly to neighboring slots
- **Multi-page projects**: Design a whole binder in one session, save as JSON for later editing
- **Size Guide reference**: See all possible slot dimensions calculated from your binder measurements
- **Locked panning**: Images can't create empty white space, only zoom and crop within the slot
- **Smart bin-packing printing**: Automatically arranges pieces on A4/A3 sheets with proper cutting margins
- **Automatic corner rounding**: Prints with rounded corners (no corner cutter needed) for professional-looking inserts
- **A4 and A3 printing**: Portrait or landscape orientation with automatic fit checking

## How to use

1. Open the [live app](https://granothon.github.io/tcg-binder-designer/) in your browser
2. Measure your binder's actual pocket dimensions with a ruler
3. Enter the measurements in the sidebar (pocket width, height, seam sizes)
4. Set the layout (rows × columns)
5. Configure seams by clicking them (red = cut, teal = continuous)
6. Click or drag over pockets to select an area
7. Drop an image onto the selected area
8. Adjust the crop with your mouse (drag to pan, wheel to zoom) or arrow keys
9. Optionally check the Size Guide to see all possible slot dimensions
10. Click "Print / PDF" to export at the exact size for your binder

## Understanding seams

Binders come in different styles, and the seams between pockets behave differently:

**Cut seams** are where the binder material sits between two pockets. The image is lost in this area (typically 2-5mm). Michify shows this as a gray strip in the preview so you know what disappears.

**Continuous seams** exist in side-loading binders where two pockets face each other with their openings pointing toward the same seam. In these binders, an image can slide behind the seam material into both pockets, creating a seamless visual across the gap.

Not sure what your binder has? Look at a pair of adjacent pockets and check which direction each one opens. If they open toward each other (openings pointing at the seam), it's likely a continuous seam. If they both open the same direction, it's a cut seam.

## Tips for measuring your binder

The pocket dimensions in Michify refer to the **practical inside area** where a card sits snugly (card size + small tolerance). For a standard TCG binder holding 63×88mm cards, this is typically around 68×93mm.

For seams, measure the visible gap between two adjacent pocket openings when cards are inserted. Most modern binders have 2-4mm seams.

## Printing tips

Michify handles the complex parts of printing automatically:

- **Bin packing**: Multiple images are arranged efficiently on each A4 or A3 sheet, rotating pieces when needed to save paper
- **Cutting margins**: The gap between printed pieces matches your binder's seam width, so you can cut straight lines with a paper cutter
- **Rounded corners**: Enable "Round corners for cutting" in the print dialog to add professional-looking rounded corners automatically. No corner cutter tool needed.
- **Physical accuracy**: All measurements are in real millimeters. Print at 100% scale (not "fit to page") for pixel-perfect results.

For best results, use matte cardstock (around 300gsm) rather than regular printer paper. It feels closer to real cards in the binder pocket.

## Development

Michify is a single-page web app built with vanilla HTML, CSS, and JavaScript. No frameworks, no build step, no dependencies.

Project structure:

```
tcg-binder-designer/
├── index.html    HTML structure
├── style.css     Styling and layout
├── app.js        Application logic
├── README.md     This file
└── LICENSE       MIT license
```

To run locally, just open `index.html` in a browser. For development with hot reload, use VSCode's Live Server extension or any local static server.

Contributions are welcome. If you find a bug or want to suggest a feature, open an [issue on GitHub](https://github.com/granothon/tcg-binder-designer/issues).

## Support the project

Michify is free and open source, and always will be. If it saved you time or helped you build something cool, consider buying me a coffee.

[☕ Buy me a coffee](https://ko-fi.com/granothon)

Every contribution helps keep this tool maintained and improved.

## About the Michi Method

The Michi Method is a binder art technique popularized by [@peeplop](https://instagram.com/peeplop) on Instagram. Instead of filling every pocket uniformly, it uses layouts that mix single cards, multi-slot visual panels, and intentional negative space, treating the whole page as a canvas.

Michify is an independent tool that supports designing for this method with precise measurements, but is not officially affiliated with any Michi Method creators or communities. It's built to make the design process easier and more accurate.

Community resources:
- [@peeplop on Instagram](https://instagram.com/peeplop) - original creator
- Michi Method community Discord (link available via @peeplop's Instagram bio)
- [Full Michi Method guide by woahpoke](https://woahpoke.com/) - excellent introduction to the technique

## License

MIT License. See [LICENSE](LICENSE) file for details.

Copyright © 2026 Risto Ruuskanen

## Author

Created and maintained by Risto Ruuskanen.

- GitHub: [@granothon](https://github.com/granothon)
- Ko-fi: [ko-fi.com/granothon](https://ko-fi.com/granothon)