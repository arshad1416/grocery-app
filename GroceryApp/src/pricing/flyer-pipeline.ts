/**
 * Price Subsystem — Flyer Scanning Pipeline.
 *
 * Three-stage pipeline for processing flyer images:
 *   1. stripExif()   — Strip EXIF metadata before any processing
 *   2. runExtraction() — Pass to the configured FlyerExtractor
 *   3. confidenceGate() — Filter/sort by confidence threshold
 *
 * Stage 1: Static pipeline functions with mock extractor support.
 * Real EXIF stripping uses a library; in Stage 1 we simulate it.
 */

import type { ScannedFlyerPrice, FlyerExtractor, FlyerPipelineResult } from './flyer-types';

// ─── Confidence Threshold ────────────────────────────────────────────────────

/**
 * Confidence threshold for automatic acceptance.
 * Prices below this threshold are routed to a user-confirmation path.
 */
export const CONFIDENCE_THRESHOLD = 0.6;

// ─── Stage 1: EXIF Stripping ─────────────────────────────────────────────────

/**
 * Strip EXIF metadata from an image before processing.
 *
 * In Stage 1 this is a simulated no-op that returns the URI unchanged.
 * A real implementation would use a library (e.g. exifr, jpeg-exif)
 * to remove EXIF data from JPEG/PNG files.
 *
 * Critical rule: EXIF must be stripped before any extraction.
 *
 * @param imageUri - URI of the captured flyer image
 * @returns URI of the EXIF-stripped image (or original in Stage 1)
 */
export async function stripExif(imageUri: string): Promise<string> {
  // Stage 1: Simulated EXIF stripping
  // In Stage 2+, this will:
  //   1. Read the image file
  //   2. Strip EXIF orientation/location/camera metadata
  //   3. Return the cleaned image URI

  // Placeholder: for now we return the image URI as-is
  // to keep the pipeline functional without external deps.
  return imageUri;
}

// ─── Stage 2: Extraction ─────────────────────────────────────────────────────

/**
 * Run the extractor on an image to get scanned flyer prices.
 *
 * @param imageUri - URI of the EXIF-stripped image
 * @param extractor - The FlyerExtractor implementation (mock in Stage 1)
 * @returns Array of ScannedFlyerPrice entries
 */
export async function runExtraction(
  imageUri: string,
  extractor: FlyerExtractor,
): Promise<ScannedFlyerPrice[]> {
  return extractor.extract(imageUri);
}

// ─── Stage 3: Confidence Gate ───────────────────────────────────────────────

/**
 * Filter results by confidence threshold.
 *
 * - Prices with confidence >= 0.6 pass through unchanged.
 * - Prices with confidence < 0.6 are still returned but flagged
 *   so the caller can route them to a user-confirmation path.
 *
 * @param prices - Raw extracted prices
 * @returns Object with `accepted` (auto-approve) and `needsReview` arrays
 */
export function confidenceGate(
  prices: ScannedFlyerPrice[],
): { accepted: ScannedFlyerPrice[]; needsReview: ScannedFlyerPrice[] } {
  const accepted: ScannedFlyerPrice[] = [];
  const needsReview: ScannedFlyerPrice[] = [];

  for (const price of prices) {
    if (price.confidence >= CONFIDENCE_THRESHOLD) {
      accepted.push(price);
    } else {
      needsReview.push(price);
    }
  }

  return { accepted, needsReview };
}

// ─── Image Discard ───────────────────────────────────────────────────────────

/**
 * Mark an image as discarded after extraction.
 *
 * Critical rule: Images must be discarded after extraction
 * to prevent re-processing and to manage memory.
 *
 * In Stage 1 this is a no-op that returns a discarded marker.
 * In Stage 2+ this will actually delete the temporary image file.
 *
 * @param imageUri - URI of the image to discard
 * @returns true if the image was successfully discarded
 */
export async function discardImage(imageUri: string): Promise<boolean> {
  // Stage 1: simulated discard
  // In Stage 2+: fs.unlink or equivalent
  return true;
}

// ─── Pipeline Runner ─────────────────────────────────────────────────────────

/**
 * Run a single flyer image through the full pipeline:
 *   stripExif → runExtraction → confidenceGate → discardImage
 *
 * @param imageUri - URI of the captured flyer image
 * @param extractor - The FlyerExtractor implementation
 * @returns FlyerPipelineResult with processed prices
 */
export async function processFlyerImage(
  imageUri: string,
  extractor: FlyerExtractor,
): Promise<FlyerPipelineResult> {
  try {
    // 1. Strip EXIF
    const cleanImage = await stripExif(imageUri);

    // 2. Run extraction
    const rawPrices = await runExtraction(cleanImage, extractor);

    // 3. Confidence gate
    const { accepted, needsReview } = confidenceGate(rawPrices);

    // 4. Discard the image
    await discardImage(imageUri);

    return {
      imageUri,
      prices: [...accepted, ...needsReview],
      discarded: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      imageUri,
      prices: [],
      discarded: false,
      error: message,
    };
  }
}
