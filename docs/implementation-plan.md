# Implementation Plan

## Phase 1: Product Foundation

- Create standalone iOS app shell and backend API.
- Define inspection, photo, finding, report, inspector, and state-pack models.
- Implement private photo upload and retrieval with signed URLs.
- Build inspection creation, room/system navigation, photo capture, and finding editor screens.

## Phase 2: Compliance Packs

- Implement versioned state packs.
- Ship Florida as the first state pack.
- Support required sections, form fields, inspector/license fields, disclaimers, and report export rules.
- Keep packs data-driven so additional states do not require app rewrites.

## Phase 3: AI Assistive Drafting

- Add photo classification and finding draft generation.
- Require inspector review for every AI-generated field.
- Store source photo IDs, prompt/model metadata, confidence, inspector override state, and approval timestamp.

## Phase 4: Report Export

- Generate PDF reports with photos, findings, property data, inspector data, signatures, and audit trail.
- Preserve final report snapshots for reproducibility.
- Add incomplete-report blocking rules.

## Phase 5: Release Readiness

- Device QA for capture, upload, offline/retry behavior, AI draft review, and PDF output.
- Licensed-inspector review of report language and state-pack output.
- Separate App Store/TestFlight setup from CadetCatch.

