# Batch Image Merger: product

**Who it's for:** one owner, on their own Windows laptop, working through large folders of anime art and images.

**Purpose:** turn each folder of pictures into one picture, quickly and in bulk:
- **Merge:** join the pictures in a column, a row or a grid.
- **Freeform:** cut the subjects out and arrange them freely on one canvas.
- **Overlay:** line detailed close-ups up over a wide shot of the same scene.

**Constraints**
- Originals are never edited, moved, renamed or deleted. Exports are new files; nothing is ever overwritten.
- Large things (the cache) live on E: beside the program; small things (sets, settings, look, logs) live in `%LOCALAPPDATA%\Batch Image Merger`.
- Works when E: isn't connected (a temporary cache is used and the app says so).
- The window never freezes: all image work runs in worker threads, and every job shows progress you can trust.

**Never in it:** WebP output, a waifu2x button, a menu bar, Windows pop-up dialogs, live folder watching.

**Different from the shared standards** (and why): see the "In Batch Image Merger" sections at the end of DESIGN.md and STANDARDS.md. In short: tabs instead of a rail, 1/2/3 for the tabs with Z for 100%, Look extras (glow and heading font), the settings panel on the right, re-exports keep both files, a zipped folder package.
