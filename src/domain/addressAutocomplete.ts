const ARCGIS_GEOCODE_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer";

export interface AddressSuggestion {
  text: string;
  magicKey: string;
  isCollection: boolean;
}

export interface AddressCandidate {
  matchAddress: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  county: string;
  latitude: number;
  longitude: number;
  score: number;
  source: string;
}

interface ArcGisSuggestion {
  text?: string;
  magicKey?: string;
  isCollection?: boolean;
}

interface ArcGisCandidate {
  address?: string;
  score?: number;
  location?: {
    x?: number;
    y?: number;
  };
  attributes?: Record<string, string | number | undefined>;
}

export async function suggestUsAddresses(
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 4) {
    return [];
  }

  const url = new URL(`${ARCGIS_GEOCODE_URL}/suggest`);
  url.searchParams.set("f", "json");
  url.searchParams.set("text", trimmed);
  url.searchParams.set("countryCode", "USA");
  url.searchParams.set("category", "Address");
  url.searchParams.set("maxSuggestions", "6");

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) {
    throw new Error(`Address search failed: ${response.status}`);
  }

  const data = (await response.json()) as { suggestions?: ArcGisSuggestion[] };
  return (data.suggestions ?? [])
    .filter((suggestion): suggestion is Required<ArcGisSuggestion> =>
      Boolean(suggestion.text && suggestion.magicKey)
    )
    .map((suggestion) => ({
      text: suggestion.text,
      magicKey: suggestion.magicKey,
      isCollection: Boolean(suggestion.isCollection)
    }));
}

export async function resolveUsAddressSuggestion(
  suggestion: AddressSuggestion,
  signal?: AbortSignal
): Promise<AddressCandidate> {
  const url = new URL(`${ARCGIS_GEOCODE_URL}/findAddressCandidates`);
  url.searchParams.set("f", "json");
  url.searchParams.set("SingleLine", suggestion.text);
  url.searchParams.set("magicKey", suggestion.magicKey);
  url.searchParams.set("countryCode", "USA");
  url.searchParams.set("maxLocations", "1");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("forStorage", "false");

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) {
    throw new Error(`Address resolution failed: ${response.status}`);
  }

  const data = (await response.json()) as { candidates?: ArcGisCandidate[] };
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error("No address candidate returned.");
  }

  return normalizeCandidate(candidate);
}

function normalizeCandidate(candidate: ArcGisCandidate): AddressCandidate {
  const attributes = candidate.attributes ?? {};
  const latitude = Number(candidate.location?.y ?? attributes.Y ?? attributes.DisplayY);
  const longitude = Number(candidate.location?.x ?? attributes.X ?? attributes.DisplayX);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Address candidate did not include coordinates.");
  }

  return {
    matchAddress: cleanText(attributes.Match_addr || attributes.LongLabel || candidate.address),
    street: cleanText(attributes.StAddr || attributes.ShortLabel || candidate.address),
    city: cleanText(attributes.City || attributes.PlaceName),
    state: cleanState(attributes.RegionAbbr || attributes.Region),
    postalCode: cleanText(attributes.Postal),
    county: cleanCounty(attributes.Subregion),
    latitude,
    longitude,
    score: Number(candidate.score ?? attributes.Score ?? 0),
    source: "ArcGIS World Geocoding Service"
  };
}

function cleanCounty(value: unknown): string {
  return cleanText(value).replace(/\s+County$/i, "");
}

function cleanState(value: unknown): string {
  const cleaned = cleanText(value);
  const stateMap: Record<string, string> = {
    Alabama: "AL",
    Alaska: "AK",
    Arizona: "AZ",
    Arkansas: "AR",
    California: "CA",
    Colorado: "CO",
    Connecticut: "CT",
    Delaware: "DE",
    Florida: "FL",
    Georgia: "GA",
    Hawaii: "HI",
    Idaho: "ID",
    Illinois: "IL",
    Indiana: "IN",
    Iowa: "IA",
    Kansas: "KS",
    Kentucky: "KY",
    Louisiana: "LA",
    Maine: "ME",
    Maryland: "MD",
    Massachusetts: "MA",
    Michigan: "MI",
    Minnesota: "MN",
    Mississippi: "MS",
    Missouri: "MO",
    Montana: "MT",
    Nebraska: "NE",
    Nevada: "NV",
    "New Hampshire": "NH",
    "New Jersey": "NJ",
    "New Mexico": "NM",
    "New York": "NY",
    "North Carolina": "NC",
    "North Dakota": "ND",
    Ohio: "OH",
    Oklahoma: "OK",
    Oregon: "OR",
    Pennsylvania: "PA",
    "Rhode Island": "RI",
    "South Carolina": "SC",
    "South Dakota": "SD",
    Tennessee: "TN",
    Texas: "TX",
    Utah: "UT",
    Vermont: "VT",
    Virginia: "VA",
    Washington: "WA",
    "West Virginia": "WV",
    Wisconsin: "WI",
    Wyoming: "WY",
    "District of Columbia": "DC"
  };

  return cleaned.length === 2 ? cleaned.toUpperCase() : stateMap[cleaned] ?? cleaned.toUpperCase();
}

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
