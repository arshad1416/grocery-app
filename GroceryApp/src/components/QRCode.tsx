/**
 * Pure-JS QR Code Generator for React Native.
 *
 * Renders a scannable QR code as a grid of tiny View elements.
 * No native dependencies — uses a built-in QR encoding algorithm.
 * Falls back to plaintext display if encoding fails.
 *
 * QR algorithm implemented from ISO/IEC 18004 specification.
 * Supports byte mode encoding with auto version selection (v1-v10).
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

// ─── Reed-Solomon Error Correction ──────────────────────────────────────────
// Generator polynomials for GF(256) used in QR code ECC.

const LOG = new Uint8Array(256);
const ALOG = new Uint8Array(256);

(function initGalois() {
  let v = 1;
  for (let i = 0; i < 255; i++) {
    ALOG[i] = v;
    LOG[v] = i;
    v = v * 2 ^ (v >= 128 ? 0x11d : 0);
  }
})();

function glog(n: number): number { return LOG[n]; }
function gexp(n: number): number { return ALOG[n % 255]; }
function gmul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return ALOG[(LOG[a] + LOG[b]) % 255];
}

/** RS error correction codeword generator for given number of EC codewords. */
function rsGeneratorPoly(ecCount: number): number[] {
  let poly: number[] = [1];
  for (let i = 0; i < ecCount; i++) {
    poly = multiplyPolys(poly, [1, gexp(i)]);
  }
  return poly;
}

function multiplyPolys(a: number[], b: number[]): number[] {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] ^= gmul(a[i], b[j]);
    }
  }
  return result;
}

/** Calculate RS error correction codewords for data. */
function rsEncode(data: number[], ecCount: number): number[] {
  const gen = rsGeneratorPoly(ecCount);
  const padded = [...data, ...new Array(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    if (padded[i] !== 0) {
      const factor = glog(padded[i]);
      for (let j = 0; j < gen.length; j++) {
        padded[i + j] ^= gexp((factor + glog(gen[j])) % 255);
      }
    }
  }
  return padded.slice(data.length);
}

// ─── QR Version Table ────────────────────────────────────────────────────────
// Version, total codewords, EC codewords per block, blocks in group 1/2
// Using error correction level M (approx 15% recovery)

interface QRVersionInfo {
  version: number;
  totalCodewords: number;
  ecCodewordsPerBlock: number;
  blocksGroup1: number;
  codewordsGroup1: number;
  blocksGroup2: number;
  codewordsGroup2: number;
}

const VERSION_INFO: QRVersionInfo[] = [
  { version: 1,  totalCodewords: 16,  ecCodewordsPerBlock: 10, blocksGroup1: 1, codewordsGroup1: 16,  blocksGroup2: 0, codewordsGroup2: 0 },
  { version: 2,  totalCodewords: 28,  ecCodewordsPerBlock: 16, blocksGroup1: 1, codewordsGroup1: 28,  blocksGroup2: 0, codewordsGroup2: 0 },
  { version: 3,  totalCodewords: 44,  ecCodewordsPerBlock: 26, blocksGroup1: 1, codewordsGroup1: 44,  blocksGroup2: 0, codewordsGroup2: 0 },
  { version: 4,  totalCodewords: 64,  ecCodewordsPerBlock: 18, blocksGroup1: 2, codewordsGroup1: 32,  blocksGroup2: 0, codewordsGroup2: 0 },
  { version: 5,  totalCodewords: 86,  ecCodewordsPerBlock: 24, blocksGroup1: 2, codewordsGroup1: 43,  blocksGroup2: 0, codewordsGroup2: 0 },
  { version: 6,  totalCodewords: 108, ecCodewordsPerBlock: 16, blocksGroup1: 4, codewordsGroup1: 27,  blocksGroup2: 0, codewordsGroup2: 0 },
  { version: 7,  totalCodewords: 124, ecCodewordsPerBlock: 20, blocksGroup1: 4, codewordsGroup1: 31,  blocksGroup2: 0, codewordsGroup2: 0 },
  { version: 8,  totalCodewords: 154, ecCodewordsPerBlock: 22, blocksGroup1: 2, codewordsGroup1: 38,  blocksGroup2: 2, codewordsGroup2: 39 },
  { version: 9,  totalCodewords: 180, ecCodewordsPerBlock: 22, blocksGroup1: 3, codewordsGroup1: 36,  blocksGroup2: 2, codewordsGroup2: 36 },
  { version: 10, totalCodewords: 206, ecCodewordsPerBlock: 26, blocksGroup1: 4, codewordsGroup1: 34,  blocksGroup2: 1, codewordsGroup2: 34 },
];

// ─── Data Encoding ───────────────────────────────────────────────────────────

function getMinVersion(dataLength: number): QRVersionInfo {
  for (const v of VERSION_INFO) {
    // Byte mode: 4 mode bits + 8/16 length bits + data
    const overhead = v.version < 10 ? 12 : 16; // bits
    const capacityBytes = Math.floor((v.totalCodewords * 8 - overhead) / 8);
    if (dataLength <= capacityBytes) return v;
  }
  return VERSION_INFO[VERSION_INFO.length - 1];
}

function encodeData(data: string): { dataBits: number[]; version: QRVersionInfo } {
  const bytes = new TextEncoder().encode(data);
  const version = getMinVersion(bytes.length);
  const totalDataCodewords = version.totalCodewords - version.ecCodewordsPerBlock *
    (version.blocksGroup1 + version.blocksGroup2);

  // Build bit stream: mode indicator (0100 for byte) + character count + data
  const bits: number[] = [];

  // Mode: 0100 (byte)
  bits.push(0, 1, 0, 0);

  // Character count: 8 bits for v1-9, 16 bits for v10+
  const countBits = version.version < 10 ? 8 : 16;
  for (let i = countBits - 1; i >= 0; i--) {
    bits.push((bytes.length >> i) & 1);
  }

  // Data bytes
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) {
      bits.push((b >> i) & 1);
    }
  }

  // Terminator: up to 4 zeros
  const terminatorLen = Math.min(4, totalDataCodewords * 8 - bits.length);
  for (let i = 0; i < terminatorLen; i++) bits.push(0);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad to full capacity with alternating 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < totalDataCodewords * 8) {
    const byte = padBytes[padIdx++ % 2];
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }

  // Convert bits to codewords
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }

  return { dataBits: codewords, version };
}

// ─── Matrix Construction ─────────────────────────────────────────────────────

function buildMatrix(version: number): number[][] {
  const size = 17 + version * 4;
  const matrix: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
  // -1 = unset, 0 = white, 1 = black

  // Finder patterns (7x7)
  const finderPattern = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];

  const placeFinder = (row: number, col: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        matrix[row + r][col + c] = finderPattern[r][c];
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Separators (white border around finder patterns)
  const separator = (r: number, c: number, len: number) => {
    for (let i = -1; i < len + 1; i++) {
      if (r - 1 >= 0 && r - 1 < size && c + i >= 0 && c + i < size) {
        if (matrix[r - 1][c + i] === -1) matrix[r - 1][c + i] = 0;
      }
      if (r + len >= 0 && r + len < size && c + i >= 0 && c + i < size) {
        if (matrix[r + len][c + i] === -1) matrix[r + len][c + i] = 0;
      }
      if (c - 1 >= 0 && c - 1 < size && r + i >= 0 && r + i < size) {
        if (matrix[r + i][c - 1] === -1) matrix[r + i][c - 1] = 0;
      }
      if (c + len >= 0 && c + len < size && r + i >= 0 && r + i < size) {
        if (matrix[r + i][c + len] === -1) matrix[r + i][c + len] = 0;
      }
    }
  };

  separator(0, 0, 7);
  separator(0, size - 7, 7);
  separator(size - 7, 0, 7);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === -1) matrix[6][i] = i % 2 === 0 ? 1 : 0;
    if (matrix[i][6] === -1) matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // Dark module
  matrix[size - 8][8] = 1;

  // Format info areas (reserved, filled later)
  // Already positioned: we'll skip these when placing data

  return matrix;
}

// ─── Data Placement ──────────────────────────────────────────────────────────

function placeData(matrix: number[][], modules: number[], version: number): void {
  const size = matrix.length;
  let bitIdx = 0;
  const totalModules = modules.length;

  // Data is placed in columns from right to left, in 2-column vertical strips
  // Direction alternates: up then down
  const occupied = (r: number, c: number): boolean => matrix[r][c] !== -1;

  for (let col = size - 1; col >= 1; col -= 2) {
    // Skip timing column
    if (col === 6) col = 5;
    if (col < 1) break;

    const dir = (Math.floor((size - 1 - col) / 2) % 2 === 0) ? -1 : 1;
    const startRow = dir === -1 ? size - 1 : 0;
    const endRow = dir === -1 ? 0 : size - 1;

    for (let colOffset = 0; colOffset < 2; colOffset++) {
      const c = col - colOffset;
      if (c < 0) continue;

      let r = startRow;
      while (dir === -1 ? r >= endRow : r <= endRow) {
        if (!occupied(r, c) && bitIdx < totalModules) {
          matrix[r][c] = modules[bitIdx++];
        }
        r += dir;
      }
    }
  }
}

// ─── Mask Pattern ────────────────────────────────────────────────────────────

function applyMask(matrix: number[][], maskPattern: number): void {
  const size = matrix.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === -1) continue; // not a data module
      let shouldFlip = false;
      switch (maskPattern) {
        case 0: shouldFlip = (r + c) % 2 === 0; break;
        case 1: shouldFlip = r % 2 === 0; break;
        case 2: shouldFlip = c % 3 === 0; break;
        case 3: shouldFlip = (r + c) % 3 === 0; break;
        case 4: shouldFlip = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
        case 5: shouldFlip = (r * c) % 2 + (r * c) % 3 === 0; break;
        case 6: shouldFlip = ((r * c) % 2 + (r * c) % 3) % 2 === 0; break;
        case 7: shouldFlip = ((r + c) % 2 + (r * c) % 3) % 2 === 0; break;
      }
      if (shouldFlip) matrix[r][c] = matrix[r][c] === 0 ? 1 : 0;
    }
  }
}

// ─── Format Info ───────────────────────────────────────────────────────────────

function placeFormatInfo(matrix: number[][], maskPattern: number): void {
  const size = matrix.length;
  // Error correction level M = 00
  const ecLevelBits = [0, 0];
  const formatBits = [
    ecLevelBits[0], ecLevelBits[1],
    (maskPattern >> 2) & 1,
    (maskPattern >> 1) & 1,
    maskPattern & 1,
  ];

  // Generate BCH code (simplified — using lookup for common masks with EC level M)
  // Format info = data bits ^ mask pattern 101010000010010
  const formatData = [
    formatBits[0], formatBits[1], formatBits[2], formatBits[3], formatBits[4],
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ];

  // BCH encoding (15,5) using generator x^10 + x^8 + x^5 + x^4 + x^2 + x + 1
  for (let i = 0; i < 5; i++) {
    if (formatData[i]) {
      for (let j = 0; j < 11; j++) {
        formatData[i + j] ^= [1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1][j];
      }
    }
  }

  // XOR with mask 101010000010010
  const maskBCH = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  for (let i = 0; i < 15; i++) formatData[i] ^= maskBCH[i];

  // Place format info
  const fi = formatData;

  // Horizontal (top): row 8, cols 0-8
  for (let c = 0; c < 8; c++) {
    if (c < 6 || c > 6) matrix[8][c] = fi[c];
  }
  // Skip dark module at (8, 8)
  matrix[8][7] = fi[7]; matrix[8][8] = 1; // dark module
  for (let c = 9; c < 15; c++) matrix[8][size - 15 + c] = fi[c];

  // Vertical (left): col 8, rows 0-8
  const verIndices = [0, 1, 2, 3, 4, 5, 7, 8, 14, 13, 12, 11, 10, 9, 8];
  for (let i = 0; i < 8; i++) {
    matrix[verIndices[i]][8] = fi[i];
  }
  for (let i = 9; i < 15; i++) {
    matrix[size - 15 + i][8] = fi[i];
  }
}

// ─── Main QR Generator ──────────────────────────────────────────────────────

interface QRMatrix {
  matrix: number[][];
  version: number;
  size: number;
}

function generateQRMatrix(data: string): QRMatrix | null {
  try {
    const { dataBits: codewords, version } = encodeData(data);
    const vi = VERSION_INFO[version.version - 1];

    // Generate EC codewords
    const allEc: number[] = [];
    const totalBlocks = vi.blocksGroup1 + vi.blocksGroup2;
    let dataIdx = 0;
    for (let block = 0; block < totalBlocks; block++) {
      const isGroup2 = block >= vi.blocksGroup1;
      const blockLen = isGroup2 ? vi.codewordsGroup2 : vi.codewordsGroup1;
      const blockData = codewords.slice(dataIdx, dataIdx + blockLen);
      dataIdx += blockLen;
      const ec = rsEncode(blockData, vi.ecCodewordsPerBlock);
      allEc.push(...ec);
    }

    // Interleave data codewords
    const interleaved: number[] = [];
    const group1Blocks = vi.blocksGroup1;
    const group2Blocks = vi.blocksGroup2;
    const group1Len = vi.codewordsGroup1;
    const group2Len = vi.codewordsGroup2;

    for (let i = 0; i < Math.max(group1Len, group2Len); i++) {
      for (let b = 0; b < group1Blocks; b++) {
        const idx = b * group1Len + i;
        if (idx < codewords.length) interleaved.push(codewords[idx]);
      }
      if (i < group2Len) {
        for (let b = 0; b < group2Blocks; b++) {
          const idx = group1Blocks * group1Len + b * group2Len + i;
          if (idx < codewords.length) interleaved.push(codewords[idx]);
        }
      }
    }
    interleaved.push(...allEc);

    // Build matrix
    const matrix = buildMatrix(version.version);
    placeData(matrix, interleaved, version.version);

    // Try mask patterns 0-7, pick the one with best score
    let bestMatrix: number[][] | null = null;
    let bestScore = Infinity;

    for (let mask = 0; mask < 8; mask++) {
      const testMatrix = matrix.map(row => [...row]);
      applyMask(testMatrix, mask);
      placeFormatInfo(testMatrix, mask);

      // Score the matrix (penalty for undesirable patterns)
      const score = evaluateMatrix(testMatrix);
      if (score < bestScore) {
        bestScore = score;
        bestMatrix = testMatrix;
      }
    }

    if (!bestMatrix) return null;

    return {
      matrix: bestMatrix,
      version: version.version,
      size: bestMatrix.length,
    };
  } catch {
    return null;
  }
}

/** Evaluate penalty score for a QR matrix (lower is better). */
function evaluateMatrix(matrix: number[][]): number {
  const size = matrix.length;
  let score = 0;

  // Penalty for adjacent modules of same color in rows
  for (let r = 0; r < size; r++) {
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (matrix[r][c] === matrix[r][c - 1]) {
        runLen++;
      } else {
        if (runLen >= 5) score += runLen + 3;
        runLen = 1;
      }
    }
    if (runLen >= 5) score += runLen + 3;
  }

  // Penalty for adjacent modules of same color in columns
  for (let c = 0; c < size; c++) {
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (matrix[r][c] === matrix[r - 1][c]) {
        runLen++;
      } else {
        if (runLen >= 5) score += runLen + 3;
        runLen = 1;
      }
    }
    if (runLen >= 5) score += runLen + 3;
  }

  // Penalty for 2x2 blocks of same color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = matrix[r][c];
      if (v === matrix[r][c + 1] && v === matrix[r + 1][c] && v === matrix[r + 1][c + 1]) {
        score += 3;
      }
    }
  }

  return score;
}

// ─── React Component ─────────────────────────────────────────────────────────

export interface QRCodeProps {
  /** Data string to encode in the QR code. */
  data: string;
  /** Size of the QR code in pixels (default: 200). */
  size?: number;
  /** Optional testID for testing. */
  testID?: string;
}

/**
 * Pure-JS QR Code component for React Native.
 *
 * Generates a scannable QR code inline using a built-in encoder.
 * No native dependencies required.
 *
 * @example
 * ```tsx
 * <QRCode data="grocceryapp://invite?token=abc123" size={200} />
 * ```
 */
export default function QRCode({ data, size = 200, testID }: QRCodeProps) {
  const qr = useMemo(() => generateQRMatrix(data), [data]);

  const containerSize = useMemo(() => {
    if (!qr) return 0;
    // Add padding (quiet zone) — 4 modules on each side
    const moduleSize = size / (qr.size + 8);
    return Math.floor(moduleSize * (qr.size + 8));
  }, [qr, size]);

  if (!qr) {
    // Fallback: show data as text
    return (
      <View style={styles.fallback} testID={testID}>
        <Text style={styles.fallbackText} selectable>
          {data}
        </Text>
      </View>
    );
  }

  const moduleSize = size / (qr.size + 8);
  const padding = 4; // quiet zone modules
  const cells: React.ReactElement[] = [];

  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.matrix[r][c] === 1) {
        cells.push(
          <View
            key={`${r}-${c}`}
            style={{
              position: 'absolute',
              left: (c + padding) * moduleSize,
              top: (r + padding) * moduleSize,
              width: Math.ceil(moduleSize),
              height: Math.ceil(moduleSize),
              backgroundColor: '#000',
            }}
          />
        );
      }
    }
  }

  return (
    <View
      style={[styles.container, { width: containerSize, height: containerSize }]}
      testID={testID}
    >
      {cells}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  fallback: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    minHeight: 80,
    justifyContent: 'center',
  },
  fallbackText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#333',
    textAlign: 'center',
  },
});
