import type {
  FieldSuggestion,
  InspectionReport,
  InspectionRequest,
  OfficialFormFields,
  PermitCandidate
} from "./types";

export const defaultOfficialFields: OfficialFormFields = {
  policyNumber: "",
  insuranceCompany: "",
  stories: "1",
  workPhone: "",
  roofCovering: "Inspector verify",
  roofCoveringYear: "",
  roofAge: "Unknown",
  roofRemainingLife: "Inspector verify",
  roofPermitDate: "",
  roofCondition: "Inspector verify",
  roofDeckAttachmentNote: "Inspector verification required",
  openingProtectionNote: "Inspector verification required",
  electricalMainType: "Inspector verify",
  electricalAmps: "Inspector verify",
  panelBrand: "Inspector verify",
  panelAge: "Unknown",
  electricalCondition: "Inspector verify",
  hvacLastService: "Inspector verify",
  hvacAge: "Unknown",
  hvacUpdated: "Inspector verify",
  hvacCondition: "Inspector verify",
  plumbingMaterial: "Inspector verify",
  visibleLeaks: "Inspector verify",
  waterHeaterLocation: "Inspector verify",
  waterHeaterAge: "Unknown",
  plumbingCondition: "Inspector verify"
};

export const defaultInspectionRequest: InspectionRequest = {
  clientName: "",
  insuredName: "",
  phone: "",
  email: "",
  inspectionType: "insurance-combo",
  price: "$149",
  paymentStatus: "unpaid",
  appointmentStart: "",
  appointmentEnd: "",
  source: "manual",
  notes: "",
  calendarEventId: "",
  calendarSummary: ""
};

export function applyFieldSuggestion(inspection: InspectionReport, suggestionId: string): InspectionReport {
  const suggestion = inspection.fieldSuggestions.find((candidate) => candidate.id === suggestionId);
  if (!suggestion) {
    return inspection;
  }

  return {
    ...inspection,
    officialFields: {
      ...inspection.officialFields,
      [suggestion.fieldId]: suggestion.value
    },
    fieldSuggestions: inspection.fieldSuggestions.map((candidate) =>
      candidate.id === suggestionId ? { ...candidate, reviewState: "approved" } : candidate
    ),
    status: inspection.status === "finalized" ? "in_review" : inspection.status,
    signedAt: inspection.status === "finalized" ? undefined : inspection.signedAt,
    exportedAt: inspection.status === "finalized" ? undefined : inspection.exportedAt
  };
}

export function updateFieldSuggestionState(
  inspection: InspectionReport,
  suggestionId: string,
  reviewState: FieldSuggestion["reviewState"]
): InspectionReport {
  return {
    ...inspection,
    fieldSuggestions: inspection.fieldSuggestions.map((candidate) =>
      candidate.id === suggestionId ? { ...candidate, reviewState } : candidate
    )
  };
}

export function applyPermitCandidate(inspection: InspectionReport, permitId: string): InspectionReport {
  const permit = inspection.permitCandidates.find((candidate) => candidate.id === permitId);
  if (!permit) {
    return inspection;
  }

  const importFields = getPermitImportFields(permit);
  return {
    ...inspection,
    officialFields: {
      ...inspection.officialFields,
      ...importFields
    },
    permitCandidates: inspection.permitCandidates.map((candidate) =>
      candidate.id === permitId
        ? { ...candidate, status: "selected", importFields }
        : candidate.type === permit.type
          ? { ...candidate, status: candidate.status === "selected" ? "candidate" : candidate.status }
          : candidate
    ),
    status: inspection.status === "finalized" ? "in_review" : inspection.status,
    signedAt: inspection.status === "finalized" ? undefined : inspection.signedAt,
    exportedAt: inspection.status === "finalized" ? undefined : inspection.exportedAt
  };
}

export function getPermitImportFields(permit: PermitCandidate): Partial<OfficialFormFields> {
  const permitDate = permit.finalDate || permit.issuedDate;
  const year = permitDate ? permitDate.slice(0, 4) : "";
  const existing = permit.importFields ?? {};

  if (permit.type === "roof") {
    return {
      ...existing,
      roofPermitDate: existing.roofPermitDate || permitDate,
      roofCoveringYear: existing.roofCoveringYear || year,
      roofAge: existing.roofAge || (year ? String(Math.max(0, new Date().getFullYear() - Number(year))) : "")
    };
  }

  if (permit.type === "hvac") {
    return {
      ...existing,
      hvacUpdated: existing.hvacUpdated || permitDate,
      hvacAge: existing.hvacAge || (year ? String(Math.max(0, new Date().getFullYear() - Number(year))) : "")
    };
  }

  if (permit.type === "electrical") {
    return {
      ...existing,
      panelAge: existing.panelAge || (year ? `Permit ${year}` : "Inspector verify"),
      electricalCondition: existing.electricalCondition || "Inspector verify with selected permit"
    };
  }

  if (permit.type === "plumbing") {
    return {
      ...existing,
      plumbingCondition: existing.plumbingCondition || "Inspector verify with selected permit"
    };
  }

  return existing;
}

export function createManualPermitCandidate(type: PermitCandidate["type"] = "roof"): PermitCandidate {
  return {
    id: `permit-manual-${type}-${Date.now()}`,
    type,
    title: `${capitalize(type)} permit`,
    permitNumber: "",
    issuedDate: "",
    finalDate: "",
    contractor: "",
    sourceId: "manual",
    sourceUrl: "",
    confidence: "medium",
    status: "candidate",
    notes: "Added by inspector from jurisdiction permit source."
  };
}

export function buildCalendarEventUrl(inspection: InspectionReport): string {
  const request = inspection.request;
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", request.calendarSummary || calendarTitle(inspection));
  url.searchParams.set("location", fullAddress(inspection));
  url.searchParams.set("details", calendarDetails(inspection));
  const dates = calendarDates(request);
  if (dates) {
    url.searchParams.set("dates", dates);
  }
  return url.toString();
}

export function buildCalendarIcs(inspection: InspectionReport): string {
  const request = inspection.request;
  const start = request.appointmentStart ? toIcsDate(request.appointmentStart) : toIcsDate(new Date().toISOString());
  const end = request.appointmentEnd ? toIcsDate(request.appointmentEnd) : start;
  const uid = `${inspection.id}@hip.eb28.co`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HIP//Home Inspection Assistant//EN",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(uid)}`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcs(request.calendarSummary || calendarTitle(inspection))}`,
    `LOCATION:${escapeIcs(fullAddress(inspection))}`,
    `DESCRIPTION:${escapeIcs(calendarDetails(inspection))}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

export function parseCalendarInspectionText(text: string, current: InspectionReport): InspectionReport {
  const value = text.trim();
  if (!value) {
    return current;
  }

  const fields = extractKeyValueLines(value);
  const address = pick(fields, ["address", "property", "location"]) || current.property.address;
  const cityStateZip = parseCityStateZip(pick(fields, ["city state zip", "city/state/zip"]) || "");
  const inspectionType = normalizeInspectionType(pick(fields, ["inspection type", "type", "service"]));
  const appointmentStart = pick(fields, ["appointment", "start", "date", "scheduled"]) || current.request.appointmentStart;

  return {
    ...current,
    request: {
      ...current.request,
      clientName: pick(fields, ["client", "client name", "name", "customer"]) || current.request.clientName,
      insuredName: pick(fields, ["insured", "insured name", "policyholder"]) || current.request.insuredName,
      phone: pick(fields, ["phone", "mobile", "cell"]) || current.request.phone,
      email: pick(fields, ["email"]) || current.request.email,
      inspectionType: inspectionType || current.request.inspectionType,
      price: pick(fields, ["price", "fee", "total"]) || current.request.price,
      paymentStatus: normalizePaymentStatus(pick(fields, ["payment", "payment status"])) || current.request.paymentStatus,
      appointmentStart,
      appointmentEnd: pick(fields, ["end"]) || current.request.appointmentEnd,
      source: "google_calendar",
      notes: pick(fields, ["notes", "description"]) || value,
      calendarSummary: firstLine(value) || current.request.calendarSummary
    },
    property: {
      ...current.property,
      address,
      city: cityStateZip.city || current.property.city,
      state: cityStateZip.state || current.property.state,
      postalCode: cityStateZip.postalCode || current.property.postalCode
    },
    inspectionDate: appointmentStart ? appointmentStart.slice(0, 10) : current.inspectionDate,
    status: current.status === "finalized" ? "in_review" : current.status,
    signedAt: current.status === "finalized" ? undefined : current.signedAt,
    exportedAt: current.status === "finalized" ? undefined : current.exportedAt
  };
}

export function buildReportEmailHref(inspection: InspectionReport): string {
  const subject = `Home inspection report - ${inspection.property.address || "property"}`;
  const body = [
    `Hi ${inspection.request.clientName || "there"},`,
    "",
    "Your home inspection report is ready for review.",
    "",
    `Property: ${fullAddress(inspection)}`,
    `Inspection type: ${labelInspectionType(inspection.request.inspectionType)}`,
    "",
    "The completed official form PDF is attached from HIP.",
    "",
    inspection.inspector.company || "York Home Inspections"
  ].join("\n");
  return `mailto:${encodeURIComponent(inspection.request.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildReviewRequestHref(inspection: InspectionReport): string {
  const subject = "Quick favor after your inspection";
  const body = [
    `Hi ${inspection.request.clientName || "there"},`,
    "",
    "Thank you for choosing York Home Inspections. If the inspection was helpful, would you leave a quick Google review?",
    "",
    "Google review link: https://g.page/r/CUSTOMER_REVIEW_LINK/review",
    "",
    "Thank you,",
    inspection.inspector.name || "York Home Inspections"
  ].join("\n");
  return `mailto:${encodeURIComponent(inspection.request.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function labelInspectionType(value: InspectionRequest["inspectionType"]): string {
  const labels: Record<InspectionRequest["inspectionType"], string> = {
    "four-point": "4-Point",
    "wind-mitigation": "Wind Mitigation",
    "insurance-combo": "4-Point + Wind Mitigation",
    "roof-certification": "Roof Certification",
    "full-home": "Full Home Inspection"
  };
  return labels[value];
}

function calendarTitle(inspection: InspectionReport): string {
  return `${labelInspectionType(inspection.request.inspectionType)} - ${inspection.property.address || "inspection"}`;
}

function calendarDetails(inspection: InspectionReport): string {
  return [
    `Client: ${inspection.request.clientName || "Not set"}`,
    `Insured: ${inspection.request.insuredName || "Not set"}`,
    `Phone: ${inspection.request.phone || "Not set"}`,
    `Email: ${inspection.request.email || "Not set"}`,
    `Inspection type: ${labelInspectionType(inspection.request.inspectionType)}`,
    `Price: ${inspection.request.price || "Not set"}`,
    `Payment: ${inspection.request.paymentStatus.replace("_", " ")}`,
    "",
    inspection.request.notes || "No notes."
  ].join("\n");
}

function fullAddress(inspection: InspectionReport): string {
  return [inspection.property.address, inspection.property.city, inspection.property.state, inspection.property.postalCode]
    .filter(Boolean)
    .join(", ");
}

function calendarDates(request: InspectionRequest): string {
  if (!request.appointmentStart || !request.appointmentEnd) {
    return "";
  }
  return `${toCalendarDate(request.appointmentStart)}/${toCalendarDate(request.appointmentEnd)}`;
}

function toCalendarDate(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function toIcsDate(value: string): string {
  return toCalendarDate(value);
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function extractKeyValueLines(text: string): Record<string, string> {
  return text.split(/\r?\n/).reduce<Record<string, string>>((acc, line) => {
    const match = line.match(/^\s*([^:=-]{2,40})\s*[:=-]\s*(.+)\s*$/);
    if (match) {
      acc[match[1].trim().toLowerCase()] = match[2].trim();
    }
    return acc;
  }, {});
}

function pick(fields: Record<string, string>, names: string[]): string {
  for (const name of names) {
    if (fields[name]) {
      return fields[name];
    }
  }
  return "";
}

function parseCityStateZip(value: string) {
  const match = value.match(/^\s*(.+?),?\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?\s*$/i);
  if (!match) {
    return { city: "", state: "", postalCode: "" };
  }
  return {
    city: match[1].trim(),
    state: match[2].toUpperCase(),
    postalCode: match[3]
  };
}

function normalizeInspectionType(value: string): InspectionRequest["inspectionType"] | undefined {
  const clean = value.toLowerCase();
  if (clean.includes("wind") && clean.includes("4")) {
    return "insurance-combo";
  }
  if (clean.includes("four") || clean.includes("4")) {
    return "four-point";
  }
  if (clean.includes("wind")) {
    return "wind-mitigation";
  }
  if (clean.includes("roof")) {
    return "roof-certification";
  }
  if (clean.includes("full")) {
    return "full-home";
  }
  return undefined;
}

function normalizePaymentStatus(value: string): InspectionRequest["paymentStatus"] | undefined {
  const clean = value.toLowerCase();
  if (clean.includes("deposit")) {
    return "deposit_paid";
  }
  if (clean.includes("paid")) {
    return "paid";
  }
  if (clean.includes("invoice")) {
    return "invoiced";
  }
  if (clean.includes("waive")) {
    return "waived";
  }
  if (clean.includes("unpaid") || clean.includes("due")) {
    return "unpaid";
  }
  return undefined;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
