import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  FileCheck2,
  Home,
  ImagePlus,
  ShieldCheck,
  Sparkles,
  X,
  XCircle
} from "lucide-react";
import { statePacks } from "./domain/statePacks";
import { seedInspection } from "./domain/seed";
import type { AiSuggestion, InspectionReport, PhotoEvidence, Severity } from "./domain/types";
import {
  approveSuggestionAsFinding,
  calculateReportReadiness,
  markCheckpointComplete,
  markSystemComplete,
  updateSuggestionState
} from "./domain/inspectionLogic";
import { buildPrintableReportHtml, buildReportSummary } from "./domain/report";

const severityLabels: Record<Severity, string> = {
  maintenance: "Maintenance",
  monitor: "Monitor",
  repair: "Repair",
  safety: "Safety"
};

export function App() {
  const [inspection, setInspection] = useState<InspectionReport>(seedInspection);
  const [activeSystemId, setActiveSystemId] = useState("roof");
  const [selectedPhotoId, setSelectedPhotoId] = useState(seedInspection.photos[0]?.id ?? "");
  const [selectedPackId, setSelectedPackId] = useState(seedInspection.statePackId);

  const statePack = useMemo(
    () => statePacks.find((pack) => pack.id === selectedPackId) ?? statePacks[0],
    [selectedPackId]
  );

  const readiness = useMemo(
    () => calculateReportReadiness({ ...inspection, statePackId: statePack.id }, statePack),
    [inspection, statePack]
  );

  const activeSystem = statePack.systems.find((system) => system.id === activeSystemId) ?? statePack.systems[0];
  const selectedPhoto = inspection.photos.find((photo) => photo.id === selectedPhotoId) ?? inspection.photos[0];
  const activePhotos = inspection.photos.filter((photo) => photo.systemId === activeSystem.id);
  const activeSuggestions = inspection.aiSuggestions.filter((suggestion) => suggestion.systemId === activeSystem.id);
  const activeFindings = inspection.findings.filter((finding) => finding.systemId === activeSystem.id);

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
  }

  function handleAddPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const nextPhoto: PhotoEvidence = {
      id: `photo-${Date.now()}`,
      url: URL.createObjectURL(file),
      label: file.name.replace(/\.[^.]+$/, ""),
      systemId: activeSystem.id,
      location: "Field capture",
      capturedAt: new Date().toISOString(),
      tags: [activeSystem.id, "uploaded"],
      uploaded: false
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

  function handleExport() {
    const printable = buildPrintableReportHtml(inspection, statePack, readiness);
    const reportWindow = window.open("", "_blank", "noopener,noreferrer");

    if (!reportWindow) {
      return;
    }

    reportWindow.document.write(printable);
    reportWindow.document.close();
    reportWindow.focus();
  }

  return (
    <main className="app-shell">
      <Sidebar
        selectedPackId={selectedPackId}
        onPackChange={handlePackChange}
        completionPercent={readiness.completionPercent}
      />
      <section className="workspace">
        <Header inspection={inspection} readiness={readiness} onExport={handleExport} />
        <div className="workgrid">
          <SystemChecklist
            statePackSystems={statePack.systems}
            activeSystemId={activeSystem.id}
            inspection={inspection}
            onSelect={setActiveSystemId}
            onCheckpoint={(checkpoint) =>
              setInspection((current) => markCheckpointComplete(current, activeSystem.id, checkpoint))
            }
            onComplete={() => setInspection((current) => markSystemComplete(current, statePack, activeSystem.id))}
          />
          <PhotoWorkspace
            systemLabel={activeSystem.label}
            photos={activePhotos.length ? activePhotos : inspection.photos}
            selectedPhoto={selectedPhoto}
            onSelectPhoto={setSelectedPhotoId}
            onAddPhoto={handleAddPhoto}
          />
          <ReviewPanel
            statePackName={statePack.name}
            readiness={readiness}
            suggestions={activeSuggestions}
            findings={activeFindings}
            reportSummary={buildReportSummary(inspection, statePack, readiness)}
            onSuggestionAction={handleSuggestionAction}
          />
        </div>
      </section>
    </main>
  );
}

function Sidebar({
  selectedPackId,
  onPackChange,
  completionPercent
}: {
  selectedPackId: string;
  onPackChange: (packId: string) => void;
  completionPercent: number;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Home size={20} />
        </div>
        <div>
          <strong>Home Inspection Assistant</strong>
          <span>Standalone EB28 project</span>
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
  onExport
}: {
  inspection: InspectionReport;
  readiness: ReturnType<typeof calculateReportReadiness>;
  onExport: () => void;
}) {
  return (
    <header className="topbar">
      <div>
        <p className="meta-line">{inspection.status.replace(/_/g, " ")}</p>
        <h1>{inspection.property.address}</h1>
        <p>
          {inspection.property.city}, {inspection.property.state} {inspection.property.postalCode} ·{" "}
          {inspection.property.yearBuilt} · {inspection.property.squareFeet} sq ft
        </p>
      </div>
      <div className="topbar-actions">
        <div className={readiness.ready ? "status-pill ready" : "status-pill review"}>
          {readiness.ready ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {readiness.ready ? "Ready to export" : "Review required"}
        </div>
        <button className="primary-button" type="button" onClick={onExport}>
          <Download size={16} />
          Preview report
        </button>
      </div>
    </header>
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
  statePackSystems: ReturnType<typeof statePacks[number]["systems"]["slice"]>;
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
  onAddPhoto
}: {
  systemLabel: string;
  photos: PhotoEvidence[];
  selectedPhoto?: PhotoEvidence;
  onSelectPhoto: (photoId: string) => void;
  onAddPhoto: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <section className="panel photo-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">{systemLabel}</span>
          <h2>Photo evidence</h2>
        </div>
        <label className="ghost-button file-button">
          <ImagePlus size={15} />
          Add photo
          <input type="file" accept="image/*" onChange={onAddPhoto} />
        </label>
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
  reportSummary,
  onSuggestionAction
}: {
  statePackName: string;
  readiness: ReturnType<typeof calculateReportReadiness>;
  suggestions: AiSuggestion[];
  findings: InspectionReport["findings"];
  reportSummary: string;
  onSuggestionAction: (suggestion: AiSuggestion, action: "approve" | "edit" | "reject") => void;
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

      <div className="suggestion-list">
        <h3>AI draft queue</h3>
        {suggestions.length === 0 && <p className="empty-state">No AI suggestions for this system yet.</p>}
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
