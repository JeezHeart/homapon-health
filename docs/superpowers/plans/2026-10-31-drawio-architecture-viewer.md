# Draw.io architecture viewer implementation plan

> **For agentic workers:** Use executing-plans for inline implementation and one final independent review.

**Goal:** Rebuild the offline architecture viewer with editable diagrams in Courier New, aligned to the manuscript and inspected system code.

**Architecture:** One set of diagram definitions produces native draw.io XML first, then offline SVG previews and the HTML report. A small renderer supports only the shapes used by this report; it is not a general draw.io converter. Retain both editable sources and previews.

**Tech Stack:** Node.js standard library, mxGraph XML, SVG, HTML/CSS, browser Canvas for PNG downloads.

**Spec:** User request of 2026-10-31; `prd.md`; `docs/system-architecture.md`; manuscript working copy under `docs/research/model-evaluation-2026-10-30/paper-alignment/`.

## Constraints

- Preserve the exact approved title, existing application behavior, and unrelated working-tree changes.
- Courier New on every diagram label, including edges and annotations.
- Eight diagrams corresponding to paper Figures 7–14, plus requirements.
- Distinguish current code, proposed hosting, reconstructed manual process, and offline research.
- No real child data, deployment, live SMS, database changes, or paper edits.
- No new dependency; no claim of native draw.io rendering without Desktop.

## Review focus

- Missing native files or broken links: verify all exports and source paths.
- Clipped labels and crossing connectors: inspect browser screenshots and diagram geometry.
- Unsupported AI, SMS delivery, or holiday automation: compare against owning sources.
- Offline operation and PNG failure: test success and failure paths.
- Paper alignment: preserve figure meanings and clearly identify the revised working copy.

## Tasks

- [x] Update viewer tests; observed expected failure (`8 !== 9`) before implementation.
- [x] Replace stale builder, create eight diagram definitions, native XML, SVG previews, and offline report.
- [x] Update architecture documentation with figure mapping, code evidence, and limitations.
- [x] Run structural/export checks, browser QA, lint/type-check/build, and direct source/visual review. Independent review attempted but unavailable (see log).

## Decision log

- Draw.io Desktop is unavailable. Use the official skill's native XML fallback; label SVGs as generated previews rather than Desktop exports.
- Preserve the existing offline SVG/PNG workflow and add embedded native XML downloads so copied HTML remains self-contained.
- Add the sequence diagram because it is present as Figure 12 in the manuscript.
- Keep the original manuscript and its existing embedded figures unchanged; this task supplies replacement diagrams for review.
- No commit: the working tree contains substantial unrelated work.
- Browser QA exposed overlapping connector labels and a manual deferral arrow crossing a box. Shortened labels and moved the deferral box; subsequent checks passed.
- Final comparison against manuscript paragraphs 143–187 preserved actor specialization in Figure 10 and the separate research scope throughout.
- Independent reviewer could not run because its account usage limit was reached. Completed direct code/manuscript, native XML, and visual checks instead; no independent-review approval is claimed.

## Verification record

### Later user-requested simplification (31 October 2026)

- User requested plain language for the capstone author and panel, Courier New, and black and white only. Saved that explicit preference in persistent memory.
- Rewrote all eight figure titles, labels, explanations, the viewer introduction, and the supporting guide. Retained the approved title, figure numbers, core relationships, and truthful limits on SMS, research, manual-workflow confirmation and proposed hosting.
- Increased diagram node text from 16 to 18 pixels. Removed colored backgrounds, borders and text from native files, previews and the viewer.
- Added regression checks for black/white colors and selected technical terms in visible diagram labels. Browser checks passed all 24 actual downloads, font checks, mobile containment and label-fit checks. Print output remains ten pages.
- Ran `node docs/test-architecture-viewer.cjs`, the existing browser test command below, `npm.cmd run lint`, `npx.cmd tsc -b --noEmit`, `npm.cmd run build`, and scoped `git diff --check`: passed.
- The master Word paper was not edited; the updated diagrams are available in the viewer and editable downloads for later insertion.

- `node scripts/build-viewer.js`: eight native XML files, eight SVG previews, one offline HTML report.
- `node docs/test-architecture-viewer.cjs`: passed nine sections, native/SVG parity checks, fonts, all 24 export handlers, PNG failure recovery and URL cleanup.
- `node docs/test-architecture-browser.cjs 'C:\Users\geheart\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright' 'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'`: passed in temporary headless Brave; 24 actual downloads, no network requests or page errors, all rendered text Courier New, no detected text clipping or node/edge-label overlap, mobile page contained its scrolling.
- Browser QA artifacts: `C:\Users\geheart\AppData\Local\Temp\homapon-diagram-qa-nsEm0t` (temporary; not project deliverables).
- XML parser checks: unique IDs, valid parent/source/target references, SVG-embedded XML exactly matches native source, all diagram fonts Courier New, all local evidence links resolve.
- Print QA: 10 pages (cover, eight figures, requirements); individual diagrams visually inspected, including the dense class diagram's print layout.
- Frontend checks: `npm.cmd run lint`, `npx.cmd tsc -b --noEmit`, `npm.cmd run build` passed. No application source was changed by this task.
- `git diff --check`: passed; Git emitted line-ending conversion notices.
- Limit: draw.io Desktop was unavailable. Native XML was parser-validated and downloaded successfully; editable files were not visually opened in the native draw.io editor. SVG/PNG previews were rendered and inspected in the browser.
