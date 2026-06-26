import type {
  AiSuggestion,
  Finding,
  InspectionReport,
  ReportReadiness,
  ReviewState,
  StatePack
} from "./types";

export function calculateReportReadiness(
  inspection: InspectionReport,
  statePack: StatePack
): ReportReadiness {
  const requiredSystems = statePack.systems.filter((system) => system.required);
  const missingRequiredSystems = requiredSystems
    .filter((system) => {
      const progress = inspection.systems.find((item) => item.systemId === system.id);
      return progress?.status !== "complete";
    })
    .map((system) => system.label);

  const missingRequiredFields = [
    ["Property address", inspection.property.address],
    ["Inspection state", inspection.property.state],
    ["Inspection date", inspection.inspectionDate],
    ["Report scope", inspection.scope],
    ["Inspector name", inspection.inspector.name],
    ["Inspector license", inspection.inspector.license]
  ]
    .filter(([, value]) => !String(value).trim())
    .map(([label]) => label);

  const unreviewedSuggestions = inspection.aiSuggestions.filter(
    (suggestion) => suggestion.reviewState === "needs_review"
  ).length;

  const rejectedSuggestions = inspection.aiSuggestions.filter(
    (suggestion) => suggestion.reviewState === "rejected"
  ).length;

  const approvedFindings = inspection.findings.filter((finding) =>
    ["approved", "edited"].includes(finding.reviewState)
  ).length;

  const safetyFindings = inspection.findings.filter((finding) => finding.severity === "safety").length;

  const completedRequired = requiredSystems.length - missingRequiredSystems.length;
  const systemsPercent = requiredSystems.length > 0 ? completedRequired / requiredSystems.length : 1;
  const reviewPercent =
    inspection.aiSuggestions.length > 0
      ? inspection.aiSuggestions.filter((suggestion) => suggestion.reviewState !== "needs_review").length /
        inspection.aiSuggestions.length
      : 1;

  const completionPercent = Math.round(((systemsPercent * 0.65 + reviewPercent * 0.35) || 0) * 100);

  return {
    ready:
      missingRequiredSystems.length === 0 &&
      missingRequiredFields.length === 0 &&
      unreviewedSuggestions === 0 &&
      approvedFindings > 0,
    completionPercent,
    missingRequiredSystems,
    missingRequiredFields,
    unreviewedSuggestions,
    rejectedSuggestions,
    safetyFindings,
    approvedFindings
  };
}

export function updateSuggestionState(
  inspection: InspectionReport,
  suggestionId: string,
  reviewState: ReviewState
): InspectionReport {
  return {
    ...inspection,
    aiSuggestions: inspection.aiSuggestions.map((suggestion) =>
      suggestion.id === suggestionId ? { ...suggestion, reviewState } : suggestion
    )
  };
}

export function convertSuggestionToFinding(
  suggestion: AiSuggestion,
  severity: Finding["severity"] = "monitor"
): Finding {
  return {
    id: `finding-${suggestion.id}`,
    systemId: suggestion.systemId,
    photoIds: suggestion.photoIds,
    title: suggestion.title,
    narrative: suggestion.draft,
    severity: suggestion.severity ?? severity,
    recommendation: suggestion.recommendation ?? "Inspector to confirm and edit final recommendation before export.",
    reviewState: "approved",
    source: "ai"
  };
}

export function approveSuggestionAsFinding(
  inspection: InspectionReport,
  suggestionId: string,
  severity: Finding["severity"] = "monitor"
): InspectionReport {
  const suggestion = inspection.aiSuggestions.find((candidate) => candidate.id === suggestionId);
  if (!suggestion) {
    return inspection;
  }

  const finding = convertSuggestionToFinding({ ...suggestion, reviewState: "approved" }, severity);
  const existingFindingIds = new Set(inspection.findings.map((candidate) => candidate.id));

  return {
    ...inspection,
    aiSuggestions: inspection.aiSuggestions.map((candidate) =>
      candidate.id === suggestionId ? { ...candidate, reviewState: "approved" } : candidate
    ),
    findings: existingFindingIds.has(finding.id) ? inspection.findings : [...inspection.findings, finding]
  };
}

export function markCheckpointComplete(
  inspection: InspectionReport,
  systemId: string,
  checkpoint: string
): InspectionReport {
  return {
    ...inspection,
    systems: inspection.systems.map((progress) => {
      if (progress.systemId !== systemId) {
        return progress;
      }

      const completedCheckpoints = Array.from(new Set([...progress.completedCheckpoints, checkpoint]));

      return {
        ...progress,
        completedCheckpoints,
        status: "in_progress"
      };
    })
  };
}

export function markSystemComplete(
  inspection: InspectionReport,
  statePack: StatePack,
  systemId: string
): InspectionReport {
  const system = statePack.systems.find((candidate) => candidate.id === systemId);
  if (!system) {
    return inspection;
  }

  return {
    ...inspection,
    systems: inspection.systems.map((progress) =>
      progress.systemId === systemId
        ? { ...progress, completedCheckpoints: system.checkpoints, status: "complete" }
        : progress
    )
  };
}
