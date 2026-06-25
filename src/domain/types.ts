export type InspectionStatus = "draft" | "in_review" | "ready_to_export" | "finalized";

export type Severity = "maintenance" | "monitor" | "repair" | "safety";

export type ReviewState = "needs_review" | "approved" | "edited" | "rejected";

export type SystemStatus = "not_started" | "in_progress" | "complete";

export interface StatePackField {
  id: string;
  label: string;
  required: boolean;
  type: "text" | "number" | "boolean" | "select" | "date";
  options?: string[];
}

export interface StatePackForm {
  id: string;
  title: string;
  description: string;
  fields: StatePackField[];
  reviewRequired: boolean;
}

export interface InspectionSystem {
  id: string;
  label: string;
  required: boolean;
  checkpoints: string[];
}

export interface StatePack {
  id: string;
  state: string;
  name: string;
  version: string;
  effectiveDate: string;
  status: "production_review" | "draft";
  forms: StatePackForm[];
  systems: InspectionSystem[];
  disclaimers: string[];
}

export interface PropertyProfile {
  address: string;
  city: string;
  state: string;
  postalCode: string;
  yearBuilt: string;
  squareFeet: string;
  occupancy: "occupied" | "vacant" | "unknown";
}

export interface InspectorProfile {
  name: string;
  company: string;
  license: string;
  email: string;
}

export interface PhotoEvidence {
  id: string;
  url: string;
  label: string;
  systemId: string;
  location: string;
  capturedAt: string;
  tags: string[];
  uploaded: boolean;
}

export interface Finding {
  id: string;
  systemId: string;
  photoIds: string[];
  title: string;
  narrative: string;
  severity: Severity;
  recommendation: string;
  reviewState: ReviewState;
  source: "inspector" | "ai";
}

export interface AiSuggestion {
  id: string;
  systemId: string;
  photoIds: string[];
  fieldId?: string;
  title: string;
  draft: string;
  confidence: number;
  reviewState: ReviewState;
  model: string;
  generatedAt: string;
}

export interface SystemProgress {
  systemId: string;
  status: SystemStatus;
  completedCheckpoints: string[];
}

export interface InspectionReport {
  id: string;
  statePackId: string;
  status: InspectionStatus;
  property: PropertyProfile;
  inspector: InspectorProfile;
  systems: SystemProgress[];
  photos: PhotoEvidence[];
  findings: Finding[];
  aiSuggestions: AiSuggestion[];
  signedAt?: string;
  exportedAt?: string;
}

export interface ReportReadiness {
  ready: boolean;
  completionPercent: number;
  missingRequiredSystems: string[];
  missingRequiredFields: string[];
  unreviewedSuggestions: number;
  rejectedSuggestions: number;
  safetyFindings: number;
  approvedFindings: number;
}

