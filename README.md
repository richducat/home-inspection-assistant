# Home Inspection Assistant

Standalone project for a multi-state, photo-assisted home inspection reporting app.

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

