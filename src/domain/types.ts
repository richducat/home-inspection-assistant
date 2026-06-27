export type InspectionStatus = "draft" | "in_review" | "ready_to_export" | "finalized";

export type Severity = "maintenance" | "monitor" | "repair" | "safety";

export type ReviewState = "needs_review" | "approved" | "edited" | "rejected";

export type SystemStatus = "not_started" | "in_progress" | "complete";

export type InspectionType =
  | "four-point"
  | "wind-mitigation"
  | "insurance-combo"
  | "roof-certification"
  | "full-home";

export type PaymentStatus = "unpaid" | "deposit_paid" | "paid" | "invoiced" | "waived";

export type IntakeSource = "website" | "google_calendar" | "phone" | "manual";

export type PermitType = "roof" | "electrical" | "hvac" | "plumbing" | "structural" | "other";

export type PermitCandidateStatus = "candidate" | "selected" | "rejected";

export interface InspectionRequest {
  clientName: string;
  insuredName: string;
  phone: string;
  email: string;
  inspectionType: InspectionType;
  price: string;
  paymentStatus: PaymentStatus;
  appointmentStart: string;
  appointmentEnd: string;
  source: IntakeSource;
  notes: string;
  calendarEventId?: string;
  calendarSummary?: string;
}

export interface OfficialFormFields {
  policyNumber: string;
  insuranceCompany: string;
  stories: string;
  workPhone: string;
  roofCovering: string;
  roofCoveringYear: string;
  roofAge: string;
  roofRemainingLife: string;
  roofPermitDate: string;
  roofCondition: string;
  roofDeckAttachmentNote: string;
  openingProtectionNote: string;
  electricalMainType: string;
  electricalAmps: string;
  panelBrand: string;
  panelAge: string;
  electricalCondition: string;
  hvacLastService: string;
  hvacAge: string;
  hvacUpdated: string;
  hvacCondition: string;
  plumbingMaterial: string;
  visibleLeaks: string;
  waterHeaterLocation: string;
  waterHeaterAge: string;
  plumbingCondition: string;
}

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
  ownerName?: string;
  county?: string;
  parcelId?: string;
  taxAccount?: string;
  legalDescription?: string;
  propertyUse?: string;
  floodZone?: string;
  sfha?: string;
  latitude?: number;
  longitude?: number;
  addressMatchLabel?: string;
  addressSource?: string;
  addressScore?: number;
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
  slotId?: string;
  location: string;
  capturedAt: string;
  tags: string[];
  uploaded: boolean;
  analysis?: PhotoAnalysis;
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
  severity?: Severity;
  recommendation?: string;
  visualSignals?: string[];
  sourcePhotoLabel?: string;
  reviewState: ReviewState;
  model: string;
  generatedAt: string;
}

export interface FieldSuggestion {
  id: string;
  fieldId: keyof OfficialFormFields;
  label: string;
  value: string;
  source: "image_scan" | "public_record" | "calendar" | "permit" | "inspector";
  confidence: number;
  reviewState: ReviewState;
  createdAt: string;
  sourceId?: string;
  photoIds?: string[];
}

export interface ImageScanMetrics {
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  edgeDensity: number;
  darkRatio: number;
  warmRatio: number;
  redRatio: number;
}

export interface PhotoAnalysis {
  id: string;
  scannedAt: string;
  model: string;
  confidence: number;
  severity: Severity;
  detectedIssue: string;
  summary: string;
  recommendation: string;
  visualSignals: string[];
  metrics: ImageScanMetrics;
}

export interface SystemProgress {
  systemId: string;
  status: SystemStatus;
  completedCheckpoints: string[];
}

export type PropertyResearchStatus = "idle" | "running" | "complete" | "partial" | "failed";

export type PropertyResearchSourceStatus =
  | "verified"
  | "not_found"
  | "link_only"
  | "blocked"
  | "failed"
  | "skipped";

export interface PropertyResearchSource {
  id: string;
  title: string;
  url: string;
  status: PropertyResearchSourceStatus;
  detail: string;
}

export interface PropertyResearchSuggestion {
  fieldPath: `property.${keyof PropertyProfile}`;
  label: string;
  value: string;
  sourceId: string;
  confidence: "high" | "medium" | "low";
  applyable: boolean;
  currentValue?: string;
}

export interface PropertyResearchPacket {
  status: PropertyResearchStatus;
  searchedAt: string;
  query: string;
  normalizedAddress?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  parcelId?: string;
  county?: string;
  ownerName?: string;
  legalDescription?: string;
  propertyUse?: string;
  floodZone?: string;
  sfha?: string;
  sources: PropertyResearchSource[];
  suggestions: PropertyResearchSuggestion[];
  permitCandidates: PermitCandidate[];
  notes: string[];
}

export interface PermitCandidate {
  id: string;
  type: PermitType;
  title: string;
  permitNumber: string;
  issuedDate: string;
  finalDate: string;
  contractor: string;
  sourceId: string;
  sourceUrl: string;
  confidence: "high" | "medium" | "low";
  status: PermitCandidateStatus;
  notes: string;
  importFields?: Partial<OfficialFormFields>;
}

export interface InspectionReport {
  id: string;
  statePackId: string;
  status: InspectionStatus;
  request: InspectionRequest;
  inspectionDate: string;
  scope: string;
  property: PropertyProfile;
  inspector: InspectorProfile;
  officialFields: OfficialFormFields;
  systems: SystemProgress[];
  photos: PhotoEvidence[];
  findings: Finding[];
  aiSuggestions: AiSuggestion[];
  fieldSuggestions: FieldSuggestion[];
  permitCandidates: PermitCandidate[];
  signatureName?: string;
  signedAt?: string;
  exportedAt?: string;
  researchPacket?: PropertyResearchPacket;
}

export interface ReportReadiness {
  ready: boolean;
  completionPercent: number;
  missingRequiredSystems: string[];
  missingRequiredFields: string[];
  unreviewedSuggestions: number;
  unreviewedFieldSuggestions: number;
  rejectedSuggestions: number;
  safetyFindings: number;
  approvedFindings: number;
}
