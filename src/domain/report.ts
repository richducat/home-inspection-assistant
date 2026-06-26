import type { InspectionReport, ReportReadiness, StatePack } from "./types";

export function buildReportSummary(
  inspection: InspectionReport,
  statePack: StatePack,
  readiness: ReportReadiness
): string {
  const reviewedSuggestions = inspection.aiSuggestions.length - readiness.unreviewedSuggestions;

  return [
    `${inspection.property.address}, ${inspection.property.city}, ${inspection.property.state}`,
    `Inspection date: ${inspection.inspectionDate || "Not set"}`,
    `Owner: ${inspection.property.ownerName || "Not populated"}`,
    `County / parcel: ${inspection.property.county || "Not populated"} / ${inspection.property.parcelId || "Not populated"}`,
    `Flood zone: ${inspection.property.floodZone || "Not populated"}${inspection.property.sfha ? ` (SFHA ${inspection.property.sfha})` : ""}`,
    `State pack: ${statePack.name} ${statePack.version}`,
    `Inspector: ${inspection.inspector.name} (${inspection.inspector.license})`,
    `Scope: ${inspection.scope || "Not set"}`,
    `Completion: ${readiness.completionPercent}%`,
    `Findings approved: ${readiness.approvedFindings}`,
    `AI suggestions reviewed: ${reviewedSuggestions}/${inspection.aiSuggestions.length}`,
    inspection.signedAt
      ? `Inspector signoff: ${inspection.signatureName || inspection.inspector.name} at ${formatDateTime(inspection.signedAt)}`
      : "Inspector signoff: Pending",
    readiness.ready
      ? "Status: Ready for final inspector export"
      : "Status: Inspector review required before export"
  ].join("\n");
}

export function buildPrintableReportHtml(
  inspection: InspectionReport,
  statePack: StatePack,
  readiness: ReportReadiness
): string {
  const findings = inspection.findings
    .map(
      (finding) => `
        <section>
          <h3>${escapeHtml(finding.title)}</h3>
          <p><strong>Severity:</strong> ${escapeHtml(finding.severity)}</p>
          <p>${escapeHtml(finding.narrative)}</p>
          <p><strong>Recommendation:</strong> ${escapeHtml(finding.recommendation)}</p>
        </section>
      `
    )
    .join("");

  const photos = inspection.photos
    .map(
      (photo) => `
        <figure>
          <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.label)}" />
          <figcaption>${escapeHtml(photo.label)} - ${escapeHtml(photo.location)}${photo.analysis ? ` - Scan: ${escapeHtml(photo.analysis.detectedIssue)}` : ""}</figcaption>
        </figure>
      `
    )
    .join("");

  const scanEvidence = inspection.photos
    .filter((photo) => photo.analysis)
    .map(
      (photo) => `
        <section>
          <h3>${escapeHtml(photo.analysis?.detectedIssue ?? "Image scan result")}</h3>
          <p><strong>Photo:</strong> ${escapeHtml(photo.label)} - ${escapeHtml(photo.location)}</p>
          <p><strong>Severity:</strong> ${escapeHtml(photo.analysis?.severity ?? "review")}</p>
          <p><strong>Confidence:</strong> ${Math.round((photo.analysis?.confidence ?? 0) * 100)}%</p>
          <p>${escapeHtml(photo.analysis?.summary ?? "")}</p>
          <p><strong>Recommendation:</strong> ${escapeHtml(photo.analysis?.recommendation ?? "")}</p>
        </section>
      `
    )
    .join("");

  const sourceRows = inspection.researchPacket?.sources
    .map(
      (source) => `
        <tr>
          <td>${escapeHtml(source.title)}</td>
          <td>${escapeHtml(source.status.replace(/_/g, " "))}</td>
          <td><a href="${escapeHtml(source.url)}">${escapeHtml(source.url)}</a></td>
          <td>${escapeHtml(source.detail)}</td>
        </tr>
      `
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <title>Inspection Report - ${escapeHtml(inspection.property.address)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #172126; margin: 32px; line-height: 1.45; }
          h1, h2, h3 { margin: 0 0 10px; }
          header, section { border-bottom: 1px solid #d7dee2; padding: 0 0 18px; margin: 0 0 18px; }
          figure { display: inline-block; width: 45%; margin: 0 16px 20px 0; vertical-align: top; }
          img { width: 100%; border-radius: 6px; }
          figcaption { font-size: 12px; color: #59686f; margin-top: 6px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #d7dee2; padding: 7px; text-align: left; vertical-align: top; }
          .status { padding: 8px 10px; border-radius: 6px; background: ${readiness.ready ? "#e1f6ec" : "#fff4d8"}; }
        </style>
      </head>
      <body>
        <header>
          <h1>Home Inspection Report Draft</h1>
          <p>${escapeHtml(inspection.property.address)}, ${escapeHtml(inspection.property.city)}, ${escapeHtml(inspection.property.state)} ${escapeHtml(inspection.property.postalCode)}</p>
          <p>Owner: ${escapeHtml(inspection.property.ownerName || "Not populated")}</p>
          <p>County / parcel: ${escapeHtml(inspection.property.county || "Not populated")} / ${escapeHtml(inspection.property.parcelId || "Not populated")}</p>
          <p>Legal description: ${escapeHtml(inspection.property.legalDescription || "Not populated")}</p>
          <p>Flood zone: ${escapeHtml(inspection.property.floodZone || "Not populated")}${inspection.property.sfha ? ` - SFHA ${escapeHtml(inspection.property.sfha)}` : ""}</p>
          <p>Inspection date: ${escapeHtml(inspection.inspectionDate || "Not set")}</p>
          <p>Inspector: ${escapeHtml(inspection.inspector.name)} - ${escapeHtml(inspection.inspector.license)}</p>
          <p>Company: ${escapeHtml(inspection.inspector.company || "Not set")} - ${escapeHtml(inspection.inspector.email || "No email")}</p>
          <p>State pack: ${escapeHtml(statePack.name)} ${escapeHtml(statePack.version)}</p>
          <p>Scope: ${escapeHtml(inspection.scope || "Not set")}</p>
          <p>Signoff: ${inspection.signedAt ? `${escapeHtml(inspection.signatureName || inspection.inspector.name)} at ${escapeHtml(formatDateTime(inspection.signedAt))}` : "Pending inspector finalization"}</p>
          <p class="status">${readiness.ready ? "Ready for inspector final export" : "Inspector review required before final export"}</p>
        </header>
        <section>
          <h2>Findings</h2>
          ${findings || "<p>No approved findings yet.</p>"}
        </section>
        <section>
          <h2>Photo Evidence</h2>
          ${photos}
        </section>
        <section>
          <h2>Image Scan Evidence</h2>
          ${scanEvidence || "<p>No completed image scans yet.</p>"}
        </section>
        <section>
          <h2>Public Records Research</h2>
          <p>Status: ${escapeHtml(inspection.researchPacket?.status || "Not run")}</p>
          <p>Matched address: ${escapeHtml(inspection.researchPacket?.normalizedAddress || "Not populated")}</p>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Status</th>
                <th>Link</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              ${sourceRows || "<tr><td colspan=\"4\">No public-record research has been run.</td></tr>"}
            </tbody>
          </table>
        </section>
        <section>
          <h2>Compliance Notes</h2>
          <ul>${statePack.disclaimers.map((disclaimer) => `<li>${escapeHtml(disclaimer)}</li>`).join("")}</ul>
        </section>
        <section>
          <h2>Audit Trail</h2>
          <p>Inspection ID: ${escapeHtml(inspection.id)}</p>
          <p>Signed at: ${escapeHtml(inspection.signedAt ? formatDateTime(inspection.signedAt) : "Pending")}</p>
          <p>Exported at: ${escapeHtml(inspection.exportedAt ? formatDateTime(inspection.exportedAt) : "Pending")}</p>
        </section>
      </body>
    </html>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}
