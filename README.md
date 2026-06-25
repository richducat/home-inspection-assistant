# Home Inspection Assistant

Standalone project for a multi-state, photo-assisted home inspection reporting app.

Live app target: https://richducat.github.io/home-inspection-assistant/

## Product Direction

This app is inspired by CadetCatch's proven mobile photo workflow, but it is not a CadetCatch branch, release train, or backend extension.

The first production shape is an assistive drafting workflow:

- Inspectors capture and label property photos.
- AI suggests report findings, form fields, and supporting language.
- A licensed inspector reviews, edits, and approves every AI-suggested field before export.
- Final reports include photo evidence, inspector identity, signatures, and an audit trail.

## Isolation Rules

- Use a separate GitHub repository, bundle ID, app record, backend, storage buckets, environment files, and deployment pipeline.
- Do not commit CadetCatch secrets, release ledgers, App Store records, build artifacts, or production endpoints here.
- Do not mutate CadetCatch while building this project.
- If CadetCatch code is reused, import it intentionally through a one-time reviewed copy or shared package with license/provenance notes.

## MVP Target

- Multi-state architecture.
- Florida state pack first because the current business research is centered on Brevard County / Viera home-inspection workflows.
- AI remains assistive only; inspector signoff is mandatory.

## Initial Modules

- Mobile photo capture and inspection workflow.
- Private photo upload and evidence storage.
- State-pack driven report/form schema.
- AI draft service for findings and field suggestions.
- PDF/report export.
- Inspector review, signature, and audit trail.

## Implemented MVP

- React/Vite app shell with a dense inspector workstation UI.
- Versioned state-pack model with a Florida starter pack and multi-state template.
- Inspection, photo evidence, finding, AI suggestion, and report readiness models.
- Interactive checklist, photo evidence viewer, local photo add flow, AI approve/edit/reject flow, and printable report preview.
- Export guardrails that keep final export blocked while required systems or AI suggestions still need review.
- Unit tests for report readiness and AI approval behavior.
- GitHub Pages deployment workflow isolated from CadetCatch.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:4173/home-inspection-assistant/` when running with:

```bash
npm run dev -- --port 4173
```

## Verification

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
```
