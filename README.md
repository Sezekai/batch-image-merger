# Batch Image Merger

Turns each folder of pictures into one picture, in bulk. Three tabs:

- **Merge** joins a folder's pictures in a column, a row or a grid (Fit, Crop or Row-based), with lines, borders, background colour matching, and drag-to-reorder.
- **Freeform** finds the subjects in each picture, cuts them out and lets you arrange them on one canvas: move, resize, rotate, flip, align, snap, split and fix cutouts with brushes and regions, crop and trim the canvas.
- **Overlay** finds the wide shot, lines the close-ups up over it automatically (or by points), matches their colours and lets you erase what shouldn't show.

Each folder is a **set**. Settings have **Defaults** plus each set's own values, with undo / redo, presets, and per-tab "not exported / exported" filters.

## Install and update

1. Download `Batch-Image-Merger-vX.Y.Z.zip` from the [latest release](../../releases/latest).
2. Unzip it into `E:\Pictures\Batch Image Merger`, so the program is at `E:\Pictures\Batch Image Merger\App\Batch Image Merger.exe`.
3. To update, close the app and replace the `App` folder with the new one. Nothing else is touched.

## Where things live

| Place | What |
| --- | --- |
| `E:\Pictures\Batch Image Merger\App\` | The program (replaced by each update) |
| `E:\Pictures\Batch Image Merger\Cache\` | Thumbnails, cutouts, previews (safe to clear) |
| `%LOCALAPPDATA%\Batch Image Merger\` | `project.json` (sets), `uiprefs.json`, `presets.json`, `settings.json`, `appearance.json` (look and themes), `fonts\`, `logs\`, `storage.json` |

Settings → Storage shows each place with its size and can open, move or clear it. If E: isn't connected, the app says so, uses a temporary cache and offers Retry or Choose a new place. Moving the data folder leaves a `location.json` pointer in `%LOCALAPPDATA%\Batch Image Merger`.

## Everything else

- **Exporting** is a queue with Pause, Resume, Stop and Details (Done / Exporting / Queued / Failed); an unfinished queue can be carried on after a restart. Names: folder, first file, or a pattern (`{folder} {first} {count} {date} {layout}`), or typed per set. Taken names get " (2)"; re-exporting keeps the earlier file.
- **Progress:** one status bar for every job with a bar, %, elapsed and time left, a stall warning after 20 s, and pills in the title strip.
- **Log:** L or the Log button; also in `logs\` (last 7 runs plus crash logs).
- **Look:** themes, every colour, accent gradients, fonts (bundled, on this computer, or added from files), text size, corners, density, button style, outline and highlight, extras; theme files (`*.theme.json`) shared with the owner's other apps.
- **Safe mode:** after two unclean exits in a row the app starts with drawing on the graphics card off, and offers to turn it back on.
- **One window:** opening the app again brings the running window forward.

## Keys

| Key | Does |
| --- | --- |
| 1 2 3 | Merge / Freeform / Overlay |
| PgUp PgDn, Home End | Previous / next, first / last set |
| / or Ctrl+F | Filter the sets |
| Ctrl+Z, Ctrl+Y | Undo / redo |
| Ctrl+E, Ctrl+Shift+E | Export this set, export all (or add to the queue) |
| + −, Ctrl + wheel | Zoom |
| 0, Z | Fit, actual size |
| S, L, K | Settings, log, shortcuts |
| M, H | Set list, hide panels |
| F, F11 | Full screen |
| Esc | Close, innermost first |

Freeform: Tab canvas / source, V X A E R tools, Q shape, O view, C crop, [ ] brush, Ctrl+D, Ctrl+] / [. Overlay: V E R X tools, D difference, G show mask. The full list is in the app (K).

## Building and testing (developer)

- `npm ci`, then `npm start` runs it from source (data in `%LOCALAPPDATA%`, root in `./dev-root`). `BIM_DATA` and `BIM_ROOT` replace the data folder and the root.
- `npm test` runs the unit tests (themes, output names). `node tests/make-samples.js samples` then `BIM_SAMPLES=samples node tests/engine.test.js` checks rendering.
- `node build.js` builds `dist/App` and `dist/Batch-Image-Merger-vX.Y.Z.zip`.
- `"Batch Image Merger.exe" --selftest` (with `BIM_SELFTEST_OUT`) opens the real window, saves a screenshot, result and log, and quits.
- GitHub Actions (`.github/workflows/release.yml`) does all of this on Windows for every push to `main` and publishes `v<package.json version>` as a release. Raise the version to publish a new one.
- `tests/ui.js` (Playwright) drives the real window for screenshots; `tests/ff.test.js`, `ov.test.js` and `align.test.js` need the local Freeform / Overlay sample folders.
