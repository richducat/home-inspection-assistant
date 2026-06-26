import { describe, expect, it } from "vitest";
import { getStatePack } from "./statePacks";
import { seedInspection } from "./seed";
import { buildPhotoAnalysis, createSuggestionFromAnalysis } from "./imageAnalysis";
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
});
