import type { InspectionReport } from "./types";
import { getStatePack } from "./statePacks";
import electricalPhotoUrl from "../assets/inspection-photos/electrical.jpg";
import hvacPhotoUrl from "../assets/inspection-photos/hvac.jpg";
import plumbingPhotoUrl from "../assets/inspection-photos/plumbing.jpg";
import roofPhotoUrl from "../assets/inspection-photos/roof.jpg";

const now = "2026-06-24T15:40:00-04:00";

export const seedInspection: InspectionReport = {
  id: "inspection-viera-001",
  statePackId: "fl-2026-starter",
  status: "in_review",
  request: {
    clientName: "Beth York",
    insuredName: "Public Record Owner",
    phone: "321-555-0188",
    email: "beth@example.com",
    inspectionType: "insurance-combo",
    price: "$149",
    paymentStatus: "invoiced",
    appointmentStart: "2026-06-24T15:40",
    appointmentEnd: "2026-06-24T16:40",
    source: "website",
    notes:
      "Client booked online. Confirm access, payment, and that the electrical panel is clear before arrival.",
    calendarSummary: "Insurance combo inspection - 742 Palmetto Ridge Dr"
  },
  inspectionDate: "2026-06-24",
  scope:
    "General visual home inspection of readily accessible systems and components with photo evidence, inspector review, and state-pack guardrails.",
  property: {
    address: "742 Palmetto Ridge Dr",
    city: "Viera",
    state: "FL",
    postalCode: "32940",
    yearBuilt: "2007",
    squareFeet: "2,180",
    occupancy: "occupied",
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
  officialFields: {
    policyNumber: "",
    insuranceCompany: "",
    stories: "1",
    workPhone: "321-555-0188",
    roofCovering: "Asphalt/Fiberglass",
    roofCoveringYear: "2017",
    roofAge: "9",
    roofRemainingLife: "Inspector verify",
    roofPermitDate: "2017",
    roofCondition: "Inspector verify",
    roofDeckAttachmentNote: "Permit/product approval review required",
    openingProtectionNote: "Inspector verification required",
    electricalMainType: "Circuit breaker",
    electricalAmps: "200",
    panelBrand: "Inspector verify",
    panelAge: "Unknown",
    electricalCondition: "Unsatisfactory until panel safety review is cleared",
    hvacLastService: "Inspector verify",
    hvacAge: "Unknown",
    hvacUpdated: "Inspector verify",
    hvacCondition: "Inspector verify",
    plumbingMaterial: "Inspector verify",
    visibleLeaks: "Inspector verify",
    waterHeaterLocation: "Utility closet",
    waterHeaterAge: "Unknown",
    plumbingCondition: "Inspector verify"
  },
  signatureName: "",
  systems: getStatePack("fl-2026-starter").systems.map((system, index) => ({
    systemId: system.id,
    status: index < 3 ? "complete" : index < 5 ? "in_progress" : "not_started",
    completedCheckpoints: system.checkpoints.slice(0, index < 3 ? system.checkpoints.length : 2)
  })),
  photos: [
    {
      id: "photo-roof-001",
      url: roofPhotoUrl,
      label: "Front elevation and roof plane",
      systemId: "roof",
      slotId: "roof-covering",
      location: "Exterior front",
      capturedAt: now,
      tags: ["roof", "exterior", "covering"],
      uploaded: true
    },
    {
      id: "photo-electrical-001",
      url: electricalPhotoUrl,
      label: "Main electrical service panel",
      systemId: "electrical",
      slotId: "electrical-panel",
      location: "Garage",
      capturedAt: now,
      tags: ["electrical", "panel", "safety"],
      uploaded: true
    },
    {
      id: "photo-hvac-001",
      url: hvacPhotoUrl,
      label: "Outdoor condenser equipment",
      systemId: "hvac",
      slotId: "hvac-equipment",
      location: "East side yard",
      capturedAt: now,
      tags: ["hvac", "condenser", "equipment"],
      uploaded: true
    },
    {
      id: "photo-plumbing-001",
      url: plumbingPhotoUrl,
      label: "Water heater installation",
      systemId: "plumbing",
      slotId: "water-heater",
      location: "Utility closet",
      capturedAt: now,
      tags: ["plumbing", "water heater"],
      uploaded: true
    }
  ],
  findings: [
    {
      id: "finding-electrical-001",
      systemId: "electrical",
      photoIds: ["photo-electrical-001"],
      title: "Panel requires licensed electrical review",
      narrative:
        "The electrical panel should be reviewed by a licensed electrical contractor due to visible age and incomplete labeling.",
      severity: "safety",
      recommendation: "Recommend evaluation and correction by a licensed electrical contractor before closing.",
      reviewState: "approved",
      source: "inspector"
    }
  ],
  aiSuggestions: [
    {
      id: "ai-roof-001",
      systemId: "roof",
      photoIds: ["photo-roof-001"],
      title: "Roof covering evidence captured",
      draft:
        "Photo evidence shows the visible front roof plane and exterior elevation. No active leak evidence is visible from this photo alone.",
      confidence: 0.78,
      reviewState: "needs_review",
      model: "assistive-draft-local",
      generatedAt: now
    },
    {
      id: "ai-plumbing-001",
      systemId: "plumbing",
      photoIds: ["photo-plumbing-001"],
      title: "Water heater area needs inspector confirmation",
      draft:
        "The water heater installation should be reviewed for age, pan/drain configuration, shutoff accessibility, and visible leakage indicators.",
      confidence: 0.71,
      reviewState: "needs_review",
      model: "assistive-draft-local",
      generatedAt: now
    },
    {
      id: "ai-hvac-001",
      systemId: "hvac",
      photoIds: ["photo-hvac-001"],
      title: "HVAC condenser condition draft",
      draft:
        "Outdoor HVAC equipment was photographed. Confirm data plate age, service disconnect, condensate routing, and operating condition.",
      confidence: 0.69,
      reviewState: "edited",
      model: "assistive-draft-local",
      generatedAt: now
    }
  ],
  fieldSuggestions: [],
  permitCandidates: [
    {
      id: "permit-roof-demo",
      type: "roof",
      title: "Reroof permit candidate",
      permitNumber: "BRV-ROOF-2017-01492",
      issuedDate: "2017-05-12",
      finalDate: "2017-06-02",
      contractor: "Inspector verify with permit source",
      sourceId: "brevard-permits",
      sourceUrl: "https://www.brevardfl.gov/PlanningAndDevelopment/BuildingPermits/PermitSearch",
      confidence: "medium",
      status: "candidate",
      notes: "Demo candidate for inspector review. Select only after matching against the official permit record.",
      importFields: {
        roofPermitDate: "2017-06-02",
        roofCoveringYear: "2017",
        roofAge: "9"
      }
    },
    {
      id: "permit-hvac-demo",
      type: "hvac",
      title: "HVAC changeout permit candidate",
      permitNumber: "BRV-HVAC-2021-00621",
      issuedDate: "2021-03-18",
      finalDate: "2021-04-06",
      contractor: "Inspector verify with permit source",
      sourceId: "brevard-permits",
      sourceUrl: "https://www.brevardfl.gov/PlanningAndDevelopment/BuildingPermits/PermitSearch",
      confidence: "low",
      status: "candidate",
      notes: "Possible HVAC documentation. Do not import until the address and permit scope match.",
      importFields: {
        hvacUpdated: "2021-04-06",
        hvacAge: "5"
      }
    }
  ]
};
