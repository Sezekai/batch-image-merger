# Changes

## v1.3.0

The redesign, following the shared app standards.

**Look**
- New default look: Violet haze background with a Violet → Blue accent, Inter 13 px, compact 28 px controls. Midnight and Blue from before are still presets, and your saved themes came across.
- Our own title bar with the app name and the current screen, and pills that show running jobs on every screen. Merge / Freeform / Overlay stay as tabs, now with a count of sets not exported yet.
- A one-line heading on each tab, normal-case headings in the settings panel, and one outline icon set (no more emoji padlocks or ⇋ ▲ ▼ ⧉).
- The full Look screen (the palette button): every colour, accent gradients, bundled and added fonts, text size, corners, density, flat or glow buttons, outline and highlight, saved themes and theme files that move between your apps. The background glow and heading font are kept under Extras.
- The keyboard shortcuts popup (K) in the shared style, flowing into columns.
- The full-size viewer and Exact preview show the picture with nothing over it; details, zoom and previous / next are in a side panel.
- Sets that share a parent folder are grouped under it and can be folded away.
- Smaller empty states, a focus ring on whatever has the keyboard, and messages at the bottom right.

**How it works**
- One status bar for every job (exporting, finding subjects, lining up, checking folders, Exact preview, moving folders): a bar, %, time elapsed and time left, a stall warning after 20 s, and a finished message that stays with a next step.
- Exporting is a queue: pressing Export while one runs adds the sets to it. Pause finishes the current set and waits; Stop stops it straight away and empties the queue. Details shows each set as Done, Exporting, Queued or Failed. An unfinished export can be carried on after a restart.
- Nothing is ever overwritten: "Replace it" is gone, and exporting a set again keeps the earlier file and saves the new one as "(2)".
- Settings (S): app options, Storage (each place, its size, Open, Move…, Clear) and Reset one part at a time.
- The program now lives in an App folder, and the cache moves from C: to the Cache folder beside it (done once, with progress).
- A log you can open with L, also saved in the logs folder with the last few runs and any crash logs.
- Opening the app again brings the running window forward.
- Every dialog answers Enter and Esc, and its buttons say what they do.
- Safe mode after two unclean exits in a row (drawing with the graphics card off, with a button to turn it back on).
- Keys: 1 / 2 / 3 still switch tabs; Z is actual size (100%); L opens the log, so Freeform's split tool and Overlay's erase area moved to X; S opens Settings, so Overlay's Show mask moved to G; / and Ctrl+F jump to the set filter; Home / End go to the first / last set; + and − zoom.
- Built and released on GitHub; each version is a numbered release.
