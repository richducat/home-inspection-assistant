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
    name: "Richard Ducat",
    company: "EB28 Field Services",
    license: "FL-HI-REVIEW",
    email: "inspections@eb28.co"
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
  ]
};
