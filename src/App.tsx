import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  FileCheck2,
  Home,
  ImagePlus,
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
import { buildReportSummary } from "./domain/report";

const STORAGE_KEY = "home-inspection-assistant:v2";

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

  function handleFieldChange(scope: "property" | "inspector", field: string, value: string) {
    setInspection((current) => ({
      ...current,
      [scope]: {
        ...current[scope],
        [field]: value
      }
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

  return (
    <main className="app-shell">
      <Sidebar
        selectedPackId={selectedPackId}
        onPackChange={handlePackChange}
        completionPercent={readiness.completionPercent}
        lastSavedAt={lastSavedAt}
        onNewInspection={handleNewInspection}
        onReset={handleReset}
      />
      <section className="workspace">
        <Header
          inspection={inspection}
          readiness={readiness}
          onExport={() => setReportOpen(true)}
          onDownloadJson={handleDownloadJson}
        />
        <section className="edit-band" aria-label="Inspection setup">
          <ProfileEditor
            property={inspection.property}
            inspector={inspection.inspector}
            onFieldChange={handleFieldChange}
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
            onGenerateDraft={handleGenerateDraft}
          />
          <ReviewPanel
            statePackName={statePack.name}
            readiness={readiness}
            suggestions={activeSuggestions}
            findings={activeFindings}
            findingDraft={findingDraft}
            setFindingDraft={setFindingDraft}
            reportSummary={reportSummary}
            onSuggestionAction={handleSuggestionAction}
            onAddFinding={handleAddFinding}
            onDeleteFinding={handleDeleteFinding}
          />
        </div>
      </section>

      {reportOpen && (
        <ReportDrawer
          inspection={inspection}
          readiness={readiness}
          reportSummary={reportSummary}
          onClose={() => setReportOpen(false)}
          onPrint={() => window.print()}
          onDownloadJson={handleDownloadJson}
        />
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
  onReset
}: {
  selectedPackId: string;
  onPackChange: (packId: string) => void;
  completionPercent: number;
  lastSavedAt: string;
  onNewInspection: () => void;
  onReset: () => void;
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
        <button className="nav-item active" type="button">
          <ClipboardList size={17} />
          Inspection Workspace
        </button>
        <button className="nav-item" type="button">
          <ImagePlus size={17} />
          Photo Evidence
        </button>
        <button className="nav-item" type="button">
          <FileCheck2 size={17} />
          Report Exports
        </button>
        <button className="nav-item" type="button">
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
  property,
  inspector,
  onFieldChange
}: {
  property: PropertyProfile;
  inspector: InspectionReport["inspector"];
  onFieldChange: (scope: "property" | "inspector", field: string, value: string) => void;
}) {
  return (
    <div className="profile-grid">
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
        ZIP
        <input
          value={property.postalCode}
          onChange={(event) => onFieldChange("property", "postalCode", event.target.value)}
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
        License
        <input
          value={inspector.license}
          onChange={(event) => onFieldChange("inspector", "license", event.target.value)}
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
  onGenerateDraft
}: {
  systemLabel: string;
  photos: PhotoEvidence[];
  selectedPhoto?: PhotoEvidence;
  onSelectPhoto: (photoId: string) => void;
  onAddPhoto: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGenerateDraft: () => void;
}) {
  return (
    <section className="panel photo-panel">
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
            <input type="file" accept="image/*" onChange={onAddPhoto} />
          </label>
        </div>
      </div>

      {selectedPhoto && (
        <div className="selected-photo">
          <img src={selectedPhoto.url} alt={selectedPhoto.label} />
          <div>
            <strong>{selectedPhoto.label}</strong>
            <span>{selectedPhoto.location}</span>
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
  suggestions,
  findings,
  findingDraft,
  setFindingDraft,
  reportSummary,
  onSuggestionAction,
  onAddFinding,
  onDeleteFinding
}: {
  statePackName: string;
  readiness: ReturnType<typeof calculateReportReadiness>;
  suggestions: AiSuggestion[];
  findings: InspectionReport["findings"];
  findingDraft: typeof blankFinding;
  setFindingDraft: Dispatch<SetStateAction<typeof blankFinding>>;
  reportSummary: string;
  onSuggestionAction: (suggestion: AiSuggestion, action: "approve" | "edit" | "reject") => void;
  onAddFinding: () => void;
  onDeleteFinding: (findingId: string) => void;
}) {
  return (
    <section className="panel review-panel">
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
  onClose,
  onPrint,
  onDownloadJson
}: {
  inspection: InspectionReport;
  readiness: ReturnType<typeof calculateReportReadiness>;
  reportSummary: string;
  onClose: () => void;
  onPrint: () => void;
  onDownloadJson: () => void;
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
        <section className="report-section">
          <h3>Findings</h3>
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
            {inspection.photos.map((photo) => (
              <figure key={photo.id}>
                <img src={photo.url} alt={photo.label} />
                <figcaption>{photo.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>
        <div className="report-actions">
          <button className="ghost-button" type="button" onClick={onDownloadJson}>
            <Download size={15} />
            Download record
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

function loadSavedInspection(): InspectionReport {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return cloneInspection(seedInspection);
  }

  try {
    return JSON.parse(saved) as InspectionReport;
  } catch {
    return cloneInspection(seedInspection);
  }
}

function cloneInspection(inspection: InspectionReport): InspectionReport {
  return JSON.parse(JSON.stringify(inspection)) as InspectionReport;
}

function createBlankInspection(systems: InspectionSystem[], statePackId: string): InspectionReport {
  return {
    id: `inspection-${Date.now()}`,
    statePackId,
    status: "draft",
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
    aiSuggestions: []
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
