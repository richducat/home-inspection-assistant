import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardList,
  FileDown,
  Download,
  FileCheck2,
  Home,
  ImagePlus,
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
import type {
  AiSuggestion,
  Finding,
  InspectionReport,
  InspectionSystem,
  PhotoEvidence,
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

const STORAGE_KEY = "home-inspection-assistant:v2";

type NavTarget = "workspace" | "photos" | "reports" | "compliance";
type InspectionField = "inspectionDate" | "scope" | "signatureName";

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
  const [selectedPhotoId, setSelectedPhotoId] = useState(inspection.photos[0]?.id ?? "");
  const [selectedPackId, setSelectedPackId] = useState(inspection.statePackId);
  const [findingDraft, setFindingDraft] = useState(blankFinding);
  const [reportOpen, setReportOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<NavTarget>("workspace");
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
  const activeFindings = inspection.findings.filter((finding) => finding.systemId === activeSystem.id);
  const reportSummary = buildReportSummary(inspection, statePack, readiness);

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
    const nextSystemPhoto = inspection.photos.find((photo) => photo.systemId === systemId);
    setSelectedPhotoId(nextSystemPhoto?.id ?? inspection.photos[0]?.id ?? "");
  }

  async function handleAddPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    const nextPhoto: PhotoEvidence = {
      id: `photo-${Date.now()}`,
      url: dataUrl,
      label: file.name.replace(/\.[^.]+$/, ""),
      systemId: activeSystem.id,
      location: "Field capture",
      capturedAt: new Date().toISOString(),
      tags: [activeSystem.id, "uploaded"],
      uploaded: true
    };

    setInspection((current) => ({ ...current, photos: [nextPhoto, ...current.photos] }));
    setSelectedPhotoId(nextPhoto.id);
    event.target.value = "";
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
      [scope]: {
        ...current[scope],
        [field]: value
      }
    }));
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
          <ProfileEditor
            inspectionDate={inspection.inspectionDate}
            scope={inspection.scope}
            property={inspection.property}
            inspector={inspection.inspector}
            onFieldChange={handleFieldChange}
            onInspectionFieldChange={handleInspectionFieldChange}
          />
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
            selectedPhoto={selectedPhoto}
            onSelectPhoto={setSelectedPhotoId}
            onAddPhoto={handleAddPhoto}
            onUpdatePhoto={handlePhotoChange}
            onGenerateDraft={handleGenerateDraft}
          />
          <ReviewPanel
            statePackName={statePack.name}
            readiness={readiness}
            inspectionStatus={inspection.status}
            signedAt={inspection.signedAt}
            signatureName={inspection.signatureName ?? ""}
            suggestions={activeSuggestions}
            findings={activeFindings}
            findingDraft={findingDraft}
            setFindingDraft={setFindingDraft}
            reportSummary={reportSummary}
            onSuggestionAction={handleSuggestionAction}
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

function ProfileEditor({
  inspectionDate,
  scope,
  property,
  inspector,
  onFieldChange,
  onInspectionFieldChange
}: {
  inspectionDate: string;
  scope: string;
  property: PropertyProfile;
  inspector: InspectionReport["inspector"];
  onFieldChange: (scope: "property" | "inspector", field: string, value: string) => void;
  onInspectionFieldChange: (field: InspectionField, value: string) => void;
}) {
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
      <label>
        Property address
        <input
          value={property.address}
          onChange={(event) => onFieldChange("property", "address", event.target.value)}
        />
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
  selectedPhoto,
  onSelectPhoto,
  onAddPhoto,
  onUpdatePhoto,
  onGenerateDraft
}: {
  systemLabel: string;
  photos: PhotoEvidence[];
  selectedPhoto?: PhotoEvidence;
  onSelectPhoto: (photoId: string) => void;
  onAddPhoto: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUpdatePhoto: (photoId: string, patch: Pick<PhotoEvidence, "label" | "location">) => void;
  onGenerateDraft: () => void;
}) {
  return (
    <section className="panel photo-panel" id="photo-evidence-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">{systemLabel}</span>
          <h2>Photo evidence</h2>
        </div>
        <div className="button-pair">
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
  findings,
  findingDraft,
  setFindingDraft,
  reportSummary,
  onSuggestionAction,
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
  findings: InspectionReport["findings"];
  findingDraft: typeof blankFinding;
  setFindingDraft: Dispatch<SetStateAction<typeof blankFinding>>;
  reportSummary: string;
  onSuggestionAction: (suggestion: AiSuggestion, action: "approve" | "edit" | "reject") => void;
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
          <span>{readiness.unreviewedSuggestions} AI suggestions still need review</span>
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
            <p>{suggestion.draft}</p>
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
  onDownloadReportHtml
}: {
  inspection: InspectionReport;
  readiness: ReturnType<typeof calculateReportReadiness>;
  reportSummary: string;
  statePack: typeof statePacks[number];
  onClose: () => void;
  onPrint: () => void;
  onDownloadJson: () => void;
  onDownloadReportHtml: () => void;
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
                <figcaption>{photo.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>
        <section className="report-section">
          <h3>Compliance notes</h3>
          <ul className="compact-list">
            {statePack.disclaimers.map((disclaimer) => (
              <li key={disclaimer}>{disclaimer}</li>
            ))}
          </ul>
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

function normalizeInspection(inspection: InspectionReport): InspectionReport {
  const cloned = cloneInspection(inspection);
  return {
    ...cloned,
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
      occupancy: "unknown"
    },
    inspector: {
      name: "",
      company: "",
      license: "",
      email: ""
    },
    systems: systems.map((system) => ({ systemId: system.id, status: "not_started", completedCheckpoints: [] })),
    photos: [],
    findings: [],
    aiSuggestions: [],
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
