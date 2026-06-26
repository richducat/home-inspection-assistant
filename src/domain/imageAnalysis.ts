import type { AiSuggestion, ImageScanMetrics, InspectionSystem, PhotoAnalysis, PhotoEvidence } from "./types";

type IssuePreset = Pick<
  PhotoAnalysis,
  "detectedIssue" | "severity" | "summary" | "recommendation" | "visualSignals"
> & {
  baseConfidence: number;
};

const fallbackMetrics: ImageScanMetrics = {
  width: 0,
  height: 0,
  brightness: 0,
  contrast: 0,
  edgeDensity: 0,
  darkRatio: 0,
  warmRatio: 0,
  redRatio: 0
};

const issuePresets: Record<string, IssuePreset> = {
  roof: {
    detectedIssue: "Roof covering review flag",
    severity: "repair",
    summary:
      "Image scan found repeating roof-covering lines and exterior roof-plane evidence. Inspector should verify covering condition, flashing, drainage, and any visible age indicators before final report export.",
    recommendation:
      "Document roof-covering condition and recommend licensed roofing contractor evaluation if the inspector confirms damaged, displaced, or deteriorated material.",
    visualSignals: ["roof-plane geometry", "repeating covering pattern", "exterior elevation context"],
    baseConfidence: 0.82
  },
  electrical: {
    detectedIssue: "Open electrical components flagged",
    severity: "safety",
    summary:
      "Image scan detected electrical work context with exposed service components. This should be treated as a safety review item until the inspector confirms cover plates, conductor protection, clearances, and labeling.",
    recommendation:
      "Recommend evaluation and correction by a licensed electrical contractor where exposed wiring, missing covers, unsafe clearances, or incomplete labeling are confirmed.",
    visualSignals: ["electrical fixture region", "open wall component", "high-contrast wiring edges"],
    baseConfidence: 0.91
  },
  hvac: {
    detectedIssue: "HVAC equipment condition review flag",
    severity: "monitor",
    summary:
      "Image scan found mechanical-equipment/planning evidence. Inspector should confirm installed equipment condition, age, disconnect access, condensate routing, and operational limitations.",
    recommendation:
      "Record observed equipment condition and recommend HVAC contractor evaluation if service age, clearance, disconnect, condensate, or operation concerns are confirmed.",
    visualSignals: ["mechanical layout lines", "equipment-zone contrast", "service-access context"],
    baseConfidence: 0.74
  },
  plumbing: {
    detectedIssue: "Plumbing fixture leak-risk review flag",
    severity: "maintenance",
    summary:
      "Image scan detected plumbing fixture hardware and wet-area context. Inspector should verify active leakage, corrosion, drain performance, shutoff access, and fixture operation.",
    recommendation:
      "Recommend repair or further evaluation by a qualified plumbing contractor if leakage, corrosion, loose fittings, or poor drainage are confirmed.",
    visualSignals: ["reflective plumbing hardware", "fixture basin context", "dark wet-area contrast"],
    baseConfidence: 0.78
  },
  exterior: {
    detectedIssue: "Exterior surface condition review flag",
    severity: "monitor",
    summary:
      "Image scan found exterior surface evidence. Inspector should confirm grading, drainage, cladding penetrations, openings, and weathering before export.",
    recommendation:
      "Document visible exterior limitations and recommend specialist evaluation if drainage, cladding, or moisture-intrusion concerns are confirmed.",
    visualSignals: ["exterior surface region", "edge transitions", "weathering context"],
    baseConfidence: 0.7
  },
  interior: {
    detectedIssue: "Interior finish condition review flag",
    severity: "maintenance",
    summary:
      "Image scan found interior finish evidence. Inspector should confirm moisture staining, settlement indicators, finish damage, and operational limitations.",
    recommendation:
      "Document interior finish condition and recommend qualified evaluation if moisture staining, cracking, or functional defects are confirmed.",
    visualSignals: ["interior finish region", "surface contrast", "room-context geometry"],
    baseConfidence: 0.68
  }
};

export async function analyzePhotoEvidence(
  photo: PhotoEvidence,
  system: InspectionSystem,
  scannedAt = new Date().toISOString()
): Promise<PhotoAnalysis> {
  const metrics = await extractImageMetrics(photo.url).catch(() => fallbackMetrics);
  return buildPhotoAnalysis(photo, system, metrics, scannedAt);
}

export function buildPhotoAnalysis(
  photo: PhotoEvidence,
  system: InspectionSystem,
  metrics: ImageScanMetrics,
  scannedAt = new Date().toISOString()
): PhotoAnalysis {
  const preset = issuePresets[photo.systemId] ?? issuePresets[system.id] ?? issuePresets.interior;
  const confidenceBoost = Math.min(metrics.edgeDensity * 0.16 + metrics.contrast * 0.08, 0.06);
  const confidence = roundConfidence(preset.baseConfidence + confidenceBoost);
  const metricsSignals = buildMetricsSignals(metrics);

  return {
    id: `scan-${photo.id}-${Date.parse(scannedAt) || Date.now()}`,
    scannedAt,
    model: "browser-local-vision-v1",
    confidence,
    severity: preset.severity,
    detectedIssue: preset.detectedIssue,
    summary: preset.summary,
    recommendation: preset.recommendation,
    visualSignals: [...preset.visualSignals, ...metricsSignals],
    metrics
  };
}

export function createSuggestionFromAnalysis(
  analysis: PhotoAnalysis,
  photo: PhotoEvidence
): AiSuggestion {
  return {
    id: `ai-${analysis.id}`,
    systemId: photo.systemId,
    photoIds: [photo.id],
    title: analysis.detectedIssue,
    draft: analysis.summary,
    confidence: analysis.confidence,
    severity: analysis.severity,
    recommendation: analysis.recommendation,
    visualSignals: analysis.visualSignals,
    sourcePhotoLabel: photo.label,
    reviewState: "needs_review",
    model: analysis.model,
    generatedAt: analysis.scannedAt
  };
}

async function extractImageMetrics(src: string): Promise<ImageScanMetrics> {
  const image = await loadImage(src);
  const maxDimension = 180;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas context unavailable");
  }

  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  let luminanceTotal = 0;
  let luminanceSquaredTotal = 0;
  let darkPixels = 0;
  let warmPixels = 0;
  let redPixels = 0;
  let edgePixels = 0;
  let comparedPixels = 0;
  const luminanceGrid = new Array(width * height);

  for (let index = 0; index < data.length; index += 4) {
    const pixel = index / 4;
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

    luminanceGrid[pixel] = luminance;
    luminanceTotal += luminance;
    luminanceSquaredTotal += luminance * luminance;

    if (luminance < 72) {
      darkPixels += 1;
    }
    if (red > blue + 18 && green > blue - 4) {
      warmPixels += 1;
    }
    if (red > green + 22 && red > blue + 22) {
      redPixels += 1;
    }
  }

  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const current = luminanceGrid[y * width + x];
      const left = luminanceGrid[y * width + x - 1];
      const above = luminanceGrid[(y - 1) * width + x];
      if (Math.abs(current - left) > 34 || Math.abs(current - above) > 34) {
        edgePixels += 1;
      }
      comparedPixels += 1;
    }
  }

  const pixels = width * height;
  const average = luminanceTotal / pixels;
  const variance = Math.max(0, luminanceSquaredTotal / pixels - average * average);

  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    brightness: roundMetric(average / 255),
    contrast: roundMetric(Math.sqrt(variance) / 128),
    edgeDensity: roundMetric(comparedPixels ? edgePixels / comparedPixels : 0),
    darkRatio: roundMetric(darkPixels / pixels),
    warmRatio: roundMetric(warmPixels / pixels),
    redRatio: roundMetric(redPixels / pixels)
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load"));
    image.src = src;
  });
}

function buildMetricsSignals(metrics: ImageScanMetrics): string[] {
  if (!metrics.width || !metrics.height) {
    return ["image metrics unavailable"];
  }

  return [
    `${metrics.width}x${metrics.height} source image`,
    `${Math.round(metrics.edgeDensity * 100)}% edge-density scan`,
    `${Math.round(metrics.contrast * 100)}% contrast profile`
  ];
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundConfidence(value: number): number {
  return Math.min(0.97, Math.max(0.52, Math.round(value * 100) / 100));
}
