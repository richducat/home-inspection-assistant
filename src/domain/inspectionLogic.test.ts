import { describe, expect, it } from "vitest";
import { getStatePack } from "./statePacks";
import { seedInspection } from "./seed";
import { buildPhotoAnalysis, createFieldSuggestionsFromAnalysis, createSuggestionFromAnalysis } from "./imageAnalysis";
import { applyResearchSuggestions, buildPropertyResearchLinks } from "./propertyResearch";
import { applyFieldSuggestion, applyPermitCandidate, parseCalendarInspectionText } from "./workflow";
import {
  approveSuggestionAsFinding,
  calculateReportReadiness,
  markSystemComplete,
  updateSuggestionState
} from "./inspectionLogic";

describe("inspection readiness", () => {
  it("blocks export when AI suggestions still need inspector review", () => {
    const statePack = getStatePack(seedInspection.statePackId);
    const readiness = calculateReportReadiness(seedInspection, statePack);

    expect(readiness.ready).toBe(false);
    expect(readiness.unreviewedSuggestions).toBe(2);
    expect(readiness.missingRequiredSystems.length).toBeGreaterThan(0);
  });

  it("approves an AI suggestion as a finding without duplicating it", () => {
    const once = approveSuggestionAsFinding(seedInspection, "ai-roof-001", "monitor");
    const twice = approveSuggestionAsFinding(once, "ai-roof-001", "monitor");

    expect(once.aiSuggestions.find((suggestion) => suggestion.id === "ai-roof-001")?.reviewState).toBe(
      "approved"
    );
    expect(twice.findings.filter((finding) => finding.id === "finding-ai-roof-001")).toHaveLength(1);
  });

  it("unlocks export when required systems are complete and suggestions reviewed", () => {
    const statePack = getStatePack(seedInspection.statePackId);
    const completedSystems = statePack.systems
      .filter((system) => system.required)
      .reduce((inspection, system) => markSystemComplete(inspection, statePack, system.id), seedInspection);
    const reviewed = completedSystems.aiSuggestions.reduce(
      (inspection, suggestion) =>
        suggestion.reviewState === "needs_review"
          ? updateSuggestionState(inspection, suggestion.id, "approved")
          : inspection,
      completedSystems
    );
    const readiness = calculateReportReadiness(reviewed, statePack);

    expect(readiness.ready).toBe(true);
    expect(readiness.missingRequiredSystems).toHaveLength(0);
    expect(readiness.unreviewedSuggestions).toBe(0);
  });

  it("turns a photo scan into a safety suggestion with visual evidence", () => {
    const statePack = getStatePack(seedInspection.statePackId);
    const photo = seedInspection.photos.find((candidate) => candidate.systemId === "electrical");
    const system = statePack.systems.find((candidate) => candidate.id === "electrical");

    if (!photo || !system) {
      throw new Error("Electrical seed data missing");
    }

    const analysis = buildPhotoAnalysis(
      photo,
      system,
      {
        width: 900,
        height: 601,
        brightness: 0.41,
        contrast: 0.52,
        edgeDensity: 0.24,
        darkRatio: 0.33,
        warmRatio: 0.18,
        redRatio: 0.08
      },
      "2026-06-25T18:00:00-04:00"
    );
    const suggestion = createSuggestionFromAnalysis(analysis, photo);

    expect(analysis.detectedIssue).toContain("electrical");
    expect(analysis.severity).toBe("safety");
    expect(analysis.visualSignals).toContain("900x601 source image");
    expect(suggestion.severity).toBe("safety");
    expect(suggestion.recommendation).toContain("licensed electrical contractor");
    expect(suggestion.sourcePhotoLabel).toBe(photo.label);
  });

  it("applies public-record suggestions to property fields", () => {
    const packet = {
      status: "complete" as const,
      searchedAt: "2026-06-26T15:00:00-04:00",
      query: "742 Palmetto Ridge Dr, Viera, FL 32940",
      sources: buildPropertyResearchLinks(seedInspection.property),
      suggestions: [
        {
          fieldPath: "property.ownerName" as const,
          label: "Owner",
          value: "PUBLIC RECORD OWNER",
          sourceId: "brevard-gis-parcels",
          confidence: "high" as const,
          applyable: true
        },
        {
          fieldPath: "property.floodZone" as const,
          label: "FEMA flood zone",
          value: "X",
          sourceId: "fema-nfhl",
          confidence: "high" as const,
          applyable: true
        }
      ],
      permitCandidates: [
        {
          id: "permit-roof-test",
          type: "roof" as const,
          title: "Roof permit",
          permitNumber: "R-123",
          issuedDate: "2019-01-01",
          finalDate: "2019-02-01",
          contractor: "Test contractor",
          sourceId: "brevard-permits",
          sourceUrl: "https://example.com",
          confidence: "high" as const,
          status: "candidate" as const,
          notes: "Matched by parcel."
        }
      ],
      notes: []
    };

    const updated = applyResearchSuggestions(seedInspection, packet);

    expect(updated.property.ownerName).toBe("PUBLIC RECORD OWNER");
    expect(updated.property.floodZone).toBe("X");
    expect(updated.researchPacket?.status).toBe("complete");
    expect(updated.permitCandidates).toHaveLength(seedInspection.permitCandidates.length + 1);
  });

  it("keeps image-derived field values gated until approved", () => {
    const statePack = getStatePack(seedInspection.statePackId);
    const photo = seedInspection.photos.find((candidate) => candidate.systemId === "electrical");
    const system = statePack.systems.find((candidate) => candidate.id === "electrical");

    if (!photo || !system) {
      throw new Error("Electrical seed data missing");
    }

    const analysis = buildPhotoAnalysis(
      photo,
      system,
      {
        width: 900,
        height: 601,
        brightness: 0.41,
        contrast: 0.52,
        edgeDensity: 0.24,
        darkRatio: 0.33,
        warmRatio: 0.18,
        redRatio: 0.08
      },
      "2026-06-25T18:00:00-04:00"
    );
    const [fieldSuggestion] = createFieldSuggestionsFromAnalysis(analysis, photo);
    const withSuggestion = {
      ...seedInspection,
      fieldSuggestions: [fieldSuggestion],
      officialFields: { ...seedInspection.officialFields, [fieldSuggestion.fieldId]: "Old value" }
    };
    const readiness = calculateReportReadiness(withSuggestion, statePack);

    expect(readiness.unreviewedFieldSuggestions).toBe(1);
    expect(applyFieldSuggestion(withSuggestion, fieldSuggestion.id).officialFields[fieldSuggestion.fieldId]).toBe(
      fieldSuggestion.value
    );
  });

  it("imports selected permit data into official form fields", () => {
    const updated = applyPermitCandidate(seedInspection, "permit-roof-demo");

    expect(updated.permitCandidates.find((permit) => permit.id === "permit-roof-demo")?.status).toBe("selected");
    expect(updated.officialFields.roofPermitDate).toBe("2017-06-02");
  });

  it("parses pasted Google Calendar event text into intake and property fields", () => {
    const updated = parseCalendarInspectionText(
      [
        "Insurance Combo Inspection",
        "Client: Beth York",
        "Insured: Jane Owner",
        "Phone: 321-555-0199",
        "Email: jane@example.com",
        "Inspection type: 4-point + wind",
        "Price: $149",
        "Payment: paid",
        "Address: 123 Main St",
        "City State Zip: Melbourne FL 32940"
      ].join("\n"),
      seedInspection
    );

    expect(updated.request.source).toBe("google_calendar");
    expect(updated.request.clientName).toBe("Beth York");
    expect(updated.request.paymentStatus).toBe("paid");
    expect(updated.property.address).toBe("123 Main St");
    expect(updated.property.city).toBe("Melbourne");
  });
});
