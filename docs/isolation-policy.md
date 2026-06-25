# Isolation Policy

This project must remain operationally isolated from CadetCatch.

## Separate Project Assets

- GitHub repository: `richducat/home-inspection-assistant`
- Local path: `/Users/richardducat/GITHUB/home-inspection-assistant`
- Repository visibility: public, so GitHub Pages can serve the standalone app. Do not commit secrets, customer data, inspection records, or CadetCatch material.
- App bundle ID: choose a new identifier, for example `co.eb28.homeinspectionassistant`
- Backend API: new service and hostname
- Object storage: new private bucket/container
- App Store / TestFlight record: new app record if distributed as an iOS app
- Environment files: new `.env.*` files, never copied from CadetCatch

## CadetCatch Boundaries

CadetCatch may be used only as a reference for:

- iOS photo capture UX patterns
- upload/retry patterns
- remote image loading lessons
- release discipline and TestFlight gate separation

CadetCatch must not be reused for:

- face-search endpoints
- cadet photo storage
- app-specific product IDs
- release ledgers
- App Store metadata
- customer data or test data

## Implementation Rule

Any future code import from CadetCatch requires a dedicated migration commit with:

- source path and commit hash
- copied files listed explicitly
- changes made during adaptation
- confirmation that no secrets, endpoints, or release artifacts were copied
