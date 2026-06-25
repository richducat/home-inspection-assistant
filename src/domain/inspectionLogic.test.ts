import { describe, expect, it } from "vitest";
import { getStatePack } from "./statePacks";
import { seedInspection } from "./seed";
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
});

