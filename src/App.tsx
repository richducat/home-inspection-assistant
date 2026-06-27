import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Database,
  FileDown,
  Download,
  ExternalLink,
  FileCheck2,
  Home,
  ImagePlus,
  Mail,
  MapPin,
  PenLine,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  XCircle
} from "lucide-react";
import { statePacks } from "./domain/statePacks";
import { seedInspection } from "./domain/seed";
import {
  analyzePhotoEvidence,
  createFieldSuggestionsFromAnalysis,
  createSuggestionFromAnalysis
} from "./domain/imageAnalysis";
import type {
  AiSuggestion,
  FieldSuggestion,
  Finding,
  InspectionReport,
  InspectionSystem,
  InspectionType,
  OfficialFormFields,
  PaymentStatus,
  PhotoEvidence,
  PermitCandidate,
  PropertyProfile,
  Severity
} from "./domain/types";
import {
  approveSuggestionAsFinding,
  calculateReportReadiness,
  markSystemComplete,
  updateSuggestionState
} from "./domain/inspectionLogic";
import { buildPrintableReportHtml, buildReportSummary } from "./domain/report";
import {
  buildFourPointPdf,
  buildWindMitigationPdf,
  downloadOfficialForm,
  type OfficialFormType
} from "./domain/officialForms";
import { applyResearchSuggestions, buildPropertyResearchLinks, researchProperty } from "./domain/propertyResearch";
import {
  resolveUsAddressSuggestion,
  suggestUsAddresses,
  type AddressCandidate,
  type AddressSuggestion
} from "./domain/addressAutocomplete";
import {
  applyFieldSuggestion,
  applyPermitCandidate,
  buildCalendarEventUrl,
  buildCalendarIcs,
  buildReportEmailHref,
  buildReviewRequestHref,
  createManualPermitCandidate,
  defaultInspectionRequest,
  defaultOfficialFields,
  labelInspectionType,
  parseCalendarInspectionText,
  updateFieldSuggestionState
} from "./domain/workflow";

const STORAGE_KEY = "home-inspection-assistant:v3";

type NavTarget = "workspace" | "photos" | "reports" | "compliance";
type InspectionField = "inspectionDate" | "scope" | "signatureName";
const coreAddressFields = new Set(["address", "city", "state", "postalCode"]);

type PhotoSlot = {
  id: string;
  systemId: string;
  label: string;
  formUse: string;
  required: boolean;
};

const photoSlots: PhotoSlot[] = [
  { id: "roof-covering", systemId: "roof", label: "Roof covering / front elevation", formUse: "4-point + wind", required: true },
  { id: "roof-underlayment", systemId: "roof", label: "Roof permit / covering detail", formUse: "wind", required: true },
  { id: "electrical-panel", systemId: "electrical", label: "Main electrical panel", formUse: "4-point", required: true },
  { id: "electrical-label", systemId: "electrical", label: "Panel label / amperage", formUse: "4-point", required: true },
  { id: "hvac-equipment", systemId: "hvac", label: "HVAC equipment data plate", formUse: "4-point", required: true },
  { id: "water-heater", systemId: "plumbing", label: "Water heater install / data plate", formUse: "4-point", required: true },
  { id: "plumbing-fixtures", systemId: "plumbing", label: "Visible plumbing fixtures", formUse: "4-point", required: true },
  { id: "opening-protection", systemId: "exterior", label: "Opening protection evidence", formUse: "wind", required: true }
];

const inspectionTypeOptions: InspectionType[] = [
  "insurance-combo",
  "four-point",
  "wind-mitigation",
  "roof-certification",
  "full-home"
];

const paymentStatusOptions: PaymentStatus[] = ["unpaid", "deposit_paid", "paid", "invoiced", "waived"];

const severityLabels: Record<Severity, string> = {
  maintenance: "Maintenance",
  monitor: "Monitor",
  repair: "Repair",
  safety: "Safety"
};

const blankFinding = {
  title: "",
  narrative: "",
  recommendation: "",
  severity: "monitor" as Severity
};

export function App() {
  const [inspection, setInspection] = useState<InspectionReport>(() => loadSavedInspection());
  const [activeSystemId, setActiveSystemId] = useState("roof");
  const [activePhotoSlotId, setActivePhotoSlotId] = useState(photoSlots[0]?.id ?? "");
  const [selectedPhotoId, setSelectedPhotoId] = useState(inspection.photos[0]?.id ?? "");
  const [selectedPackId, setSelectedPackId] = useState(inspection.statePackId);
  const [findingDraft, setFindingDraft] = useState(blankFinding);
  const [calendarImportText, setCalendarImportText] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<NavTarget>("workspace");
  const [scanningPhotoId, setScanningPhotoId] = useState("");
  const [scanError, setScanError] = useState("");
  const [officialFormStatus, setOfficialFormStatus] = useState("");
  const [researchingProperty, setResearchingProperty] = useState(false);
  const [propertyResearchStatus, setPropertyResearchStatus] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(() => new Date().toLocaleTimeString());

  const statePack = useMemo(
    () => statePacks.find((pack) => pack.id === selectedPackId) ?? statePacks[0],
    [selectedPackId]
  );

  const readiness = useMemo(
    () => calculateReportReadiness({ ...inspection, statePackId: statePack.id }, statePack),
    [inspection, statePack]
  );

  const activeSystem = statePack.systems.find((system) => system.id === activeSystemId) ?? statePack.systems[0];
  const activePhotos = inspection.photos.filter((photo) => photo.systemId === activeSystem.id);
  const displayedPhotos = activePhotos.length ? activePhotos : inspection.photos;
  const selectedPhoto = displayedPhotos.find((photo) => photo.id === selectedPhotoId) ?? displayedPhotos[0];
  const activeSuggestions = inspection.aiSuggestions.filter((suggestion) => suggestion.systemId === activeSystem.id);
  const activeFieldSuggestions = inspection.fieldSuggestions.filter((suggestion) =>
    selectedPhoto?.id ? suggestion.photoIds?.includes(selectedPhoto.id) || suggestion.reviewState === "needs_review" : true
  );
  const activeFindings = inspection.findings.filter((finding) => finding.systemId === activeSystem.id);
  const reportSummary = buildReportSummary(inspection, statePack, readiness);
  const activePhotoSlot = photoSlots.find((slot) => slot.id === activePhotoSlotId) ?? photoSlots[0];

  useEffect(() => {
    const payload = JSON.stringify(inspection);
    window.localStorage.setItem(STORAGE_KEY, payload);
    setLastSavedAt(new Date().toLocaleTimeString());
  }, [inspection]);

  function handlePackChange(packId: string) {
    const pack = statePacks.find((candidate) => candidate.id === packId);
    if (!pack) {
      return;
    }

    setSelectedPackId(packId);
    setInspection((current) => ({
      ...current,
      statePackId: packId,
      systems: pack.systems.map((system) => {
        const existing = current.systems.find((progress) => progress.systemId === system.id);
        return existing ?? { systemId: system.id, status: "not_started", completedCheckpoints: [] };
      })
    }));
    setActiveSystemId(pack.systems[0]?.id ?? "roof");
    setActivePhotoSlotId(photoSlots.find((slot) => slot.systemId === pack.systems[0]?.id)?.id ?? photoSlots[0]?.id ?? "");
    setSelectedPhotoId(inspection.photos[0]?.id ?? "");
  }

  function handleNavigate(target: NavTarget) {
    setActiveNav(target);

    if (target === "reports") {
      setReportOpen(true);
      return;
    }

    if (target === "compliance") {
      setComplianceOpen(true);
      return;
    }

    const sectionId = target === "photos" ? "photo-evidence-panel" : "inspection-workspace";
    window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleSelectSystem(systemId: string) {
    setActiveSystemId(systemId);
    setActivePhotoSlotId(photoSlots.find((slot) => slot.systemId === systemId)?.id ?? "");
    const nextSystemPhoto = inspection.photos.find((photo) => photo.systemId === systemId);
    setSelectedPhotoId(nextSystemPhoto?.id ?? inspection.photos[0]?.id ?? "");
  }

  function handleSelectPhotoSlot(slotId: string) {
    const slot = photoSlots.find((candidate) => candidate.id === slotId);
    if (!slot) {
      return;
    }

    setActivePhotoSlotId(slot.id);
    setActiveSystemId(slot.systemId);
    const slottedPhoto = inspection.photos.find((photo) => photo.slotId === slot.id);
    const systemPhoto = inspection.photos.find((photo) => photo.systemId === slot.systemId);
    setSelectedPhotoId(slottedPhoto?.id ?? systemPhoto?.id ?? inspection.photos[0]?.id ?? "");
  }

  async function handleAddPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    const slot = activePhotoSlot;
    const nextPhoto: PhotoEvidence = {
      id: `photo-${Date.now()}`,
      url: dataUrl,
      label: slot?.label || file.name.replace(/\.[^.]+$/, ""),
      systemId: slot?.systemId || activeSystem.id,
      slotId: slot?.id,
      location: "Field capture",
      capturedAt: new Date().toISOString(),
      tags: [slot?.systemId || activeSystem.id, slot?.formUse || "uploaded", "uploaded"],
      uploaded: true
    };

    setInspection((current) => ({ ...current, photos: [nextPhoto, ...current.photos] }));
    setSelectedPhotoId(nextPhoto.id);
    setScanError("");
    event.target.value = "";
  }

  async function handleAnalyzePhoto() {
    const photo = selectedPhoto;
    if (!photo || scanningPhotoId) {
      return;
    }

    setScanningPhotoId(photo.id);
    setScanError("");

    try {
      const system = statePack.systems.find((candidate) => candidate.id === photo.systemId) ?? activeSystem;
      const analysis = await analyzePhotoEvidence(photo, system);
      const suggestion = createSuggestionFromAnalysis(analysis, photo);
      const fieldSuggestions = createFieldSuggestionsFromAnalysis(analysis, photo);

      setInspection((current) => ({
        ...current,
        status: current.status === "finalized" ? "in_review" : current.status,
        signedAt: current.status === "finalized" ? undefined : current.signedAt,
        exportedAt: current.status === "finalized" ? undefined : current.exportedAt,
        photos: current.photos.map((candidate) =>
          candidate.id === photo.id ? { ...candidate, analysis } : candidate
        ),
        aiSuggestions: [suggestion, ...current.aiSuggestions],
        fieldSuggestions: [...fieldSuggestions, ...current.fieldSuggestions]
      }));
    } catch {
      setScanError("Photo scan could not read this image. Try another image or re-upload it.");
    } finally {
      setScanningPhotoId("");
    }
  }

  function handleSuggestionAction(suggestion: AiSuggestion, action: "approve" | "edit" | "reject") {
    if (action === "approve") {
      setInspection((current) => approveSuggestionAsFinding(current, suggestion.id, "monitor"));
      return;
    }

    setInspection((current) =>
      updateSuggestionState(current, suggestion.id, action === "edit" ? "edited" : "rejected")
    );
  }

  function handleFieldSuggestionAction(suggestion: FieldSuggestion, action: "approve" | "edit" | "reject") {
    if (action === "approve") {
      setInspection((current) => applyFieldSuggestion(current, suggestion.id));
      return;
    }

    setInspection((current) =>
      updateFieldSuggestionState(current, suggestion.id, action === "edit" ? "edited" : "rejected")
    );
  }

  function handleRequestFieldChange(field: keyof InspectionReport["request"], value: string) {
    setInspection((current) => ({
      ...current,
      request: {
        ...current.request,
        [field]: value
      },
      inspectionDate: field === "appointmentStart" && value ? value.slice(0, 10) : current.inspectionDate,
      property: field === "insuredName" && !current.property.ownerName ? { ...current.property, ownerName: value } : current.property,
      status: current.status === "finalized" ? "in_review" : current.status,
      signedAt: current.status === "finalized" ? undefined : current.signedAt,
      exportedAt: current.status === "finalized" ? undefined : current.exportedAt
    }));
  }

  function handleOfficialFieldChange(field: keyof OfficialFormFields, value: string) {
    setInspection((current) => ({
      ...current,
      officialFields: {
        ...current.officialFields,
        [field]: value
      },
      status: current.status === "finalized" ? "in_review" : current.status,
      signedAt: current.status === "finalized" ? undefined : current.signedAt,
      exportedAt: current.status === "finalized" ? undefined : current.exportedAt
    }));
  }

  function handleImportCalendarText() {
    setInspection((current) => parseCalendarInspectionText(calendarImportText, current));
    setCalendarImportText("");
  }

  function handleDownloadCalendarInvite() {
    const ics = buildCalendarIcs(inspection);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${inspection.property.address || "inspection"}-calendar.ics`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handlePermitChange(permitId: string, field: keyof PermitCandidate, value: string) {
    setInspection((current) => ({
      ...current,
      permitCandidates: current.permitCandidates.map((permit) =>
        permit.id === permitId ? { ...permit, [field]: value } : permit
      ),
      status: current.status === "finalized" ? "in_review" : current.status,
      signedAt: current.status === "finalized" ? undefined : current.signedAt,
      exportedAt: current.status === "finalized" ? undefined : current.exportedAt
    }));
  }

  function handleAddPermit(type: PermitCandidate["type"]) {
    setInspection((current) => ({
      ...current,
      permitCandidates: [createManualPermitCandidate(type), ...current.permitCandidates]
    }));
  }

  function handleSelectPermit(permitId: string) {
    setInspection((current) => applyPermitCandidate(current, permitId));
  }

  function handleAssignPhotoToSlot(photoId: string, slotId: string) {
    const slot = photoSlots.find((candidate) => candidate.id === slotId);
    if (!slot) {
      return;
    }

    setInspection((current) => ({
      ...current,
      photos: current.photos.map((photo) =>
        photo.id === photoId
          ? {
              ...photo,
              slotId: slot.id,
              systemId: slot.systemId,
              tags: Array.from(new Set([...photo.tags, slot.systemId, slot.formUse]))
            }
          : photo
      )
    }));
  }

  function handleToggleCheckpoint(checkpoint: string) {
    setInspection((current) => ({
      ...current,
      systems: current.systems.map((progress) => {
        if (progress.systemId !== activeSystem.id) {
          return progress;
        }

        const hasCheckpoint = progress.completedCheckpoints.includes(checkpoint);
        const completedCheckpoints = hasCheckpoint
          ? progress.completedCheckpoints.filter((item) => item !== checkpoint)
          : [...progress.completedCheckpoints, checkpoint];

        return {
          ...progress,
          completedCheckpoints,
          status:
            completedCheckpoints.length === activeSystem.checkpoints.length
              ? "complete"
              : completedCheckpoints.length > 0
                ? "in_progress"
                : "not_started"
        };
      })
    }));
  }

  function handleGenerateDraft() {
    const basePhoto = selectedPhoto ?? activePhotos[0];
    const photoIds = basePhoto ? [basePhoto.id] : [];
    const title = `${activeSystem.label} review draft`;
    const locationText = basePhoto?.location ? ` at ${basePhoto.location}` : "";
    const draft =
      `Inspector should review ${activeSystem.label.toLowerCase()} conditions${locationText}. ` +
      `Confirm visible defects, limitations, age indicators, safety concerns, and whether contractor evaluation is recommended.`;

    const suggestion: AiSuggestion = {
      id: `ai-${Date.now()}`,
      systemId: activeSystem.id,
      photoIds,
      title,
      draft,
      confidence: basePhoto ? 0.74 : 0.58,
      reviewState: "needs_review",
      model: "local-assistive-draft",
      generatedAt: new Date().toISOString()
    };

    setInspection((current) => ({ ...current, aiSuggestions: [suggestion, ...current.aiSuggestions] }));
  }

  function handleAddFinding() {
    if (!findingDraft.title.trim() || !findingDraft.narrative.trim()) {
      return;
    }

    const finding: Finding = {
      id: `finding-${Date.now()}`,
      systemId: activeSystem.id,
      photoIds: selectedPhoto ? [selectedPhoto.id] : [],
      title: findingDraft.title.trim(),
      narrative: findingDraft.narrative.trim(),
      recommendation:
        findingDraft.recommendation.trim() || "Inspector to confirm final recommendation before export.",
      severity: findingDraft.severity,
      reviewState: "approved",
      source: "inspector"
    };

    setInspection((current) => ({ ...current, findings: [finding, ...current.findings] }));
    setFindingDraft(blankFinding);
  }

  function handleDeleteFinding(findingId: string) {
    setInspection((current) => ({
      ...current,
      findings: current.findings.filter((finding) => finding.id !== findingId)
    }));
  }

  function handlePhotoChange(photoId: string, patch: Pick<PhotoEvidence, "label" | "location">) {
    setInspection((current) => ({
      ...current,
      status: current.status === "finalized" ? "in_review" : current.status,
      signedAt: current.status === "finalized" ? undefined : current.signedAt,
      exportedAt: current.status === "finalized" ? undefined : current.exportedAt,
      photos: current.photos.map((photo) => (photo.id === photoId ? { ...photo, ...patch } : photo))
    }));
  }

  function handleFieldChange(scope: "property" | "inspector", field: string, value: string) {
    setInspection((current) => ({
      ...current,
      status: current.status === "finalized" ? "in_review" : current.status,
      signedAt: current.status === "finalized" ? undefined : current.signedAt,
      exportedAt: current.status === "finalized" ? undefined : current.exportedAt,
      researchPacket: scope === "property" && coreAddressFields.has(field) ? undefined : current.researchPacket,
      [scope]: {
        ...current[scope],
        ...(scope === "property" && coreAddressFields.has(field) ? clearedPublicRecordPropertyFields() : {}),
        [field]: value
      }
    }));
  }

  function handleAddressCandidateSelect(candidate: AddressCandidate) {
    setInspection((current) => ({
      ...current,
      status: current.status === "finalized" ? "in_review" : current.status,
      signedAt: current.status === "finalized" ? undefined : current.signedAt,
      exportedAt: current.status === "finalized" ? undefined : current.exportedAt,
      researchPacket: undefined,
      property: {
        ...current.property,
        ...clearedPublicRecordPropertyFields(),
        address: candidate.street || candidate.matchAddress,
        city: candidate.city || current.property.city,
        state: candidate.state || current.property.state,
        postalCode: candidate.postalCode || current.property.postalCode,
        county: candidate.county || current.property.county,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        addressMatchLabel: candidate.matchAddress,
        addressSource: candidate.source,
        addressScore: candidate.score
      }
    }));
    setPropertyResearchStatus("Address selected from nationwide address search. Run public-record research to pull parcel and form data.");
  }

  function handleInspectionFieldChange(field: InspectionField, value: string) {
    setInspection((current) => ({
      ...current,
      status: current.status === "finalized" ? "in_review" : current.status,
      signedAt: current.status === "finalized" ? undefined : current.signedAt,
      exportedAt: current.status === "finalized" ? undefined : current.exportedAt,
      [field]: value
    }));
  }

  function handleReset() {
    const fresh = cloneInspection(seedInspection);
    window.localStorage.removeItem(STORAGE_KEY);
    setInspection(fresh);
    setSelectedPackId(fresh.statePackId);
    setActiveSystemId("roof");
    setSelectedPhotoId(fresh.photos[0]?.id ?? "");
    setFindingDraft(blankFinding);
  }

  function handleNewInspection() {
    const fresh = createBlankInspection(statePack.systems, selectedPackId);
    setInspection(fresh);
    setActiveSystemId(statePack.systems[0]?.id ?? "roof");
    setSelectedPhotoId("");
    setFindingDraft(blankFinding);
  }

  function handleDownloadJson() {
    const blob = new Blob([JSON.stringify({ inspection, statePack, readiness }, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${inspection.property.address || "inspection"}-record.json`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadReportHtml() {
    const html = buildPrintableReportHtml(inspection, statePack, readiness);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${inspection.property.address || "inspection"}-report.html`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownloadOfficialForm(type: OfficialFormType) {
    setOfficialFormStatus(type === "four-point" ? "Building official 4-Point PDF..." : "Building official Wind Mitigation PDF...");
    try {
      const exportedForm =
        type === "four-point" ? await buildFourPointPdf(inspection) : await buildWindMitigationPdf(inspection);
      downloadOfficialForm(exportedForm);
      setOfficialFormStatus(
        type === "four-point"
          ? "Official 4-Point PDF generated from the supplied blank template."
          : "Official Wind Mitigation PDF generated from the supplied blank template."
      );
    } catch {
      setOfficialFormStatus("Official PDF export failed. Reopen the app and try again.");
    }
  }

  async function handleResearchProperty() {
    if (researchingProperty) {
      return;
    }

    setResearchingProperty(true);
    setPropertyResearchStatus("Checking public records and official documentation sources...");

    try {
      const packet = await researchProperty(inspection);
      const appliedCount = packet.suggestions.filter((suggestion) => suggestion.applyable).length;

      setInspection((current) => applyResearchSuggestions(current, packet));
      setPropertyResearchStatus(
        appliedCount > 0
          ? `Public-record research complete. Autofilled ${appliedCount} sourced field${appliedCount === 1 ? "" : "s"}.`
          : "Public-record research complete. No new autofill fields were found for this address."
      );
    } catch {
      const failedPacket = {
        status: "failed" as const,
        searchedAt: new Date().toISOString(),
        query: [
          inspection.property.address,
          inspection.property.city,
          inspection.property.state,
          inspection.property.postalCode
        ]
          .filter(Boolean)
          .join(", "),
        sources: buildPropertyResearchLinks(inspection.property),
        suggestions: [],
        permitCandidates: [],
        notes: ["Public-record lookup failed in the browser. Use the official source links for manual verification."]
      };
      setInspection((current) => ({ ...current, researchPacket: failedPacket }));
      setPropertyResearchStatus("Public-record lookup failed. Official manual source links are still available below.");
    } finally {
      setResearchingProperty(false);
    }
  }

  function handleFinalizeInspection() {
    if (!readiness.ready || !inspection.signatureName?.trim()) {
      return;
    }

    const timestamp = new Date().toISOString();
    setInspection((current) => ({
      ...current,
      status: "finalized",
      signedAt: timestamp,
      exportedAt: timestamp
    }));
    setReportOpen(true);
  }

  return (
    <main className="app-shell">
      <Sidebar
        selectedPackId={selectedPackId}
        onPackChange={handlePackChange}
        completionPercent={readiness.completionPercent}
        lastSavedAt={lastSavedAt}
        onNewInspection={handleNewInspection}
        onReset={handleReset}
        activeNav={activeNav}
        onNavigate={handleNavigate}
      />
      <section className="workspace">
        <Header
          inspection={inspection}
          readiness={readiness}
          onExport={() => setReportOpen(true)}
          onDownloadJson={handleDownloadJson}
        />
        <section className="edit-band" id="inspection-workspace" aria-label="Inspection setup">
          <div className="setup-stack">
            <IntakePanel
              inspection={inspection}
              calendarImportText={calendarImportText}
              calendarEventUrl={buildCalendarEventUrl(inspection)}
              onRequestFieldChange={handleRequestFieldChange}
              onCalendarImportTextChange={setCalendarImportText}
              onImportCalendarText={handleImportCalendarText}
              onDownloadCalendarInvite={handleDownloadCalendarInvite}
            />
            <PropertyResearchPanel
              inspection={inspection}
              researching={researchingProperty}
              statusText={propertyResearchStatus}
              onResearch={handleResearchProperty}
            />
            <PermitReviewPanel
              permits={inspection.permitCandidates}
              onPermitChange={handlePermitChange}
              onAddPermit={handleAddPermit}
              onSelectPermit={handleSelectPermit}
            />
            <OfficialFieldsPanel fields={inspection.officialFields} onFieldChange={handleOfficialFieldChange} />
            <ProfileEditor
              inspectionDate={inspection.inspectionDate}
              scope={inspection.scope}
              property={inspection.property}
              inspector={inspection.inspector}
              onFieldChange={handleFieldChange}
              onAddressCandidateSelect={handleAddressCandidateSelect}
              onInspectionFieldChange={handleInspectionFieldChange}
            />
          </div>
        </section>
        <div className="workgrid">
          <SystemChecklist
            statePackSystems={statePack.systems}
            activeSystemId={activeSystem.id}
            inspection={inspection}
            onSelect={handleSelectSystem}
            onCheckpoint={handleToggleCheckpoint}
            onComplete={() => setInspection((current) => markSystemComplete(current, statePack, activeSystem.id))}
          />
          <PhotoWorkspace
            systemLabel={activeSystem.label}
            photos={displayedPhotos}
            allPhotos={inspection.photos}
            selectedPhoto={selectedPhoto}
            photoSlots={photoSlots}
            activeSlotId={activePhotoSlotId}
            onSelectPhoto={setSelectedPhotoId}
            onSelectPhotoSlot={handleSelectPhotoSlot}
            onAddPhoto={handleAddPhoto}
            onUpdatePhoto={handlePhotoChange}
            onAssignPhotoToSlot={handleAssignPhotoToSlot}
            onAnalyzePhoto={handleAnalyzePhoto}
            onGenerateDraft={handleGenerateDraft}
            scanningPhotoId={scanningPhotoId}
            scanError={scanError}
          />
          <ReviewPanel
            statePackName={statePack.name}
            readiness={readiness}
            inspectionStatus={inspection.status}
            signedAt={inspection.signedAt}
            signatureName={inspection.signatureName ?? ""}
            suggestions={activeSuggestions}
            fieldSuggestions={activeFieldSuggestions}
            findings={activeFindings}
            findingDraft={findingDraft}
            setFindingDraft={setFindingDraft}
            reportSummary={reportSummary}
            onSuggestionAction={handleSuggestionAction}
            onFieldSuggestionAction={handleFieldSuggestionAction}
            onAddFinding={handleAddFinding}
            onDeleteFinding={handleDeleteFinding}
            onSignatureNameChange={(value) => handleInspectionFieldChange("signatureName", value)}
            onFinalize={handleFinalizeInspection}
          />
        </div>
      </section>

      {reportOpen && (
        <ReportDrawer
          inspection={inspection}
          readiness={readiness}
          reportSummary={reportSummary}
          statePack={statePack}
          onClose={() => setReportOpen(false)}
          onPrint={() => window.print()}
          onDownloadJson={handleDownloadJson}
          onDownloadReportHtml={handleDownloadReportHtml}
          onDownloadFourPoint={() => handleDownloadOfficialForm("four-point")}
          onDownloadWindMitigation={() => handleDownloadOfficialForm("wind-mitigation")}
          officialFormStatus={officialFormStatus}
          reportEmailHref={buildReportEmailHref(inspection)}
          reviewRequestHref={buildReviewRequestHref(inspection)}
        />
      )}

      {complianceOpen && (
        <ComplianceDrawer statePack={statePack} onClose={() => setComplianceOpen(false)} />
      )}
    </main>
  );
}

function Sidebar({
  selectedPackId,
  onPackChange,
  completionPercent,
  lastSavedAt,
  onNewInspection,
  onReset,
  activeNav,
  onNavigate
}: {
  selectedPackId: string;
  onPackChange: (packId: string) => void;
  completionPercent: number;
  lastSavedAt: string;
  onNewInspection: () => void;
  onReset: () => void;
  activeNav: NavTarget;
  onNavigate: (target: NavTarget) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Home size={20} />
        </div>
        <div>
          <strong>Home Inspection Assistant</strong>
          <span>Browser-local working app</span>
        </div>
      </div>

      <nav className="nav-stack" aria-label="Primary">
        <button
          className={activeNav === "workspace" ? "nav-item active" : "nav-item"}
          type="button"
          onClick={() => onNavigate("workspace")}
        >
          <ClipboardList size={17} />
          Inspection Workspace
        </button>
        <button
          className={activeNav === "photos" ? "nav-item active" : "nav-item"}
          type="button"
          onClick={() => onNavigate("photos")}
        >
          <ImagePlus size={17} />
          Photo Evidence
        </button>
        <button
          className={activeNav === "reports" ? "nav-item active" : "nav-item"}
          type="button"
          onClick={() => onNavigate("reports")}
        >
          <FileCheck2 size={17} />
          Report Exports
        </button>
        <button
          className={activeNav === "compliance" ? "nav-item active" : "nav-item"}
          type="button"
          onClick={() => onNavigate("compliance")}
        >
          <ShieldCheck size={17} />
          Compliance Packs
        </button>
      </nav>

      <div className="sidebar-section">
        <label htmlFor="state-pack">State pack</label>
        <select id="state-pack" value={selectedPackId} onChange={(event) => onPackChange(event.target.value)}>
          {statePacks.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.name} ({pack.version})
            </option>
          ))}
        </select>
      </div>

      <div className="progress-card">
        <span>Export readiness</span>
        <strong>{completionPercent}%</strong>
        <div className="meter" aria-hidden="true">
          <div style={{ width: `${completionPercent}%` }} />
        </div>
      </div>

      <div className="sidebar-actions">
        <button className="ghost-button" type="button" onClick={onNewInspection}>
          <Plus size={15} />
          New inspection
        </button>
        <button className="ghost-button" type="button" onClick={onReset}>
          <RotateCcw size={15} />
          Reset demo
        </button>
      </div>

      <div className="save-note">
        <Save size={16} />
        Saved locally at {lastSavedAt}
      </div>

      <div className="isolation-note">
        <ShieldCheck size={16} />
        Separate repo, bundle ID, backend, storage, and release train from CadetCatch.
      </div>
    </aside>
  );
}

function Header({
  inspection,
  readiness,
  onExport,
  onDownloadJson
}: {
  inspection: InspectionReport;
  readiness: ReturnType<typeof calculateReportReadiness>;
  onExport: () => void;
  onDownloadJson: () => void;
}) {
  return (
    <header className="topbar">
      <div>
        <p className="meta-line">{inspection.status.replace(/_/g, " ")}</p>
        <h1>{inspection.property.address || "Untitled inspection"}</h1>
        <p>
          {inspection.property.city || "City"}, {inspection.property.state || "State"}{" "}
          {inspection.property.postalCode || "ZIP"} · {inspection.property.yearBuilt || "Year"} ·{" "}
          {inspection.property.squareFeet || "0"} sq ft
        </p>
      </div>
      <div className="topbar-actions">
        <div className={readiness.ready ? "status-pill ready" : "status-pill review"}>
          {readiness.ready ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {readiness.ready ? "Ready to export" : "Review required"}
        </div>
        <button className="ghost-button" type="button" onClick={onDownloadJson}>
          <Download size={16} />
          Save record
        </button>
        <button className="primary-button" type="button" onClick={onExport}>
          <FileCheck2 size={16} />
          Open report
        </button>
      </div>
    </header>
  );
}

function IntakePanel({
  inspection,
  calendarImportText,
  calendarEventUrl,
  onRequestFieldChange,
  onCalendarImportTextChange,
  onImportCalendarText,
  onDownloadCalendarInvite
}: {
  inspection: InspectionReport;
  calendarImportText: string;
  calendarEventUrl: string;
  onRequestFieldChange: (field: keyof InspectionReport["request"], value: string) => void;
  onCalendarImportTextChange: (value: string) => void;
  onImportCalendarText: () => void;
  onDownloadCalendarInvite: () => void;
}) {
  const request = inspection.request;
  return (
    <section className="intake-panel" aria-label="Booking intake and calendar">
      <div className="research-header">
        <div>
          <span className="panel-kicker">Booking intake</span>
          <h2>Website form + Google Calendar</h2>
        </div>
        <div className="button-pair">
          <a className="ghost-button anchor-button" href={calendarEventUrl} target="_blank" rel="noreferrer">
            <CalendarDays size={15} />
            Add to Google Calendar
          </a>
          <button className="ghost-button" type="button" onClick={onDownloadCalendarInvite}>
            <FileDown size={15} />
            Download ICS
          </button>
        </div>
      </div>

      <div className="intake-grid">
        <label>
          Client name
          <input
            value={request.clientName}
            onChange={(event) => onRequestFieldChange("clientName", event.target.value)}
          />
        </label>
        <label>
          Insured / policyholder
          <input
            value={request.insuredName}
            onChange={(event) => onRequestFieldChange("insuredName", event.target.value)}
          />
        </label>
        <label>
          Phone
          <input value={request.phone} onChange={(event) => onRequestFieldChange("phone", event.target.value)} />
        </label>
        <label>
          Email
          <input
            type="email"
            value={request.email}
            onChange={(event) => onRequestFieldChange("email", event.target.value)}
          />
        </label>
        <label>
          Inspection type
          <select
            value={request.inspectionType}
            onChange={(event) => onRequestFieldChange("inspectionType", event.target.value)}
          >
            {inspectionTypeOptions.map((option) => (
              <option key={option} value={option}>
                {labelInspectionType(option)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Price
          <input value={request.price} onChange={(event) => onRequestFieldChange("price", event.target.value)} />
        </label>
        <label>
          Payment
          <select
            value={request.paymentStatus}
            onChange={(event) => onRequestFieldChange("paymentStatus", event.target.value)}
          >
            {paymentStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select value={request.source} onChange={(event) => onRequestFieldChange("source", event.target.value)}>
            <option value="website">Website</option>
            <option value="google_calendar">Google Calendar</option>
            <option value="phone">Phone</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <label>
          Appointment start
          <input
            type="datetime-local"
            value={request.appointmentStart}
            onChange={(event) => onRequestFieldChange("appointmentStart", event.target.value)}
          />
        </label>
        <label>
          Appointment end
          <input
            type="datetime-local"
            value={request.appointmentEnd}
            onChange={(event) => onRequestFieldChange("appointmentEnd", event.target.value)}
          />
        </label>
        <label className="wide-field">
          Booking notes
          <textarea value={request.notes} onChange={(event) => onRequestFieldChange("notes", event.target.value)} />
        </label>
        <label className="wide-field">
          Paste Google Calendar event text
          <textarea
            placeholder="Client: Beth York&#10;Email: beth@example.com&#10;Inspection type: 4-point + wind&#10;Address: 742 Palmetto Ridge Dr&#10;City State Zip: Viera FL 32940"
            value={calendarImportText}
            onChange={(event) => onCalendarImportTextChange(event.target.value)}
          />
        </label>
      </div>

      <div className="intake-footer">
        <button className="primary-button" type="button" disabled={!calendarImportText.trim()} onClick={onImportCalendarText}>
          <ClipboardList size={15} />
          Import pasted calendar event
        </button>
        <span>Client-entered data pre-fills report headers, calendar details, and email handoff.</span>
      </div>
    </section>
  );
}

function PropertyResearchPanel({
  inspection,
  researching,
  statusText,
  onResearch
}: {
  inspection: InspectionReport;
  researching: boolean;
  statusText: string;
  onResearch: () => void;
}) {
  const packet = inspection.researchPacket;
  const sources = packet?.sources ?? buildPropertyResearchLinks(inspection.property);
  const verifiedSources = sources.filter((source) => source.status === "verified").length;
  const blockedSources = sources.filter((source) => ["blocked", "failed"].includes(source.status)).length;
  const sourceFacts = [
    ["Owner", inspection.property.ownerName],
    ["County", inspection.property.county || packet?.county],
    ["Parcel", inspection.property.parcelId || packet?.parcelId],
    ["Flood zone", inspection.property.floodZone || packet?.floodZone],
    ["SFHA", inspection.property.sfha || packet?.sfha]
  ];

  return (
    <section className="property-research-panel" aria-label="Public records research">
      <div className="research-header">
        <div>
          <span className="panel-kicker">Public records</span>
          <h2>Research + autofill</h2>
        </div>
        <button className="primary-button" type="button" disabled={researching} onClick={onResearch}>
          <Database size={15} />
          {researching ? "Researching..." : "Research + autofill"}
        </button>
      </div>

      <div className="research-status-row">
        <span className={`research-state ${packet?.status ?? "idle"}`}>{packet?.status ?? "idle"}</span>
        <span>{verifiedSources} verified source{verifiedSources === 1 ? "" : "s"}</span>
        <span>{blockedSources} source{blockedSources === 1 ? "" : "s"} need manual review</span>
        {packet?.searchedAt && <span>Checked {new Date(packet.searchedAt).toLocaleString()}</span>}
      </div>

      {statusText && <p className="research-status-text">{statusText}</p>}

      <dl className="research-facts">
        {sourceFacts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "Not populated"}</dd>
          </div>
        ))}
      </dl>

      {packet?.normalizedAddress && (
        <p className="research-address">Matched address: {packet.normalizedAddress}</p>
      )}

      <div className="research-grid">
        <div>
          <h3>Autofill suggestions</h3>
          <div className="research-suggestion-list">
            {!packet?.suggestions.length && (
              <p className="empty-state">Run research to pull available public-record fields.</p>
            )}
            {packet?.suggestions.map((suggestion) => (
              <div className="research-suggestion" key={`${suggestion.fieldPath}-${suggestion.sourceId}`}>
                <div>
                  <strong>{suggestion.label}</strong>
                  <span>{suggestion.sourceId.replace(/-/g, " ")}</span>
                </div>
                <p>{suggestion.value}</p>
                <small>
                  {suggestion.confidence} confidence
                  {suggestion.currentValue ? ` · replaced "${suggestion.currentValue}"` : ""}
                </small>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>Official source links</h3>
          <div className="source-list">
            {sources.map((source) => (
              <a href={source.url} target="_blank" rel="noreferrer" className="source-link" key={source.id}>
                <span>
                  <strong>{source.title}</strong>
                  <small>{source.detail}</small>
                </span>
                <span className={`source-status ${source.status}`}>{source.status.replace("_", " ")}</span>
                <ExternalLink size={14} />
              </a>
            ))}
          </div>
        </div>
      </div>

      {packet?.notes.length ? (
        <ul className="research-notes">
          {packet.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function PermitReviewPanel({
  permits,
  onPermitChange,
  onAddPermit,
  onSelectPermit
}: {
  permits: PermitCandidate[];
  onPermitChange: (permitId: string, field: keyof PermitCandidate, value: string) => void;
  onAddPermit: (type: PermitCandidate["type"]) => void;
  onSelectPermit: (permitId: string) => void;
}) {
  const selectedCount = permits.filter((permit) => permit.status === "selected").length;
  return (
    <section className="permit-panel" aria-label="Permit review">
      <div className="research-header">
        <div>
          <span className="panel-kicker">Permit history</span>
          <h2>Review candidates before import</h2>
        </div>
        <div className="button-pair">
          <button className="ghost-button" type="button" onClick={() => onAddPermit("roof")}>
            <Plus size={15} />
            Roof permit
          </button>
          <button className="ghost-button" type="button" onClick={() => onAddPermit("hvac")}>
            <Plus size={15} />
            HVAC permit
          </button>
        </div>
      </div>
      <div className="permit-summary">
        <span>{permits.length} candidate{permits.length === 1 ? "" : "s"}</span>
        <span>{selectedCount} selected for official forms</span>
      </div>
      <div className="permit-list">
        {permits.length === 0 && <p className="empty-state">Run public-record research or add a permit manually.</p>}
        {permits.map((permit) => (
          <article className={permit.status === "selected" ? "permit-card selected" : "permit-card"} key={permit.id}>
            <div className="permit-card-header">
              <div>
                <strong>{permit.title}</strong>
                <span>{permit.type} · {permit.confidence} confidence · {permit.status}</span>
              </div>
              {permit.sourceUrl ? (
                <a className="source-mini-link" href={permit.sourceUrl} target="_blank" rel="noreferrer">
                  Source <ExternalLink size={13} />
                </a>
              ) : null}
            </div>
            <div className="permit-edit-grid">
              <label>
                Permit #
                <input
                  value={permit.permitNumber}
                  onChange={(event) => onPermitChange(permit.id, "permitNumber", event.target.value)}
                />
              </label>
              <label>
                Issued
                <input
                  type="date"
                  value={permit.issuedDate}
                  onChange={(event) => onPermitChange(permit.id, "issuedDate", event.target.value)}
                />
              </label>
              <label>
                Final
                <input
                  type="date"
                  value={permit.finalDate}
                  onChange={(event) => onPermitChange(permit.id, "finalDate", event.target.value)}
                />
              </label>
              <label>
                Contractor
                <input
                  value={permit.contractor}
                  onChange={(event) => onPermitChange(permit.id, "contractor", event.target.value)}
                />
              </label>
            </div>
            <textarea
              aria-label={`${permit.title} notes`}
              value={permit.notes}
              onChange={(event) => onPermitChange(permit.id, "notes", event.target.value)}
            />
            <button className="primary-button" type="button" onClick={() => onSelectPermit(permit.id)}>
              <Check size={15} />
              {permit.status === "selected" ? "Selected" : "Select + import fields"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function OfficialFieldsPanel({
  fields,
  onFieldChange
}: {
  fields: OfficialFormFields;
  onFieldChange: (field: keyof OfficialFormFields, value: string) => void;
}) {
  const sections: Array<{ title: string; fields: Array<[keyof OfficialFormFields, string]> }> = [
    {
      title: "Carrier / header",
      fields: [
        ["insuranceCompany", "Insurance company"],
        ["policyNumber", "Policy #"],
        ["stories", "Stories"],
        ["workPhone", "Work phone"]
      ]
    },
    {
      title: "Roof / wind",
      fields: [
        ["roofCovering", "Roof covering"],
        ["roofCoveringYear", "Covering year"],
        ["roofAge", "Roof age"],
        ["roofPermitDate", "Permit date"],
        ["roofRemainingLife", "Remaining useful life"],
        ["roofCondition", "Roof condition"],
        ["roofDeckAttachmentNote", "Deck attachment note"],
        ["openingProtectionNote", "Opening protection"]
      ]
    },
    {
      title: "4-point systems",
      fields: [
        ["electricalMainType", "Electrical main type"],
        ["electricalAmps", "Amps"],
        ["panelBrand", "Panel brand"],
        ["panelAge", "Panel age"],
        ["electricalCondition", "Electrical condition"],
        ["hvacLastService", "HVAC last service"],
        ["hvacAge", "HVAC age"],
        ["hvacUpdated", "HVAC updated"],
        ["hvacCondition", "HVAC condition"],
        ["plumbingMaterial", "Plumbing material"],
        ["visibleLeaks", "Visible leaks"],
        ["waterHeaterLocation", "Water heater location"],
        ["waterHeaterAge", "Water heater age"],
        ["plumbingCondition", "Plumbing condition"]
      ]
    }
  ];

  return (
    <section className="official-fields-panel" aria-label="Official form fields">
      <div className="research-header">
        <div>
          <span className="panel-kicker">Official forms</span>
          <h2>Reviewed field values</h2>
        </div>
        <span className="review-chip edited">Inspector editable</span>
      </div>
      <div className="official-field-sections">
        {sections.map((section) => (
          <fieldset key={section.title}>
            <legend>{section.title}</legend>
            <div className="official-field-grid">
              {section.fields.map(([field, label]) => (
                <label key={field}>
                  {label}
                  <input value={fields[field]} onChange={(event) => onFieldChange(field, event.target.value)} />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}

function ProfileEditor({
  inspectionDate,
  scope,
  property,
  inspector,
  onFieldChange,
  onAddressCandidateSelect,
  onInspectionFieldChange
}: {
  inspectionDate: string;
  scope: string;
  property: PropertyProfile;
  inspector: InspectionReport["inspector"];
  onFieldChange: (scope: "property" | "inspector", field: string, value: string) => void;
  onAddressCandidateSelect: (candidate: AddressCandidate) => void;
  onInspectionFieldChange: (field: InspectionField, value: string) => void;
}) {
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSearchStatus, setAddressSearchStatus] = useState("");
  const [addressSearchOpen, setAddressSearchOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [selectedAddressText, setSelectedAddressText] = useState(property.addressMatchLabel || property.address);

  useEffect(() => {
    const query = property.address.trim();
    if (query.length < 4 || query === selectedAddressText) {
      setAddressSuggestions([]);
      setAddressSearchOpen(false);
      setAddressSearchStatus(query.length > 0 && query.length < 4 ? "Type at least 4 characters for nationwide address search." : "");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setAddressSearchStatus("Searching United States address database...");
      try {
        const suggestions = await suggestUsAddresses(query, controller.signal);
        setAddressSuggestions(suggestions);
        setActiveSuggestionIndex(0);
        setAddressSearchOpen(suggestions.length > 0);
        setAddressSearchStatus(
          suggestions.length > 0
            ? `${suggestions.length} address match${suggestions.length === 1 ? "" : "es"} found.`
            : "No nationwide address matches found yet."
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setAddressSuggestions([]);
          setAddressSearchOpen(false);
          setAddressSearchStatus("Address search is temporarily unavailable. You can still type the address manually.");
        }
      }
    }, 275);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [property.address, selectedAddressText]);

  async function handleSuggestionSelect(suggestion: AddressSuggestion) {
    setAddressSearchStatus("Resolving selected address...");
    try {
      const candidate = await resolveUsAddressSuggestion(suggestion);
      onAddressCandidateSelect(candidate);
      setSelectedAddressText(candidate.street || suggestion.text);
      setAddressSuggestions([]);
      setAddressSearchOpen(false);
      setAddressSearchStatus(`Selected ${candidate.matchAddress}.`);
    } catch {
      setAddressSearchStatus("Could not resolve that address. Try another suggestion or enter it manually.");
    }
  }

  function handleAddressKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!addressSearchOpen || addressSuggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current + 1) % addressSuggestions.length);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current - 1 + addressSuggestions.length) % addressSuggestions.length);
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void handleSuggestionSelect(addressSuggestions[activeSuggestionIndex]);
    }

    if (event.key === "Escape") {
      setAddressSearchOpen(false);
    }
  }

  return (
    <div className="profile-grid">
      <label>
        Inspection date
        <input
          type="date"
          value={inspectionDate}
          onChange={(event) => onInspectionFieldChange("inspectionDate", event.target.value)}
        />
      </label>
      <label className="address-autocomplete-field">
        Property address
        <div className="address-autocomplete">
          <input
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={addressSearchOpen}
            value={property.address}
            onChange={(event) => {
              setSelectedAddressText("");
              setAddressSuggestions([]);
              setAddressSearchOpen(false);
              setAddressSearchStatus("Searching United States address database...");
              onFieldChange("property", "address", event.target.value);
            }}
            onFocus={() => setAddressSearchOpen(addressSuggestions.length > 0)}
            onKeyDown={handleAddressKeyDown}
          />
          {addressSearchOpen && addressSuggestions.length > 0 && (
            <div className="address-suggestion-menu" role="listbox" aria-label="Address suggestions">
              {addressSuggestions.map((suggestion, index) => (
                <button
                  className={index === activeSuggestionIndex ? "address-suggestion active" : "address-suggestion"}
                  key={suggestion.magicKey}
                  type="button"
                  role="option"
                  aria-selected={index === activeSuggestionIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void handleSuggestionSelect(suggestion)}
                >
                  <MapPin size={14} />
                  <span>{suggestion.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {addressSearchStatus && <span className="address-search-status">{addressSearchStatus}</span>}
        {property.addressMatchLabel && (
          <span className="address-match-note">
            Matched: {property.addressMatchLabel}
            {property.addressScore ? ` · ${Math.round(property.addressScore)} score` : ""}
          </span>
        )}
      </label>
      <label>
        City
        <input value={property.city} onChange={(event) => onFieldChange("property", "city", event.target.value)} />
      </label>
      <label>
        State
        <input
          value={property.state}
          onChange={(event) => onFieldChange("property", "state", event.target.value.toUpperCase())}
        />
      </label>
      <label>
        ZIP
        <input
          value={property.postalCode}
          onChange={(event) => onFieldChange("property", "postalCode", event.target.value)}
        />
      </label>
      <label>
        Year built
        <input
          value={property.yearBuilt}
          onChange={(event) => onFieldChange("property", "yearBuilt", event.target.value)}
        />
      </label>
      <label>
        Sq ft
        <input
          value={property.squareFeet}
          onChange={(event) => onFieldChange("property", "squareFeet", event.target.value)}
        />
      </label>
      <label>
        Occupancy
        <select
          aria-label="Occupancy"
          value={property.occupancy}
          onChange={(event) => onFieldChange("property", "occupancy", event.target.value)}
        >
          <option value="occupied">Occupied</option>
          <option value="vacant">Vacant</option>
          <option value="unknown">Unknown</option>
        </select>
      </label>
      <label>
        Owner
        <input
          value={property.ownerName ?? ""}
          onChange={(event) => onFieldChange("property", "ownerName", event.target.value)}
        />
      </label>
      <label>
        County
        <input
          value={property.county ?? ""}
          onChange={(event) => onFieldChange("property", "county", event.target.value)}
        />
      </label>
      <label>
        Parcel ID
        <input
          value={property.parcelId ?? ""}
          onChange={(event) => onFieldChange("property", "parcelId", event.target.value)}
        />
      </label>
      <label>
        Tax account
        <input
          value={property.taxAccount ?? ""}
          onChange={(event) => onFieldChange("property", "taxAccount", event.target.value)}
        />
      </label>
      <label>
        Flood zone
        <input
          value={property.floodZone ?? ""}
          onChange={(event) => onFieldChange("property", "floodZone", event.target.value)}
        />
      </label>
      <label>
        SFHA
        <input
          value={property.sfha ?? ""}
          onChange={(event) => onFieldChange("property", "sfha", event.target.value)}
        />
      </label>
      <label>
        Property use
        <input
          value={property.propertyUse ?? ""}
          onChange={(event) => onFieldChange("property", "propertyUse", event.target.value)}
        />
      </label>
      <label>
        Inspector
        <input
          value={inspector.name}
          onChange={(event) => onFieldChange("inspector", "name", event.target.value)}
        />
      </label>
      <label>
        Company
        <input
          value={inspector.company}
          onChange={(event) => onFieldChange("inspector", "company", event.target.value)}
        />
      </label>
      <label>
        License
        <input
          value={inspector.license}
          onChange={(event) => onFieldChange("inspector", "license", event.target.value)}
        />
      </label>
      <label>
        Email
        <input
          type="email"
          value={inspector.email}
          onChange={(event) => onFieldChange("inspector", "email", event.target.value)}
        />
      </label>
      <label className="wide-field">
        Legal description
        <textarea
          aria-label="Legal description"
          value={property.legalDescription ?? ""}
          onChange={(event) => onFieldChange("property", "legalDescription", event.target.value)}
        />
      </label>
      <label className="wide-field">
        Report scope
        <textarea
          aria-label="Report scope"
          value={scope}
          onChange={(event) => onInspectionFieldChange("scope", event.target.value)}
        />
      </label>
    </div>
  );
}

function SystemChecklist({
  statePackSystems,
  activeSystemId,
  inspection,
  onSelect,
  onCheckpoint,
  onComplete
}: {
  statePackSystems: InspectionSystem[];
  activeSystemId: string;
  inspection: InspectionReport;
  onSelect: (systemId: string) => void;
  onCheckpoint: (checkpoint: string) => void;
  onComplete: () => void;
}) {
  const activeSystem = statePackSystems.find((system) => system.id === activeSystemId) ?? statePackSystems[0];
  const activeProgress = inspection.systems.find((progress) => progress.systemId === activeSystem.id);

  return (
    <section className="panel system-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">Inspection systems</span>
          <h2>Checklist</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onComplete}>
          <Check size={15} />
          Complete
        </button>
      </div>

      <div className="system-list">
        {statePackSystems.map((system) => {
          const progress = inspection.systems.find((item) => item.systemId === system.id);
          const complete = progress?.status === "complete";
          return (
            <button
              className={system.id === activeSystemId ? "system-row selected" : "system-row"}
              key={system.id}
              type="button"
              onClick={() => onSelect(system.id)}
            >
              <span className={complete ? "system-dot complete" : "system-dot"} />
              <span>{system.label}</span>
              <small>{progress?.completedCheckpoints.length ?? 0}/{system.checkpoints.length}</small>
            </button>
          );
        })}
      </div>

      <div className="checkpoint-list">
        <h3>{activeSystem.label} checkpoints</h3>
        {activeSystem.checkpoints.map((checkpoint) => {
          const checked = activeProgress?.completedCheckpoints.includes(checkpoint) ?? false;
          return (
            <label className="checkpoint" key={checkpoint}>
              <input type="checkbox" checked={checked} onChange={() => onCheckpoint(checkpoint)} />
              <span>{checkpoint}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function PhotoWorkspace({
  systemLabel,
  photos,
  allPhotos,
  selectedPhoto,
  photoSlots,
  activeSlotId,
  onSelectPhoto,
  onSelectPhotoSlot,
  onAddPhoto,
  onUpdatePhoto,
  onAssignPhotoToSlot,
  onAnalyzePhoto,
  onGenerateDraft,
  scanningPhotoId,
  scanError
}: {
  systemLabel: string;
  photos: PhotoEvidence[];
  allPhotos: PhotoEvidence[];
  selectedPhoto?: PhotoEvidence;
  photoSlots: PhotoSlot[];
  activeSlotId: string;
  onSelectPhoto: (photoId: string) => void;
  onSelectPhotoSlot: (slotId: string) => void;
  onAddPhoto: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUpdatePhoto: (photoId: string, patch: Pick<PhotoEvidence, "label" | "location">) => void;
  onAssignPhotoToSlot: (photoId: string, slotId: string) => void;
  onAnalyzePhoto: () => void;
  onGenerateDraft: () => void;
  scanningPhotoId: string;
  scanError: string;
}) {
  const selectedPhotoIsScanning = Boolean(selectedPhoto && scanningPhotoId === selectedPhoto.id);
  const activeSlot = photoSlots.find((slot) => slot.id === activeSlotId);

  return (
    <section className="panel photo-panel" id="photo-evidence-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">{systemLabel}</span>
          <h2>Photo evidence</h2>
        </div>
        <div className="button-pair">
          <button
            className="primary-button scan-button"
            type="button"
            disabled={!selectedPhoto || Boolean(scanningPhotoId)}
            onClick={onAnalyzePhoto}
          >
            <Sparkles size={15} />
            {selectedPhotoIsScanning ? "Scanning..." : "Scan photo"}
          </button>
          <button className="ghost-button" type="button" onClick={onGenerateDraft}>
            <Sparkles size={15} />
            Draft
          </button>
          <label className="ghost-button file-button">
            <ImagePlus size={15} />
            Add photo
            <input type="file" accept="image/*" capture="environment" onChange={onAddPhoto} />
          </label>
        </div>
      </div>

      <div className="photo-slot-strip" aria-label="Required report photo slots">
        {photoSlots.map((slot) => {
          const assignedPhoto = allPhotos.find((photo) => photo.slotId === slot.id);
          const active = slot.id === activeSlotId;
          return (
            <button
              className={active ? "photo-slot active" : assignedPhoto ? "photo-slot complete" : "photo-slot"}
              key={slot.id}
              type="button"
              onClick={() => onSelectPhotoSlot(slot.id)}
            >
              <span>{slot.label}</span>
              <small>{assignedPhoto ? "photo assigned" : `${slot.formUse} required`}</small>
            </button>
          );
        })}
      </div>

      {selectedPhoto && (
        <div className="selected-photo">
          <img src={selectedPhoto.url} alt={selectedPhoto.label} />
          <div>
            <div className="photo-meta-form">
              <label>
                Photo label
                <input
                  value={selectedPhoto.label}
                  onChange={(event) =>
                    onUpdatePhoto(selectedPhoto.id, { label: event.target.value, location: selectedPhoto.location })
                  }
                />
              </label>
              <label>
                Location
                <input
                  value={selectedPhoto.location}
                  onChange={(event) =>
                    onUpdatePhoto(selectedPhoto.id, { label: selectedPhoto.label, location: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="tag-row">
              {selectedPhoto.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            {activeSlot && selectedPhoto.slotId !== activeSlot.id && (
              <button
                className="ghost-button assign-slot-button"
                type="button"
                onClick={() => onAssignPhotoToSlot(selectedPhoto.id, activeSlot.id)}
              >
                <Check size={15} />
                Use this photo for {activeSlot.label}
              </button>
            )}
            {selectedPhoto.analysis ? (
              <div className="scan-result" aria-label="Image scan result">
                <div className="scan-result-header">
                  <div>
                    <span>Image scan detected</span>
                    <strong>{selectedPhoto.analysis.detectedIssue}</strong>
                  </div>
                  <span className={`scan-severity ${selectedPhoto.analysis.severity}`}>
                    {severityLabels[selectedPhoto.analysis.severity]}
                  </span>
                </div>
                <p>{selectedPhoto.analysis.summary}</p>
                <div className="scan-metrics">
                  <span>{Math.round(selectedPhoto.analysis.confidence * 100)}% confidence</span>
                  <span>{Math.round(selectedPhoto.analysis.metrics.edgeDensity * 100)}% edge density</span>
                  <span>{Math.round(selectedPhoto.analysis.metrics.contrast * 100)}% contrast</span>
                </div>
                <div className="scan-signal-row">
                  {selectedPhoto.analysis.visualSignals.slice(0, 5).map((signal) => (
                    <span key={signal}>{signal}</span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="scan-placeholder">
                <Sparkles size={15} />
                Scan this photo to identify visible inspection issues and generate a review draft.
              </div>
            )}
            {scanError && <div className="scan-error">{scanError}</div>}
          </div>
        </div>
      )}

      {photos.length === 0 && (
        <div className="photo-empty">
          <ImagePlus size={22} />
          <strong>No photo evidence yet</strong>
          <span>Add a photo to attach field evidence to drafts and findings.</span>
        </div>
      )}

      <div className="photo-grid">
        {photos.map((photo) => (
          <button
            className={photo.id === selectedPhoto?.id ? "photo-card selected" : "photo-card"}
            key={photo.id}
            type="button"
            onClick={() => onSelectPhoto(photo.id)}
          >
            <img src={photo.url} alt="" />
            <span>{photo.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ReviewPanel({
  statePackName,
  readiness,
  inspectionStatus,
  signedAt,
  signatureName,
  suggestions,
  fieldSuggestions,
  findings,
  findingDraft,
  setFindingDraft,
  reportSummary,
  onSuggestionAction,
  onFieldSuggestionAction,
  onAddFinding,
  onDeleteFinding,
  onSignatureNameChange,
  onFinalize
}: {
  statePackName: string;
  readiness: ReturnType<typeof calculateReportReadiness>;
  inspectionStatus: InspectionReport["status"];
  signedAt?: string;
  signatureName: string;
  suggestions: AiSuggestion[];
  fieldSuggestions: FieldSuggestion[];
  findings: InspectionReport["findings"];
  findingDraft: typeof blankFinding;
  setFindingDraft: Dispatch<SetStateAction<typeof blankFinding>>;
  reportSummary: string;
  onSuggestionAction: (suggestion: AiSuggestion, action: "approve" | "edit" | "reject") => void;
  onFieldSuggestionAction: (suggestion: FieldSuggestion, action: "approve" | "edit" | "reject") => void;
  onAddFinding: () => void;
  onDeleteFinding: (findingId: string) => void;
  onSignatureNameChange: (value: string) => void;
  onFinalize: () => void;
}) {
  const finalized = inspectionStatus === "finalized";
  const canFinalize = readiness.ready && signatureName.trim().length > 0;

  return (
    <section className="panel review-panel" id="review-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">{statePackName}</span>
          <h2>Inspector review</h2>
        </div>
        <Sparkles size={20} className="spark-icon" />
      </div>

      <div className="readiness-box">
        <div>
          <strong>{readiness.ready ? "Export unlocked" : "Blocked before final export"}</strong>
          <span>
            {readiness.unreviewedSuggestions} AI draft{readiness.unreviewedSuggestions === 1 ? "" : "s"} and{" "}
            {readiness.unreviewedFieldSuggestions} field suggestion
            {readiness.unreviewedFieldSuggestions === 1 ? "" : "s"} still need review
          </span>
        </div>
        <div className="readiness-percent">{readiness.completionPercent}%</div>
      </div>

      <div className="issue-list">
        {readiness.missingRequiredSystems.map((system) => (
          <span className="issue warn" key={system}>
            {system} incomplete
          </span>
        ))}
        {readiness.missingRequiredFields.map((field) => (
          <span className="issue warn" key={field}>
            {field} missing
          </span>
        ))}
        {readiness.safetyFindings > 0 && <span className="issue danger">{readiness.safetyFindings} safety finding</span>}
      </div>

      <div className="finding-form">
        <h3>Add inspector finding</h3>
        <input
          placeholder="Finding title"
          value={findingDraft.title}
          onChange={(event) => setFindingDraft((current) => ({ ...current, title: event.target.value }))}
        />
        <textarea
          placeholder="Narrative / observed condition"
          value={findingDraft.narrative}
          onChange={(event) => setFindingDraft((current) => ({ ...current, narrative: event.target.value }))}
        />
        <textarea
          placeholder="Recommendation"
          value={findingDraft.recommendation}
          onChange={(event) => setFindingDraft((current) => ({ ...current, recommendation: event.target.value }))}
        />
        <div className="form-row">
          <select
            value={findingDraft.severity}
            onChange={(event) => setFindingDraft((current) => ({ ...current, severity: event.target.value as Severity }))}
          >
            {Object.entries(severityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="primary-button" type="button" onClick={onAddFinding}>
            <Plus size={15} />
            Add
          </button>
        </div>
      </div>

      <div className="suggestion-list">
        <h3>AI draft queue</h3>
        {suggestions.length === 0 && <p className="empty-state">Click Draft in the photo panel to generate a review item.</p>}
        {suggestions.map((suggestion) => (
          <article className="suggestion-card" key={suggestion.id}>
            <div className="suggestion-title">
              <strong>{suggestion.title}</strong>
              <span>{Math.round(suggestion.confidence * 100)}%</span>
            </div>
            {suggestion.sourcePhotoLabel && (
              <div className="suggestion-source">
                Image scan source: {suggestion.sourcePhotoLabel}
                {suggestion.severity ? ` · ${severityLabels[suggestion.severity]}` : ""}
              </div>
            )}
            <p>{suggestion.draft}</p>
            {suggestion.visualSignals && suggestion.visualSignals.length > 0 && (
              <div className="scan-signal-row compact">
                {suggestion.visualSignals.slice(0, 4).map((signal) => (
                  <span key={signal}>{signal}</span>
                ))}
              </div>
            )}
            {suggestion.recommendation && (
              <p className="recommendation-text">
                <strong>Recommendation:</strong> {suggestion.recommendation}
              </p>
            )}
            <div className="suggestion-footer">
              <span className={`review-chip ${suggestion.reviewState}`}>{suggestion.reviewState.replace("_", " ")}</span>
              <div>
                <button type="button" title="Approve" onClick={() => onSuggestionAction(suggestion, "approve")}>
                  <Check size={14} />
                </button>
                <button type="button" title="Mark edited" onClick={() => onSuggestionAction(suggestion, "edit")}>
                  <FileCheck2 size={14} />
                </button>
                <button type="button" title="Reject" onClick={() => onSuggestionAction(suggestion, "reject")}>
                  <X size={14} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="suggestion-list field-suggestion-list">
        <h3>Field suggestion queue</h3>
        {fieldSuggestions.length === 0 && (
          <p className="empty-state">Scan a photo to create official-form field suggestions.</p>
        )}
        {fieldSuggestions.map((suggestion) => (
          <article className="suggestion-card" key={suggestion.id}>
            <div className="suggestion-title">
              <strong>{suggestion.label}</strong>
              <span>{Math.round(suggestion.confidence * 100)}%</span>
            </div>
            <div className="suggestion-source">
              {suggestion.source.replace("_", " ")} · {suggestion.fieldId}
            </div>
            <p>{suggestion.value}</p>
            <div className="suggestion-footer">
              <span className={`review-chip ${suggestion.reviewState}`}>{suggestion.reviewState.replace("_", " ")}</span>
              <div>
                <button type="button" title="Approve field" onClick={() => onFieldSuggestionAction(suggestion, "approve")}>
                  <Check size={14} />
                </button>
                <button type="button" title="Mark edited" onClick={() => onFieldSuggestionAction(suggestion, "edit")}>
                  <FileCheck2 size={14} />
                </button>
                <button type="button" title="Reject field" onClick={() => onFieldSuggestionAction(suggestion, "reject")}>
                  <X size={14} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="finding-list">
        <h3>Approved findings</h3>
        {findings.length === 0 && <p className="empty-state">Approve a draft or add an inspector finding.</p>}
        {findings.map((finding) => (
          <article className={`finding-card ${finding.severity}`} key={finding.id}>
            <div>
              <strong>{finding.title}</strong>
              <span>{severityLabels[finding.severity]}</span>
            </div>
            <p>{finding.recommendation}</p>
            <button className="icon-text-button" type="button" onClick={() => onDeleteFinding(finding.id)}>
              <Trash2 size={13} />
              Remove
            </button>
          </article>
        ))}
      </div>

      <details className="report-summary">
        <summary>Report summary text</summary>
        <pre>{reportSummary}</pre>
      </details>

      <div className={finalized ? "signoff-box finalized" : "signoff-box"}>
        <div>
          <h3>Inspector signoff</h3>
          <p>
            {finalized && signedAt
              ? `Finalized by ${signatureName} at ${new Date(signedAt).toLocaleString()}`
              : "Type the inspector name after review gates are clear."}
          </p>
        </div>
        <input
          placeholder="Inspector signature name"
          value={signatureName}
          onChange={(event) => onSignatureNameChange(event.target.value)}
        />
        <button className="primary-button" type="button" disabled={!canFinalize} onClick={onFinalize}>
          <PenLine size={15} />
          {finalized ? "Finalized" : "Finalize inspection"}
        </button>
      </div>

      {!readiness.ready && (
        <div className="export-blocker">
          <XCircle size={16} />
          Final export remains locked until required systems and AI review are complete.
        </div>
      )}
    </section>
  );
}

function ReportDrawer({
  inspection,
  readiness,
  reportSummary,
  statePack,
  onClose,
  onPrint,
  onDownloadJson,
  onDownloadReportHtml,
  onDownloadFourPoint,
  onDownloadWindMitigation,
  officialFormStatus,
  reportEmailHref,
  reviewRequestHref
}: {
  inspection: InspectionReport;
  readiness: ReturnType<typeof calculateReportReadiness>;
  reportSummary: string;
  statePack: typeof statePacks[number];
  onClose: () => void;
  onPrint: () => void;
  onDownloadJson: () => void;
  onDownloadReportHtml: () => void;
  onDownloadFourPoint: () => void;
  onDownloadWindMitigation: () => void;
  officialFormStatus: string;
  reportEmailHref: string;
  reviewRequestHref: string;
}) {
  return (
    <aside className="report-drawer" aria-label="Report preview">
      <div className="report-panel">
        <div className="report-header">
          <div>
            <span className="panel-kicker">Report preview</span>
            <h2>{inspection.property.address || "Untitled inspection"}</h2>
          </div>
          <button className="suggestion-footer-button" type="button" onClick={onClose} aria-label="Close report">
            <X size={18} />
          </button>
        </div>
        <div className={readiness.ready ? "report-state ready" : "report-state review"}>
          {readiness.ready ? "Ready for inspector export" : "Inspector review required before final export"}
        </div>
        <pre className="report-pre">{reportSummary}</pre>
        <section className="report-section report-facts">
          <h3>Booking intake</h3>
          <dl>
            <div>
              <dt>Client</dt>
              <dd>{inspection.request.clientName || "Not set"}</dd>
            </div>
            <div>
              <dt>Insured</dt>
              <dd>{inspection.request.insuredName || "Not set"}</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>
                {inspection.request.phone || "No phone"} · {inspection.request.email || "No email"}
              </dd>
            </div>
            <div>
              <dt>Type / price</dt>
              <dd>
                {labelInspectionType(inspection.request.inspectionType)} · {inspection.request.price || "No price"}
              </dd>
            </div>
            <div>
              <dt>Appointment</dt>
              <dd>{inspection.request.appointmentStart || "Not scheduled"}</dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>{inspection.request.paymentStatus.replace("_", " ")}</dd>
            </div>
          </dl>
        </section>
        <section className="report-section report-facts">
          <h3>Inspection details</h3>
          <dl>
            <div>
              <dt>Date</dt>
              <dd>{inspection.inspectionDate || "Not set"}</dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>{inspection.scope || "Not set"}</dd>
            </div>
            <div>
              <dt>Inspector</dt>
              <dd>{inspection.inspector.name || "Not set"}</dd>
            </div>
            <div>
              <dt>Company</dt>
              <dd>{inspection.inspector.company || "Not set"}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{inspection.property.ownerName || "Not populated"}</dd>
            </div>
            <div>
              <dt>County</dt>
              <dd>{inspection.property.county || "Not populated"}</dd>
            </div>
            <div>
              <dt>Parcel</dt>
              <dd>{inspection.property.parcelId || "Not populated"}</dd>
            </div>
            <div>
              <dt>Flood zone</dt>
              <dd>{inspection.property.floodZone || "Not populated"}</dd>
            </div>
          </dl>
        </section>
        <section className="report-section">
          <h3>Findings</h3>
          {inspection.findings.length === 0 && <p>No approved findings yet.</p>}
          {inspection.findings.map((finding) => (
            <article key={finding.id}>
              <strong>{finding.title}</strong>
              <p>{finding.narrative}</p>
              <p>{finding.recommendation}</p>
            </article>
          ))}
        </section>
        <section className="report-section">
          <h3>Photo evidence</h3>
          <div className="report-photo-grid">
            {inspection.photos.length === 0 && <p>No photo evidence attached yet.</p>}
            {inspection.photos.map((photo) => (
              <figure key={photo.id}>
                <img src={photo.url} alt={photo.label} />
                <figcaption>
                  {photo.label}
                  {photo.analysis ? ` · Scan: ${photo.analysis.detectedIssue}` : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
        <section className="report-section">
          <h3>Image scan evidence</h3>
          {inspection.photos.filter((photo) => photo.analysis).length === 0 && <p>No completed image scans yet.</p>}
          {inspection.photos
            .filter((photo) => photo.analysis)
            .map((photo) => (
              <article key={`${photo.id}-scan`}>
                <strong>{photo.analysis?.detectedIssue}</strong>
                <p>
                  {photo.label} · {photo.location} ·{" "}
                  {Math.round((photo.analysis?.confidence ?? 0) * 100)}% confidence ·{" "}
                  {photo.analysis ? severityLabels[photo.analysis.severity] : "Review"}
                </p>
                <p>{photo.analysis?.summary}</p>
              </article>
            ))}
        </section>
        <section className="report-section">
          <h3>Public records research</h3>
          <p>
            Status: {inspection.researchPacket?.status ?? "Not run"}
            {inspection.researchPacket?.normalizedAddress
              ? ` · Matched ${inspection.researchPacket.normalizedAddress}`
              : ""}
          </p>
          {inspection.property.legalDescription && (
            <p>
              <strong>Legal:</strong> {inspection.property.legalDescription}
            </p>
          )}
          <div className="source-list compact">
            {(inspection.researchPacket?.sources ?? buildPropertyResearchLinks(inspection.property)).map((source) => (
              <a href={source.url} target="_blank" rel="noreferrer" className="source-link" key={source.id}>
                <span>
                  <strong>{source.title}</strong>
                  <small>{source.detail}</small>
                </span>
                <span className={`source-status ${source.status}`}>{source.status.replace("_", " ")}</span>
                <ExternalLink size={14} />
              </a>
            ))}
          </div>
        </section>
        <section className="report-section">
          <h3>Selected permits</h3>
          {inspection.permitCandidates.filter((permit) => permit.status === "selected").length === 0 && (
            <p>No permits selected for import yet.</p>
          )}
          {inspection.permitCandidates
            .filter((permit) => permit.status === "selected")
            .map((permit) => (
              <article key={permit.id}>
                <strong>{permit.title}</strong>
                <p>
                  {permit.permitNumber || "No permit number"} · issued {permit.issuedDate || "unknown"} · final{" "}
                  {permit.finalDate || "unknown"}
                </p>
                <p>{permit.notes}</p>
              </article>
            ))}
        </section>
        <section className="report-section report-facts">
          <h3>Official form field values</h3>
          <dl>
            {Object.entries(inspection.officialFields).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
                <dd>{value || "Blank"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="report-section">
          <h3>Compliance notes</h3>
          <ul className="compact-list">
            {statePack.disclaimers.map((disclaimer) => (
              <li key={disclaimer}>{disclaimer}</li>
            ))}
          </ul>
        </section>
        <section className="report-section official-form-section">
          <h3>Official state/carrier forms</h3>
          <p>
            These exports use the supplied blank 4-Point 2025 PDF and OIR-B1-1802 Rev. 04/26 Wind
            Mitigation PDF as the actual output templates. Fields the app does not capture yet are
            left blank or marked for inspector verification instead of being guessed.
          </p>
          <div className="official-form-actions">
            <button className="ghost-button" type="button" onClick={onDownloadFourPoint}>
              <FileDown size={15} />
              Download 4-Point PDF
            </button>
            <button className="ghost-button" type="button" onClick={onDownloadWindMitigation}>
              <FileDown size={15} />
              Download Wind Mitigation PDF
            </button>
          </div>
          {officialFormStatus && <p className="official-form-status">{officialFormStatus}</p>}
        </section>
        <section className="report-section">
          <h3>Audit trail</h3>
          <dl className="audit-list">
            <div>
              <dt>Inspection ID</dt>
              <dd>{inspection.id}</dd>
            </div>
            <div>
              <dt>Signed at</dt>
              <dd>{inspection.signedAt ? new Date(inspection.signedAt).toLocaleString() : "Pending"}</dd>
            </div>
            <div>
              <dt>Exported at</dt>
              <dd>{inspection.exportedAt ? new Date(inspection.exportedAt).toLocaleString() : "Pending"}</dd>
            </div>
          </dl>
        </section>
        <div className="report-actions">
          <a className="ghost-button anchor-button" href={reportEmailHref}>
            <Mail size={15} />
            Email report
          </a>
          <a className="ghost-button anchor-button" href={reviewRequestHref}>
            <Mail size={15} />
            Review request
          </a>
          <button className="ghost-button" type="button" onClick={onDownloadJson}>
            <Download size={15} />
            Download record
          </button>
          <button className="ghost-button" type="button" onClick={onDownloadReportHtml}>
            <FileDown size={15} />
            Download report
          </button>
          <button className="primary-button" type="button" onClick={onPrint}>
            <FileCheck2 size={15} />
            Print / PDF
          </button>
        </div>
      </div>
    </aside>
  );
}

function ComplianceDrawer({
  statePack,
  onClose
}: {
  statePack: typeof statePacks[number];
  onClose: () => void;
}) {
  return (
    <aside className="report-drawer" aria-label="Compliance pack details">
      <div className="report-panel">
        <div className="report-header">
          <div>
            <span className="panel-kicker">Compliance pack</span>
            <h2>{statePack.name}</h2>
          </div>
          <button className="suggestion-footer-button" type="button" onClick={onClose} aria-label="Close compliance pack">
            <X size={18} />
          </button>
        </div>
        <div className={statePack.status === "production_review" ? "report-state review" : "report-state"}>
          {statePack.state} · {statePack.version} · Effective {statePack.effectiveDate}
        </div>
        <section className="report-section">
          <h3>Forms and required fields</h3>
          <div className="compliance-list">
            {statePack.forms.map((form) => (
              <article key={form.id}>
                <strong>{form.title}</strong>
                <p>{form.description}</p>
                <ul className="field-list">
                  {form.fields.map((field) => (
                    <li key={field.id}>
                      <span>{field.label}</span>
                      <small>{field.required ? "Required" : "Optional"} · {field.type}</small>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
        <section className="report-section">
          <h3>Pack disclaimers</h3>
          <ul className="compact-list">
            {statePack.disclaimers.map((disclaimer) => (
              <li key={disclaimer}>{disclaimer}</li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}

function loadSavedInspection(): InspectionReport {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return normalizeInspection(seedInspection);
  }

  try {
    return normalizeInspection(JSON.parse(saved) as InspectionReport);
  } catch {
    return normalizeInspection(seedInspection);
  }
}

function cloneInspection(inspection: InspectionReport): InspectionReport {
  return JSON.parse(JSON.stringify(inspection)) as InspectionReport;
}

function clearedPublicRecordPropertyFields() {
  return {
    ownerName: "",
    county: "",
    parcelId: "",
    taxAccount: "",
    legalDescription: "",
    propertyUse: "",
    floodZone: "",
    sfha: "",
    latitude: undefined,
    longitude: undefined,
    addressMatchLabel: "",
    addressSource: "",
    addressScore: undefined
  };
}

function normalizeInspection(inspection: InspectionReport): InspectionReport {
  const cloned = cloneInspection(inspection);
  const property = {
    ...cloned.property,
    address: cloned.property.address ?? "",
    city: cloned.property.city ?? "",
    state: cloned.property.state ?? "FL",
    postalCode: cloned.property.postalCode ?? "",
    yearBuilt: cloned.property.yearBuilt ?? "",
    squareFeet: cloned.property.squareFeet ?? "",
    occupancy: cloned.property.occupancy ?? "unknown",
    ownerName: cloned.property.ownerName ?? "",
    county: cloned.property.county ?? "",
    parcelId: cloned.property.parcelId ?? "",
    taxAccount: cloned.property.taxAccount ?? "",
    legalDescription: cloned.property.legalDescription ?? "",
    propertyUse: cloned.property.propertyUse ?? "",
    floodZone: cloned.property.floodZone ?? "",
    sfha: cloned.property.sfha ?? "",
    latitude: cloned.property.latitude,
    longitude: cloned.property.longitude,
    addressMatchLabel: cloned.property.addressMatchLabel ?? "",
    addressSource: cloned.property.addressSource ?? "",
    addressScore: cloned.property.addressScore
  };

  return {
    ...cloned,
    request: {
      ...defaultInspectionRequest,
      ...(cloned.request ?? {})
    },
    property,
    officialFields: {
      ...defaultOfficialFields,
      ...(cloned.officialFields ?? {})
    },
    fieldSuggestions: cloned.fieldSuggestions ?? [],
    permitCandidates: cloned.permitCandidates ?? cloned.researchPacket?.permitCandidates ?? [],
    photos: (cloned.photos ?? []).map((photo) => ({
      ...photo,
      tags: photo.tags ?? []
    })),
    inspectionDate: cloned.inspectionDate || new Date().toISOString().slice(0, 10),
    scope:
      cloned.scope ||
      "General visual home inspection of readily accessible systems and components with photo evidence and inspector review.",
    signatureName: cloned.signatureName ?? ""
  };
}

function createBlankInspection(systems: InspectionSystem[], statePackId: string): InspectionReport {
  return {
    id: `inspection-${Date.now()}`,
    statePackId,
    status: "draft",
    request: {
      ...defaultInspectionRequest,
      appointmentStart: new Date().toISOString().slice(0, 16)
    },
    inspectionDate: new Date().toISOString().slice(0, 10),
    scope:
      "General visual home inspection of readily accessible systems and components with photo evidence and inspector review.",
    property: {
      address: "",
      city: "",
      state: "FL",
      postalCode: "",
      yearBuilt: "",
      squareFeet: "",
      occupancy: "unknown",
      ownerName: "",
      county: "",
      parcelId: "",
      taxAccount: "",
      legalDescription: "",
      propertyUse: "",
      floodZone: "",
      sfha: "",
      latitude: undefined,
      longitude: undefined,
      addressMatchLabel: "",
      addressSource: "",
      addressScore: undefined
    },
    inspector: {
      name: "Beth York",
      company: "York Home Inspections",
      license: "FL-HI-REVIEW",
      email: "inspections@yorkinspections.com"
    },
    officialFields: { ...defaultOfficialFields },
    systems: systems.map((system) => ({ systemId: system.id, status: "not_started", completedCheckpoints: [] })),
    photos: [],
    findings: [],
    aiSuggestions: [],
    fieldSuggestions: [],
    permitCandidates: [],
    signatureName: ""
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
