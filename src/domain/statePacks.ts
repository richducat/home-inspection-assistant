import type { StatePack } from "./types";

const floridaSystems = [
  {
    id: "roof",
    label: "Roof",
    required: true,
    checkpoints: ["Covering", "Drainage", "Flashing", "Skylights", "Visible structure"]
  },
  {
    id: "exterior",
    label: "Exterior",
    required: true,
    checkpoints: ["Walls", "Grading", "Windows", "Doors", "Decks and balconies"]
  },
  {
    id: "electrical",
    label: "Electrical",
    required: true,
    checkpoints: ["Service equipment", "Panels", "Branch circuits", "GFCI/AFCI", "Visible hazards"]
  },
  {
    id: "hvac",
    label: "HVAC",
    required: true,
    checkpoints: ["Equipment", "Distribution", "Thermostat", "Condensate", "Age/condition"]
  },
  {
    id: "plumbing",
    label: "Plumbing",
    required: true,
    checkpoints: ["Supply", "Drain/waste/vent", "Water heater", "Fixtures", "Visible leaks"]
  },
  {
    id: "interior",
    label: "Interior",
    required: true,
    checkpoints: ["Walls", "Ceilings", "Floors", "Stairs", "Garage"]
  },
  {
    id: "attic",
    label: "Attic / Insulation",
    required: false,
    checkpoints: ["Access", "Insulation", "Ventilation", "Moisture indicators", "Visible framing"]
  }
] satisfies StatePack["systems"];

export const statePacks: StatePack[] = [
  {
    id: "fl-2026-starter",
    state: "FL",
    name: "Florida Starter Pack",
    version: "2026.1-review",
    effectiveDate: "2026-06-24",
    status: "production_review",
    systems: floridaSystems,
    forms: [
      {
        id: "general-home-inspection",
        title: "General Home Inspection Report",
        description:
          "Structured report sections for a licensed inspector to review, edit, approve, and export.",
        reviewRequired: true,
        fields: [
          { id: "property_address", label: "Property address", required: true, type: "text" },
          { id: "inspection_date", label: "Inspection date", required: true, type: "date" },
          { id: "inspector_license", label: "Inspector license", required: true, type: "text" },
          { id: "report_scope", label: "Report scope", required: true, type: "text" }
        ]
      },
      {
        id: "wind-mitigation-readiness",
        title: "Wind Mitigation Readiness Worksheet",
        description:
          "Draft capture checklist for wind mitigation evidence. Final form language must be validated before production filing.",
        reviewRequired: true,
        fields: [
          { id: "roof_covering_permit", label: "Roof covering permit/date evidence", required: false, type: "text" },
          { id: "roof_deck_attachment", label: "Roof deck attachment evidence", required: false, type: "select", options: ["Not inspected", "Observed", "Documentation provided"] },
          { id: "opening_protection", label: "Opening protection evidence", required: false, type: "select", options: ["None observed", "Partial", "Complete", "Documentation provided"] }
        ]
      },
      {
        id: "four-point-readiness",
        title: "4-Point Readiness Worksheet",
        description:
          "Draft capture checklist for roof, electrical, HVAC, and plumbing evidence. Carrier-specific forms must be reviewed separately.",
        reviewRequired: true,
        fields: [
          { id: "roof_age", label: "Roof age/evidence", required: false, type: "text" },
          { id: "electrical_panel", label: "Electrical panel condition", required: false, type: "text" },
          { id: "hvac_age", label: "HVAC age/evidence", required: false, type: "text" },
          { id: "plumbing_visible_leaks", label: "Visible plumbing leaks", required: false, type: "boolean" }
        ]
      }
    ],
    disclaimers: [
      "AI content is assistive only and cannot finalize a report.",
      "A licensed inspector must review every field before export.",
      "State and carrier-specific form language must be verified before production use."
    ]
  },
  {
    id: "multi-state-template",
    state: "US",
    name: "Multi-State Template",
    version: "0.1-draft",
    effectiveDate: "2026-06-24",
    status: "draft",
    systems: floridaSystems,
    forms: [
      {
        id: "configurable-report",
        title: "Configurable Inspection Report",
        description: "Neutral schema used to add state-specific compliance packs without changing the app shell.",
        reviewRequired: true,
        fields: [
          { id: "state", label: "Inspection state", required: true, type: "select", options: ["FL", "GA", "AL", "SC", "NC", "Other"] },
          { id: "state_pack_version", label: "State pack version", required: true, type: "text" }
        ]
      }
    ],
    disclaimers: [
      "This template is not a state-compliant report by itself.",
      "Add jurisdiction-specific fields and review rules before production use."
    ]
  }
];

export function getStatePack(packId: string): StatePack {
  const pack = statePacks.find((candidate) => candidate.id === packId);
  if (!pack) {
    throw new Error(`Unknown state pack: ${packId}`);
  }
  return pack;
}

