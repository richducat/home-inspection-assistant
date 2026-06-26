import type {
  InspectionReport,
  PropertyProfile,
  PropertyResearchPacket,
  PropertyResearchSource,
  PropertyResearchSourceStatus,
  PropertyResearchSuggestion
} from "./types";

const CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const BREVARD_PARCEL_URL =
  "https://gis.brevardfl.gov/gissrv/rest/services/Base_Map/Parcel_New_WKID102100/MapServer/5/query";
const FEMA_FLOOD_ZONE_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

const AUTO_FILL_FIELDS = new Set<keyof PropertyProfile>([
  "ownerName",
  "county",
  "parcelId",
  "taxAccount",
  "legalDescription",
  "propertyUse",
  "squareFeet",
  "floodZone",
  "sfha"
]);

const SOURCE_DEFINITIONS: Array<Omit<PropertyResearchSource, "status" | "detail"> & { detail: string }> = [
  {
    id: "census-geocoder",
    title: "U.S. Census Geocoder",
    url: CENSUS_GEOCODER_URL,
    detail: "Address normalization, coordinates, county, and Census geography lookup."
  },
  {
    id: "brevard-gis-parcels",
    title: "Brevard County GIS Parcel Service",
    url: "https://gis.brevardfl.gov/gissrv/rest/services/Base_Map/Parcel_New_WKID102100/MapServer/5",
    detail: "Parcel owner, parcel ID, legal description, property use, and living area where available."
  },
  {
    id: "fema-nfhl",
    title: "FEMA National Flood Hazard Layer",
    url: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",
    detail: "Flood hazard zone and SFHA indicator by geocoded property point."
  },
  {
    id: "brevard-property-appraiser",
    title: "Brevard County Property Appraiser",
    url: "https://www.bcpao.us/PropertySearch/",
    detail: "Official property card, building details, assessed records, and owner history."
  },
  {
    id: "brevard-public-data",
    title: "Brevard County Property Appraiser Public Data",
    url: "https://www.bcpao.us/PublicData.aspx",
    detail: "Bulk public property data downloads for records that need offline confirmation."
  },
  {
    id: "brevard-permits",
    title: "Brevard County Permit Search",
    url: "https://www.brevardfl.gov/PlanningAndDevelopment/BuildingPermits/PermitSearch",
    detail: "Permit history for reroof, HVAC, electrical, plumbing, and structural updates."
  },
  {
    id: "florida-product-approval",
    title: "Florida Product Approval Search",
    url: "https://www.floridabuilding.org/pr/pr_app_srch.aspx",
    detail: "Florida Building Code product approvals for roofing, opening protection, doors, and windows."
  },
  {
    id: "miami-dade-product-control",
    title: "Miami-Dade Product Control",
    url: "https://www.miamidade.gov/global/economy/board-and-code/product-approval.page",
    detail: "NOA/product approvals often required for opening protection documentation."
  },
  {
    id: "fema-msc",
    title: "FEMA Map Service Center",
    url: "https://msc.fema.gov/portal/search",
    detail: "Official FIRM panels, flood map products, and map attachments."
  },
  {
    id: "asce-hazard-tool",
    title: "ASCE Hazard Tool",
    url: "https://www.asce.org/publications-and-news/asce-hazard-tool/api",
    detail: "Wind design data and hazard values; API use requires a licensed key."
  }
];

type JsonRecord = Record<string, unknown>;

interface CensusMatch {
  matchedAddress?: string;
  coordinates?: {
    x?: number;
    y?: number;
  };
  geographies?: Record<string, Array<Record<string, string | number | undefined>>>;
}

interface ArcGisFeature {
  attributes?: Record<string, string | number | null | undefined>;
  geometry?: {
    x?: number;
    y?: number;
    rings?: number[][][];
  };
}

interface ParcelAttributes {
  TaxAcct?: number | string | null;
  Name?: string | null;
  PARCEL_ID?: string | null;
  LEGAL_DESC?: string | null;
  LIV_AREA?: number | string | null;
  OWNER_NAME1?: string | null;
  OWNER_NAME2?: string | null;
  STREET_NUMBER?: string | null;
  STREET_NAME?: string | null;
  STREET_TYPE?: string | null;
  CITY?: string | null;
  STATE?: string | null;
  ZIP_CODE?: string | null;
  USE_CODE_DESCRIPTION?: string | null;
}

export async function researchProperty(inspection: InspectionReport): Promise<PropertyResearchPacket> {
  const property = inspection.property;
  const query = formatPropertyQuery(property);
  const sources = SOURCE_DEFINITIONS.map((source) => ({
    ...source,
    status: source.id.includes("brevard") || ["census-geocoder", "fema-nfhl"].includes(source.id) ? "skipped" : "link_only",
    detail: source.detail
  })) satisfies PropertyResearchSource[];
  const suggestions: PropertyResearchSuggestion[] = [];
  const notes = [
    "Public records are used as assistive prefill only. Inspector must verify every official-form field before signature."
  ];

  let normalizedAddress = "";
  let coordinates: PropertyResearchPacket["coordinates"] | undefined;
  let resolvedCounty = normalizeText(property.county);
  let parcelCentroid: PropertyResearchPacket["coordinates"] | undefined;

  if (!query.trim()) {
    return {
      status: "failed",
      searchedAt: new Date().toISOString(),
      query,
      sources: sources.map((source) =>
        updateSource(source, "skipped", "Enter a property address before running public-record research.")
      ),
      suggestions,
      notes: ["Property address is required before public-record research can run."]
    };
  }

  try {
    const censusMatch = await lookupCensus(query);
    if (censusMatch) {
      normalizedAddress = normalizeText(censusMatch.matchedAddress);
      coordinates = getCoordinatesFromCensus(censusMatch);
      const censusCounty = getCountyFromCensus(censusMatch);

      setSource(sources, "census-geocoder", "verified", normalizedAddress || "Address matched by Census geocoder.");

      if (censusCounty) {
        resolvedCounty = censusCounty;
        suggestions.push(
          buildSuggestion(inspection, "county", "County", censusCounty, "census-geocoder", "high")
        );
      }
    } else {
      setSource(sources, "census-geocoder", "not_found", "No address match returned by the Census geocoder.");
    }
  } catch (error) {
    setSource(sources, "census-geocoder", classifyFetchError(error), readableError(error));
  }

  const likelyBrevard = isLikelyBrevard(property, resolvedCounty);
  if (likelyBrevard) {
    try {
      const parcel = await lookupBrevardParcel(property, coordinates);
      if (parcel) {
        const attrs = parcel.attributes as ParcelAttributes | undefined;
        parcelCentroid = getCoordinatesFromParcel(parcel);
        setSource(
          sources,
          "brevard-gis-parcels",
          "verified",
          `Matched parcel ${normalizeText(attrs?.PARCEL_ID || attrs?.Name || attrs?.TaxAcct)}.`
        );
        pushParcelSuggestions(inspection, attrs, suggestions);
      } else {
        setSource(sources, "brevard-gis-parcels", "not_found", "No Brevard parcel matched the entered address.");
      }
    } catch (error) {
      setSource(sources, "brevard-gis-parcels", classifyFetchError(error), readableError(error));
    }
  } else {
    setSource(
      sources,
      "brevard-gis-parcels",
      "skipped",
      "Brevard GIS parcel lookup only runs for Brevard County / 32940 Florida properties."
    );
  }

  const floodCoordinates = coordinates ?? parcelCentroid;
  if (floodCoordinates) {
    try {
      const floodFeature = await lookupFemaFloodZone(floodCoordinates);
      if (floodFeature?.attributes) {
        const floodZone = normalizeText(floodFeature.attributes.FLD_ZONE);
        const sfha = normalizeText(floodFeature.attributes.SFHA_TF);
        const subtype = normalizeText(floodFeature.attributes.ZONE_SUBTY);
        setSource(
          sources,
          "fema-nfhl",
          "verified",
          `Matched NFHL zone ${floodZone || "unknown"}${subtype ? ` (${subtype})` : ""}.`
        );
        if (floodZone) {
          suggestions.push(
            buildSuggestion(inspection, "floodZone", "FEMA flood zone", floodZone, "fema-nfhl", "high")
          );
        }
        if (sfha) {
          suggestions.push(buildSuggestion(inspection, "sfha", "SFHA", sfha, "fema-nfhl", "high"));
        }
      } else {
        setSource(sources, "fema-nfhl", "not_found", "No NFHL flood zone polygon returned for the property point.");
      }
    } catch (error) {
      setSource(sources, "fema-nfhl", classifyFetchError(error), readableError(error));
    }
  } else {
    setSource(sources, "fema-nfhl", "skipped", "Flood lookup needs coordinates from a geocoder or parcel match.");
  }

  const appliedPacket = buildPacket({
    query,
    normalizedAddress,
    coordinates: floodCoordinates,
    resolvedCounty,
    sources,
    suggestions,
    notes
  });

  return {
    ...appliedPacket,
    parcelId: suggestionValue(suggestions, "property.parcelId"),
    ownerName: suggestionValue(suggestions, "property.ownerName"),
    legalDescription: suggestionValue(suggestions, "property.legalDescription"),
    propertyUse: suggestionValue(suggestions, "property.propertyUse"),
    floodZone: suggestionValue(suggestions, "property.floodZone"),
    sfha: suggestionValue(suggestions, "property.sfha")
  };
}

export function applyResearchSuggestions(
  inspection: InspectionReport,
  packet: PropertyResearchPacket
): InspectionReport {
  const property = { ...inspection.property };

  for (const suggestion of packet.suggestions) {
    if (!suggestion.applyable) {
      continue;
    }

    const field = suggestion.fieldPath.replace("property.", "") as keyof PropertyProfile;
    if (!AUTO_FILL_FIELDS.has(field)) {
      continue;
    }

    property[field] = suggestion.value as never;
  }

  return {
    ...inspection,
    property,
    researchPacket: packet,
    status: inspection.status === "finalized" ? "in_review" : inspection.status,
    signedAt: inspection.status === "finalized" ? undefined : inspection.signedAt,
    exportedAt: inspection.status === "finalized" ? undefined : inspection.exportedAt
  };
}

export function buildPropertyResearchLinks(property: PropertyProfile): PropertyResearchSource[] {
  const query = formatPropertyQuery(property);
  return SOURCE_DEFINITIONS.map((source) => {
    const url = source.id === "fema-msc" && query ? `${source.url}?AddressQuery=${encodeURIComponent(query)}` : source.url;
    return {
      ...source,
      url,
      status: "link_only",
      detail: source.detail
    };
  });
}

function buildPacket({
  query,
  normalizedAddress,
  coordinates,
  resolvedCounty,
  sources,
  suggestions,
  notes
}: {
  query: string;
  normalizedAddress: string;
  coordinates?: PropertyResearchPacket["coordinates"];
  resolvedCounty: string;
  sources: PropertyResearchSource[];
  suggestions: PropertyResearchSuggestion[];
  notes: string[];
}): PropertyResearchPacket {
  const verifiedCount = sources.filter((source) => source.status === "verified").length;
  const failedCount = sources.filter((source) => ["blocked", "failed"].includes(source.status)).length;
  const status: PropertyResearchPacket["status"] =
    verifiedCount > 0 && failedCount === 0 ? "complete" : verifiedCount > 0 || suggestions.length > 0 ? "partial" : "failed";

  return {
    status,
    searchedAt: new Date().toISOString(),
    query,
    normalizedAddress: normalizedAddress || undefined,
    coordinates,
    county: resolvedCounty || undefined,
    sources,
    suggestions,
    notes
  };
}

async function lookupCensus(query: string): Promise<CensusMatch | undefined> {
  const url = new URL(CENSUS_GEOCODER_URL);
  url.searchParams.set("address", query);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");
  const data = await fetchJson(url.toString());
  const matches = (((data.result as JsonRecord | undefined)?.addressMatches as CensusMatch[] | undefined) ?? []);
  return matches[0];
}

async function lookupBrevardParcel(
  property: PropertyProfile,
  coordinates?: PropertyResearchPacket["coordinates"]
): Promise<ArcGisFeature | undefined> {
  const parsedAddress = parseStreetAddress(property.address);
  const baseParams = new URLSearchParams({
    f: "json",
    outFields:
      "TaxAcct,Name,PARCEL_ID,LEGAL_DESC,LIV_AREA,OWNER_NAME1,OWNER_NAME2,STREET_NUMBER,STREET_NAME,STREET_TYPE,CITY,STATE,ZIP_CODE,USE_CODE_DESCRIPTION",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "6"
  });

  if (coordinates) {
    const spatialParams = new URLSearchParams(baseParams);
    spatialParams.set("where", "1=1");
    spatialParams.set(
      "geometry",
      JSON.stringify({
        x: coordinates.longitude,
        y: coordinates.latitude,
        spatialReference: { wkid: 4326 }
      })
    );
    spatialParams.set("geometryType", "esriGeometryPoint");
    spatialParams.set("inSR", "4326");
    spatialParams.set("spatialRel", "esriSpatialRelIntersects");
    const spatialFeatures = await fetchParcelFeatures(spatialParams);
    const bestSpatialFeature = chooseBestParcelFeature(spatialFeatures, property, parsedAddress);
    if (bestSpatialFeature) {
      return bestSpatialFeature;
    }
  }

  const where = buildBrevardWhere(property, parsedAddress);
  const textParams = new URLSearchParams(baseParams);
  textParams.set("where", where);
  const textFeatures = await fetchParcelFeatures(textParams);
  return chooseBestParcelFeature(textFeatures, property, parsedAddress);
}

async function fetchParcelFeatures(params: URLSearchParams): Promise<ArcGisFeature[]> {
  const url = `${BREVARD_PARCEL_URL}?${params.toString()}`;
  const data = await fetchJson(url);
  if (data.error) {
    throw new Error(normalizeText((data.error as JsonRecord).message) || "Brevard parcel query failed.");
  }
  return (data.features as ArcGisFeature[] | undefined) ?? [];
}

async function lookupFemaFloodZone(
  coordinates: NonNullable<PropertyResearchPacket["coordinates"]>
): Promise<ArcGisFeature | undefined> {
  const params = new URLSearchParams({
    f: "json",
    where: "1=1",
    outFields: "FLD_ZONE,SFHA_TF,ZONE_SUBTY,STATIC_BFE,DFIRM_ID",
    returnGeometry: "false",
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    resultRecordCount: "1"
  });
  params.set(
    "geometry",
    JSON.stringify({
      x: coordinates.longitude,
      y: coordinates.latitude,
      spatialReference: { wkid: 4326 }
    })
  );
  const data = await fetchJson(`${FEMA_FLOOD_ZONE_URL}?${params.toString()}`);
  if (data.error) {
    throw new Error(normalizeText((data.error as JsonRecord).message) || "FEMA NFHL query failed.");
  }
  return ((data.features as ArcGisFeature[] | undefined) ?? [])[0];
}

async function fetchJson(url: string): Promise<JsonRecord> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as JsonRecord;
}

function pushParcelSuggestions(
  inspection: InspectionReport,
  attrs: ParcelAttributes | undefined,
  suggestions: PropertyResearchSuggestion[]
) {
  if (!attrs) {
    return;
  }

  const ownerName = [normalizeText(attrs.OWNER_NAME1), normalizeText(attrs.OWNER_NAME2)].filter(Boolean).join(" / ");
  const parcelId = normalizeText(attrs.PARCEL_ID || attrs.Name);
  const taxAccount = normalizeText(attrs.TaxAcct);
  const legalDescription = normalizeText(attrs.LEGAL_DESC);
  const livingArea = normalizeText(attrs.LIV_AREA);
  const propertyUse = normalizeText(attrs.USE_CODE_DESCRIPTION);

  if (ownerName) {
    suggestions.push(buildSuggestion(inspection, "ownerName", "Owner", ownerName, "brevard-gis-parcels", "high"));
  }
  if (parcelId) {
    suggestions.push(buildSuggestion(inspection, "parcelId", "Parcel ID", parcelId, "brevard-gis-parcels", "high"));
  }
  if (taxAccount) {
    suggestions.push(buildSuggestion(inspection, "taxAccount", "Tax account", taxAccount, "brevard-gis-parcels", "high"));
  }
  if (legalDescription) {
    suggestions.push(
      buildSuggestion(inspection, "legalDescription", "Legal description", legalDescription, "brevard-gis-parcels", "high")
    );
  }
  if (livingArea) {
    suggestions.push(buildSuggestion(inspection, "squareFeet", "Living area", livingArea, "brevard-gis-parcels", "medium"));
  }
  if (propertyUse) {
    suggestions.push(buildSuggestion(inspection, "propertyUse", "Property use", propertyUse, "brevard-gis-parcels", "high"));
  }
  suggestions.push(buildSuggestion(inspection, "county", "County", "Brevard", "brevard-gis-parcels", "high"));
}

function buildSuggestion(
  inspection: InspectionReport,
  field: keyof PropertyProfile,
  label: string,
  rawValue: string | number | null | undefined,
  sourceId: string,
  confidence: PropertyResearchSuggestion["confidence"]
): PropertyResearchSuggestion {
  const value = normalizeText(rawValue);
  const currentValue = normalizeText(inspection.property[field]);
  return {
    fieldPath: `property.${field}`,
    label,
    value,
    sourceId,
    confidence,
    applyable: Boolean(value) && value !== currentValue,
    currentValue: currentValue || undefined
  };
}

function suggestionValue(suggestions: PropertyResearchSuggestion[], fieldPath: PropertyResearchSuggestion["fieldPath"]) {
  return suggestions.find((suggestion) => suggestion.fieldPath === fieldPath && suggestion.value)?.value;
}

function getCoordinatesFromCensus(match: CensusMatch): PropertyResearchPacket["coordinates"] | undefined {
  const x = Number(match.coordinates?.x);
  const y = Number(match.coordinates?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }
  return {
    latitude: y,
    longitude: x
  };
}

function getCoordinatesFromParcel(feature: ArcGisFeature): PropertyResearchPacket["coordinates"] | undefined {
  if (Number.isFinite(feature.geometry?.x) && Number.isFinite(feature.geometry?.y)) {
    return {
      latitude: Number(feature.geometry?.y),
      longitude: Number(feature.geometry?.x)
    };
  }

  const rings = feature.geometry?.rings;
  const firstRing = rings?.[0];
  if (!firstRing?.length) {
    return undefined;
  }
  const totals = firstRing.reduce(
    (sum, point) => ({
      x: sum.x + Number(point[0] ?? 0),
      y: sum.y + Number(point[1] ?? 0)
    }),
    { x: 0, y: 0 }
  );
  return {
    latitude: totals.y / firstRing.length,
    longitude: totals.x / firstRing.length
  };
}

function getCountyFromCensus(match: CensusMatch): string {
  const counties = match.geographies?.Counties ?? [];
  const county = counties[0];
  return normalizeCountyName(county?.NAME || county?.BASENAME || county?.GEOID);
}

function normalizeCountyName(value: string | number | undefined): string {
  return normalizeText(value).replace(/\s+County$/i, "");
}

function parseStreetAddress(address: string) {
  const cleaned = normalizeText(address).replace(/[,#].*$/, "");
  const match = cleaned.match(/^(\d+[A-Z]?)\s+(.+)$/i);
  if (!match) {
    return { number: "", streetName: "", streetType: "" };
  }

  const streetParts = match[2].split(/\s+/);
  const streetType = streetParts[streetParts.length - 1] ?? "";
  const normalizedType = normalizeStreetType(streetType);
  const hasStreetType = Boolean(normalizedType);
  return {
    number: match[1],
    streetName: (hasStreetType ? streetParts.slice(0, -1) : streetParts).join(" "),
    streetType: normalizedType || streetType
  };
}

function buildBrevardWhere(
  property: PropertyProfile,
  parsedAddress: ReturnType<typeof parseStreetAddress>
): string {
  const clauses: string[] = [];
  if (parsedAddress.number) {
    clauses.push(`STREET_NUMBER='${sqlEscape(parsedAddress.number)}'`);
  }
  if (parsedAddress.streetName) {
    const streetWords = parsedAddress.streetName
      .split(/\s+/)
      .map((word) => word.replace(/[^A-Z0-9]/gi, ""))
      .filter((word) => word.length > 2)
      .slice(0, 2);
    for (const word of streetWords) {
      clauses.push(`UPPER(STREET_NAME) LIKE '%${sqlEscape(word.toUpperCase())}%'`);
    }
  }
  if (property.postalCode) {
    clauses.push(`ZIP_CODE='${sqlEscape(property.postalCode.slice(0, 5))}'`);
  }

  return clauses.length ? clauses.join(" AND ") : "1=0";
}

function chooseBestParcelFeature(
  features: ArcGisFeature[],
  property: PropertyProfile,
  parsedAddress: ReturnType<typeof parseStreetAddress>
): ArcGisFeature | undefined {
  const scored = features
    .map((feature) => {
      const attrs = feature.attributes as ParcelAttributes | undefined;
      let score = 0;
      if (normalizeText(attrs?.STREET_NUMBER) === normalizeText(parsedAddress.number)) {
        score += 6;
      }
      const parcelStreet = normalizeText(attrs?.STREET_NAME).toUpperCase();
      for (const word of parsedAddress.streetName.toUpperCase().split(/\s+/).filter(Boolean)) {
        if (parcelStreet.includes(word)) {
          score += 2;
        }
      }
      if (normalizeText(attrs?.ZIP_CODE).slice(0, 5) === normalizeText(property.postalCode).slice(0, 5)) {
        score += 3;
      }
      return { feature, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score ? scored[0].feature : features[0];
}

function isLikelyBrevard(property: PropertyProfile, county: string) {
  const city = property.city.toLowerCase();
  const zip = property.postalCode.slice(0, 5);
  return (
    property.state.toUpperCase() === "FL" &&
    (county.toLowerCase() === "brevard" ||
      ["32940", "32955", "32904", "32934", "32935", "32937", "32952", "32953"].includes(zip) ||
      ["viera", "melbourne", "rockledge", "cocoa", "merritt island", "satellite beach"].includes(city))
  );
}

function formatPropertyQuery(property: PropertyProfile): string {
  return [property.address, property.city, property.state, property.postalCode].filter(Boolean).join(", ");
}

function setSource(
  sources: PropertyResearchSource[],
  id: string,
  status: PropertyResearchSourceStatus,
  detail: string
) {
  const index = sources.findIndex((source) => source.id === id);
  if (index === -1) {
    return;
  }
  sources[index] = updateSource(sources[index], status, detail);
}

function updateSource(
  source: PropertyResearchSource,
  status: PropertyResearchSourceStatus,
  detail: string
): PropertyResearchSource {
  return {
    ...source,
    status,
    detail
  };
}

function classifyFetchError(error: unknown): PropertyResearchSourceStatus {
  const message = readableError(error).toLowerCase();
  return message.includes("failed to fetch") || message.includes("cors") ? "blocked" : "failed";
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "Lookup failed.";
}

function normalizeStreetType(value: string) {
  const type = value.toUpperCase().replace(/\./g, "");
  const map: Record<string, string> = {
    AVENUE: "AVE",
    BOULEVARD: "BLVD",
    CIRCLE: "CIR",
    COURT: "CT",
    DRIVE: "DR",
    LANE: "LN",
    PARKWAY: "PKWY",
    PLACE: "PL",
    ROAD: "RD",
    STREET: "ST",
    TERRACE: "TER",
    TRAIL: "TRL",
    WAY: "WAY"
  };
  return map[type] ?? (Object.values(map).includes(type) ? type : "");
}

function sqlEscape(value: string) {
  return value.replace(/'/g, "''");
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
