# Experimental Record Review

Implemented locally on 4 November 2026. Open **Record Review** in the staff navigation, choose a child, and inspect the nine displayed vaccination dates. Run the review if the entries are complete, valid, and ordered. Missing or problematic entries block model scoring rather than being filled in.

Two clearly fictional practice examples are provided. The spaced-date example produces “No unusual pattern flagged”; the same-day example produces “Review suggested” with this model. These examples test the interface and scoring. They were not added to training data, do not measure accuracy, and do not represent recommended vaccination schedules. Switching child or example clears the previous result.

## Meaning of the outputs

- **Review suggested:** the six recorded gaps look unusual to the experimental model; a person should inspect the original entries before drawing a conclusion.
- **No unusual pattern flagged:** the model did not flag these intervals. This does not establish that the entries are correct or that a child is healthy.
- **Not enough information for ML review:** one or more required dates are missing, duplicated, invalid, in the future, or out of order. Check the entries first.

No records are edited and no messages are sent. The review itself runs in the browser; it needs no new database table, backend endpoint or Python hosting service. The selected child and dates come from the existing staff-accessible record store. This task did not access a live database or deploy the application. Normal database sign-in and persistence still need their separately scoped environment verification.

## Model and limitations

Method: Isolation Forest, 200 trees, random seed 42, library default decision threshold. It was fitted once for this screen using the existing workbook's 41 complete, ordered rows and the same six dose-interval inputs used in the feasibility experiment. The saved artifact contains tree parameters, source hash, model settings, and fictional parity examples; it does not contain copied workbook rows, names or patient identifiers. This is a different method and purpose from the older logistic-regression documentation-classification experiment.

No benefit over straightforward checks has been established. The earlier unseen-worksheet check found 9 ML flags, all also flagged by the simple statistical comparison. There are no independent correct/incorrect-record labels, clinical outcome labels, or confirmed staff usefulness ratings. The screen therefore makes no accuracy, health, attendance or clinical timing claim. Source-photo reconciliation remains incomplete. Zero-day intervals are accepted as numeric input, not approved as a medical schedule.

The browser scorer reproduces scikit-learn's Isolation Forest path-length calculation and float32 comparisons. Fictional parity examples match Python scores within 1e-10. The model screen is loaded separately so the forest does not increase the initial application bundle.

## Verification

- `node --test test/recordReview.test.mjs` from `frontend`: 2 passed. Covers Python/browser score parity, missing/duplicate/future/malformed/impossible/reversed dates, and no input mutation.
- `npm.cmd run lint`, `npx.cmd tsc -b --noEmit`, `npm.cmd run build` from `frontend`: checked for this feature.
- `node scripts/check-record-review.cjs <playwright-module-path> <browser-executable-path>` with the isolated demo server on port 5189: checks staff navigation, both fictional outputs, insufficient-data blocking, result clearing, mobile containment, and browser errors. External requests are blocked.

The old classifier contest, unrelated backend tests and the full clinic walkthrough were not rerun for this feature.

## Source files

- `frontend/src/pages/RecordReviewPage.tsx`: staff screen.
- `frontend/src/utils/recordReview.ts`: date checks and forest scoring.
- `frontend/src/data/recordReviewModel.json`: learned parameters.
- `docs/research/record-review-feasibility-2026-11-04/export_demo_model.py`: read-only workbook-to-model export, with source-hash and eligible-row-count checks.

Re-exporting requires the original workbook and the existing Python environment with openpyxl, NumPy and scikit-learn. Do not substitute a different workbook or silently refit a changed dataset; review the data and evaluation first.
