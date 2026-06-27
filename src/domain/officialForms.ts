import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fourPointTemplateUrl from "../assets/forms/BLANK 4 Point 2025.pdf?url";
import windMitigationTemplateUrl from "../assets/forms/BLANK Wind Mitigation Report 2026.pdf?url";
import type { Finding, InspectionReport } from "./types";

const ink = rgb(0.04, 0.11, 0.14);
const blueInk = rgb(0.02, 0.18, 0.34);

interface PdfWriter {
  pdfDoc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  pages: PDFPage[];
}

export type OfficialFormType = "four-point" | "wind-mitigation";

export interface OfficialFormExport {
  type: OfficialFormType;
  filename: string;
  bytes: Uint8Array;
}

export async function buildFourPointPdf(inspection: InspectionReport): Promise<OfficialFormExport> {
  const writer = await loadTemplate(fourPointTemplateUrl);
  const data = getDerivedFormData(inspection);

  drawFourPointPageOne(writer, inspection, data);
  drawFourPointPageTwo(writer, data);
  drawFourPointPageThree(writer, inspection, data);

  const bytes = await writer.pdfDoc.save();
  return {
    type: "four-point",
    filename: `${fileSlug(inspection.property.address || "inspection")}-4-point.pdf`,
    bytes
  };
}

export async function buildWindMitigationPdf(inspection: InspectionReport): Promise<OfficialFormExport> {
  const writer = await loadTemplate(windMitigationTemplateUrl);
  const data = getDerivedFormData(inspection);

  drawWindPageOne(writer, inspection, data);
  drawWindPageTwo(writer, data);
  drawWindPageThree(writer, data);
  drawWindPageFive(writer, inspection, data);
  drawWindPageSix(writer, inspection, data);
  drawWindFooters(writer, inspection, data);

  const bytes = await writer.pdfDoc.save();
  return {
    type: "wind-mitigation",
    filename: `${fileSlug(inspection.property.address || "inspection")}-wind-mitigation.pdf`,
    bytes
  };
}

export function downloadOfficialForm(exportedForm: OfficialFormExport): void {
  const blob = new Blob([exportedForm.bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exportedForm.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function loadTemplate(url: string): Promise<PdfWriter> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load official form template: ${response.status}`);
  }
  const pdfDoc = await PDFDocument.load(await response.arrayBuffer(), { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  return { pdfDoc, font, bold, pages: pdfDoc.getPages() };
}

function drawFourPointPageOne(writer: PdfWriter, inspection: InspectionReport, data: ReturnType<typeof getDerivedFormData>) {
  text(writer, 0, 137, 704, data.ownerName, 9, 250);
  text(writer, 0, 434, 704, data.policyNumber, 9, 145);
  text(writer, 0, 128, 681, data.fullAddress, 9, 410);
  text(writer, 0, 126, 657, inspection.property.yearBuilt || "Unknown", 9, 110);
  text(writer, 0, 404, 657, usDate(inspection.inspectionDate), 9, 120);

  check(writer, 0, 67, 474, true);
  text(writer, 0, 94, 470, data.electricalMainType, 8, 80);
  text(writer, 0, 86, 453, data.electricalAmps, 8, 48);
  check(writer, 0, 194, 441, true);

  if (data.hasElectricalSafetyFinding) {
    check(writer, 0, 325, 280, true);
  }
  check(writer, 0, 214, 229, !data.hasElectricalSafetyFinding);
  check(writer, 0, 276, 229, data.hasElectricalSafetyFinding);

  text(writer, 0, 85, 125, data.panelAge, 8, 70);
  text(writer, 0, 105, 95, data.panelBrand, 8, 95);
  check(writer, 0, 314, 89, true);
}

function drawFourPointPageTwo(writer: PdfWriter, data: ReturnType<typeof getDerivedFormData>) {
  check(writer, 1, 98, 646, true);
  check(writer, 1, 98, 628, true);
  check(writer, 1, 337, 598, true);
  text(writer, 1, 187, 580, data.hvacLastService, 8, 80);
  check(writer, 1, 284, 493, true);
  text(writer, 1, 99, 463, data.hvacAge, 8, 64);
  text(writer, 1, 130, 445, data.hvacUpdated, 8, 70);

  check(writer, 1, 282, 377, true);
  check(writer, 1, 203, 364, true);
  check(writer, 1, 185, 350, true);
  text(writer, 1, 125, 337, data.waterHeaterLocation, 8, 210);

  const fixtureSatisfactoryY = [288, 275, 261, 247, 233];
  for (const y of fixtureSatisfactoryY) {
    check(writer, 1, 135, y, true);
  }
  const fixtureSatisfactoryYRight = [288, 275, 261, 247, 233];
  for (const y of fixtureSatisfactoryYRight) {
    check(writer, 1, 410, y, true);
  }

  text(writer, 1, 204, 92, data.waterHeaterAge, 8, 80);
  check(writer, 1, 354, 136, true);
}

function drawFourPointPageThree(writer: PdfWriter, inspection: InspectionReport, data: ReturnType<typeof getDerivedFormData>) {
  text(writer, 2, 111, 671, data.roofCovering, 8, 70);
  text(writer, 2, 109, 657, data.roofAge, 8, 52);
  text(writer, 2, 154, 642, data.roofRemainingLife, 8, 60);
  text(writer, 2, 137, 625, data.roofPermitDate, 8, 70);
  check(writer, 2, 52, 360, true);
  check(writer, 2, 153, 327, false);
  check(writer, 2, 198, 327, true);
  check(writer, 2, 121, 313, false);
  check(writer, 2, 164, 313, true);
  textLines(writer, 2, 43, 246, data.comments, 8, 530, 10);

  text(writer, 2, 70, 172, inspection.signatureName || inspection.inspector.name || "Inspector signature required", 12, 135);
  text(writer, 2, 196, 172, "Home Inspector", 10, 112);
  text(writer, 2, 320, 172, inspection.inspector.license || "License required", 10, 120);
  text(writer, 2, 465, 172, usDate(inspection.signedAt || inspection.inspectionDate), 10, 85);
  text(writer, 2, 43, 128, inspection.inspector.company || "Company required", 10, 138);
  text(writer, 2, 196, 128, "Home Inspector", 10, 112);
  text(writer, 2, 320, 128, data.workPhone, 10, 118);
}

function drawWindPageOne(writer: PdfWriter, inspection: InspectionReport, data: ReturnType<typeof getDerivedFormData>) {
  text(writer, 0, 151, 713, usDate(inspection.inspectionDate), 9, 120);
  text(writer, 0, 122, 681, data.ownerName, 9, 215);
  text(writer, 0, 448, 681, data.contactPerson, 9, 92);
  text(writer, 0, 100, 658, data.propertyStreet, 9, 250);
  text(writer, 0, 90, 635, inspection.property.city, 9, 100);
  text(writer, 0, 245, 635, inspection.property.postalCode, 9, 60);
  text(writer, 0, 105, 612, data.county, 9, 220);
  text(writer, 0, 230, 589, data.insuranceCompany, 9, 110);
  text(writer, 0, 403, 589, data.policyNumber, 9, 150);
  text(writer, 0, 125, 566, inspection.property.yearBuilt || "Unknown", 9, 70);
  text(writer, 0, 305, 566, data.stories, 9, 35);
  text(writer, 0, 425, 566, inspection.inspector.email, 9, 120);

  if (data.buildingCode === "A") {
    check(writer, 0, 38, 455, true);
    text(writer, 0, 413, 454, inspection.property.yearBuilt, 8, 45);
  } else if (data.buildingCode === "B") {
    check(writer, 0, 38, 425, true);
    text(writer, 0, 413, 424, inspection.property.yearBuilt, 8, 45);
  } else {
    check(writer, 0, 38, 356, true);
  }

  text(writer, 0, 417, 205, data.roofCoveringYear, 8, 80);
  check(writer, 0, 44, 203, true);
  check(writer, 0, 474, 203, true);
}

function drawWindPageTwo(writer: PdfWriter, data: ReturnType<typeof getDerivedFormData>) {
  check(writer, 1, 37, 707, true);
  check(writer, 1, 37, 383, true);
  text(writer, 1, 107, 377, data.roofDeckAttachmentNote, 8, 260);
}

function drawWindPageThree(writer: PdfWriter, data: ReturnType<typeof getDerivedFormData>) {
  check(writer, 2, 37, 343, true);
  check(writer, 2, 37, 149, true);
  text(writer, 2, 110, 142, data.openingProtectionNote, 8, 280);
}

function drawWindPageFive(writer: PdfWriter, inspection: InspectionReport, data: ReturnType<typeof getDerivedFormData>) {
  text(writer, 4, 143, 365, inspection.inspector.name, 8, 130);
  text(writer, 4, 362, 365, "Home Inspector", 8, 135);
  text(writer, 4, 463, 365, inspection.inspector.license, 8, 100);
  text(writer, 4, 137, 342, inspection.inspector.company, 8, 230);
  text(writer, 4, 455, 342, data.workPhone, 8, 105);
  check(writer, 4, 38, 296, true);
}

function drawWindPageSix(writer: PdfWriter, inspection: InspectionReport, data: ReturnType<typeof getDerivedFormData>) {
  text(writer, 5, 87, 624, inspection.signatureName || inspection.inspector.name || "Inspector signature required", 9, 155);
  text(writer, 5, 352, 624, "N/A", 9, 80);
  text(writer, 5, 183, 585, inspection.inspector.name, 9, 140);
  text(writer, 5, 376, 552, usDate(inspection.signedAt || inspection.inspectionDate), 9, 110);
}

function drawWindFooters(writer: PdfWriter, inspection: InspectionReport, data: ReturnType<typeof getDerivedFormData>) {
  for (let index = 0; index < writer.pages.length; index += 1) {
    text(writer, index, 119, 55, data.initials, 8, 60);
    text(writer, index, 244, 55, data.fullAddress, 8, 300);
  }
}

function getDerivedFormData(inspection: InspectionReport) {
  const findings = inspection.findings.filter((finding) => finding.reviewState !== "rejected");
  const electricalFindings = findings.filter((finding) => finding.systemId === "electrical");
  const roofFindings = findings.filter((finding) => finding.systemId === "roof");
  const selectedRoofPermit = inspection.permitCandidates.find(
    (permit) => permit.status === "selected" && permit.type === "roof"
  );
  const selectedHvacPermit = inspection.permitCandidates.find(
    (permit) => permit.status === "selected" && permit.type === "hvac"
  );
  const ownerName =
    inspection.request.insuredName ||
    inspection.property.ownerName ||
    inspection.researchPacket?.ownerName ||
    "Owner name required";
  const county = inspection.property.county || inspection.researchPacket?.county || "County required";
  const publicRecordComments = buildPublicRecordComments(inspection);
  const official = inspection.officialFields;

  return {
    ownerName,
    contactPerson: inspection.request.clientName || inspection.inspector.name,
    propertyStreet: inspection.property.address,
    fullAddress: [
      inspection.property.address,
      inspection.property.city,
      inspection.property.state,
      inspection.property.postalCode
    ]
      .filter(Boolean)
      .join(", "),
    county,
    policyNumber: official.policyNumber || "Policy # required",
    insuranceCompany: official.insuranceCompany || "Insurance company required",
    stories: official.stories || "1",
    initials: initialsFor(inspection.inspector.name),
    electricalMainType: official.electricalMainType || "Inspector verify",
    electricalAmps: official.electricalAmps || "Inspector verify",
    panelAge: official.panelAge || "Unknown",
    panelBrand: official.panelBrand || "Inspector verify",
    hasElectricalSafetyFinding:
      electricalFindings.some((finding) => finding.severity === "safety") ||
      official.electricalCondition.toLowerCase().includes("unsatisfactory"),
    hvacLastService: official.hvacLastService || "Inspector verify",
    hvacAge: official.hvacAge || selectedHvacPermit?.finalDate?.slice(0, 4) || "Unknown",
    hvacUpdated: official.hvacUpdated || selectedHvacPermit?.finalDate || selectedHvacPermit?.issuedDate || "Unknown",
    waterHeaterLocation: official.waterHeaterLocation || "Inspector verify",
    waterHeaterAge: official.waterHeaterAge || "Unknown",
    roofCovering: official.roofCovering || "Inspector verify",
    roofCoveringYear: official.roofCoveringYear || selectedRoofPermit?.finalDate?.slice(0, 4) || inspection.property.yearBuilt || "Unknown",
    roofAge: official.roofAge || roofAgeFromYear(official.roofCoveringYear || inspection.property.yearBuilt),
    roofRemainingLife: official.roofRemainingLife || (roofFindings.length > 0 ? "Inspector verify" : "Unknown"),
    roofPermitDate: official.roofPermitDate || selectedRoofPermit?.finalDate || selectedRoofPermit?.issuedDate || "Unknown",
    roofDeckAttachmentNote: official.roofDeckAttachmentNote || publicRecordComments || "Inspector verification required",
    openingProtectionNote: official.openingProtectionNote || "Inspector verification required",
    buildingCode: getBuildingCodeAnswer(inspection.property.yearBuilt),
    workPhone: official.workPhone || inspection.request.phone || "Phone required",
    comments: buildComments(findings, inspection, publicRecordComments)
  };
}

function buildComments(findings: Finding[], inspection: InspectionReport, publicRecordComments: string): string {
  const findingLines = findings.map((finding) => `${finding.title}: ${finding.recommendation}`);
  const scanLines = inspection.photos
    .filter((photo) => photo.analysis)
    .map((photo) => `Image scan ${photo.label}: ${photo.analysis?.detectedIssue}.`);
  const lines = [...findingLines, ...scanLines, publicRecordComments].filter(Boolean);
  return lines.length > 0 ? lines.join(" ") : "No approved defects were entered in the app. Inspector must verify all official form fields before filing.";
}

function buildPublicRecordComments(inspection: InspectionReport): string {
  const records = [
    inspection.property.parcelId ? `Parcel ${inspection.property.parcelId}` : "",
    inspection.property.taxAccount ? `Tax account ${inspection.property.taxAccount}` : "",
    inspection.property.floodZone ? `FEMA flood zone ${inspection.property.floodZone}` : "",
    inspection.property.sfha ? `SFHA ${inspection.property.sfha}` : "",
    ...inspection.permitCandidates
      .filter((permit) => permit.status === "selected")
      .map((permit) =>
        `${permit.title}${permit.permitNumber ? ` ${permit.permitNumber}` : ""}${permit.finalDate ? ` finaled ${permit.finalDate}` : ""}`
      )
  ].filter(Boolean);

  if (records.length === 0) {
    return "";
  }

  return `Public records prefill: ${records.join("; ")}. Inspector must verify against official source documents.`;
}

function roofAgeFromYear(yearBuilt: string): string {
  const year = Number(yearBuilt);
  if (!Number.isFinite(year)) {
    return "Unknown";
  }
  return String(Math.max(0, new Date().getFullYear() - year));
}

function getBuildingCodeAnswer(yearBuilt: string): "A" | "B" | "D" {
  const year = Number(yearBuilt);
  if (!Number.isFinite(year)) {
    return "D";
  }
  if (year >= 2007) {
    return "B";
  }
  if (year >= 2002) {
    return "A";
  }
  return "D";
}

function text(
  writer: PdfWriter,
  pageIndex: number,
  x: number,
  y: number,
  value: string | undefined,
  size = 9,
  maxWidth = 180,
  bold = false
) {
  const clean = sanitize(value);
  if (!clean) {
    return;
  }
  const font = bold ? writer.bold : writer.font;
  writer.pages[pageIndex]?.drawText(truncateToWidth(clean, font, size, maxWidth), {
    x,
    y,
    size,
    font,
    color: ink
  });
}

function textLines(
  writer: PdfWriter,
  pageIndex: number,
  x: number,
  y: number,
  value: string,
  size = 8,
  maxWidth = 520,
  lineHeight = 10
) {
  const page = writer.pages[pageIndex];
  if (!page) {
    return;
  }
  const lines = wrapText(sanitize(value), writer.font, size, maxWidth).slice(0, 10);
  lines.forEach((line, index) => {
    page.drawText(line, { x, y: y - index * lineHeight, size, font: writer.font, color: ink });
  });
}

function check(writer: PdfWriter, pageIndex: number, x: number, y: number, checked: boolean) {
  if (!checked) {
    return;
  }
  writer.pages[pageIndex]?.drawText("X", {
    x,
    y,
    size: 10,
    font: writer.bold,
    color: blueInk
  });
}

function wrapText(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word;
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function truncateToWidth(value: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) {
    return value;
  }
  let candidate = value;
  while (candidate.length > 4 && font.widthOfTextAtSize(`${candidate}...`, size) > maxWidth) {
    candidate = candidate.slice(0, -1);
  }
  return `${candidate.trim()}...`;
}

function sanitize(value: string | undefined): string {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function usDate(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York" });
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join("")
    .slice(0, 3);
}

function fileSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
