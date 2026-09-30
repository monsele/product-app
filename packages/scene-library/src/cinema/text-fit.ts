/**
 * ST-109 — deterministic text fitting for v2 compositions.
 *
 * Compositions never clip text: they choose the largest size at which the
 * text wraps within its box. Wrapping is estimated word by word with a
 * per-face average glyph width plus a safety margin, so the estimate errs
 * towards smaller type. Pure, so preview and render choose identical sizes.
 */

export type FitRequest = Readonly<{
  text: string;
  width: number;
  maxLines: number;
  maxSize: number;
  minSize: number;
  /** Average glyph width as a fraction of the font size. */
  glyphWidth: number;
  uppercase?: boolean;
  lineHeight?: number;
  /** Optional height budget; the size must fit it too. */
  maxHeight?: number;
}>;

export type FitResult = Readonly<{
  fontSize: number;
  lines: number;
  fits: boolean;
}>;

const safety = 1.08;

/**
 * Relative advance of a character against the face's average. Capitals and
 * wide letters are much wider than the average, so a single average width
 * underestimates text such as acronyms and headings in title case.
 */
function relativeAdvance(character: string): number {
  if (/[MWmw@%]/u.test(character)) return 1.45;
  if (/[A-Z]/u.test(character)) return 1.22;
  if (/[fijlrtI.,:;'!|]/u.test(character)) return 0.6;
  if (/[0-9]/u.test(character)) return 1.15;
  return 1;
}

function wordAdvance(word: string, uppercase: boolean): number {
  let total = 0;
  for (const character of word)
    total += uppercase ? relativeAdvance(character.toUpperCase()) : relativeAdvance(character);
  return total;
}

/** Greedy word-wrap line count at a given font size. */
export function estimateLines(
  text: string,
  fontSize: number,
  width: number,
  glyphWidth: number,
  uppercase = false,
): number {
  const character = fontSize * glyphWidth * safety;
  const space = fontSize * 0.28;
  const words = text.trim().split(/\s+/u).filter((word) => word.length > 0);
  if (words.length === 0) return 1;
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const wordWidth = wordAdvance(word, uppercase) * character;
    if (wordWidth > width) {
      // `overflow-wrap: anywhere` breaks an over-long word across lines.
      const extra = Math.ceil(wordWidth / width);
      lines += used === 0 ? extra - 1 : extra;
      used = wordWidth % width;
      continue;
    }
    const needed = used === 0 ? wordWidth : used + space + wordWidth;
    if (needed <= width) used = needed;
    else {
      lines += 1;
      used = wordWidth;
    }
  }
  return lines;
}

/** Estimated width of text set on one line. */
export function estimateLineWidth(
  text: string,
  fontSize: number,
  glyphWidth: number,
  uppercase = false,
): number {
  const words = text.trim().split(/\s+/u).filter((word) => word.length > 0);
  return (
    words.reduce((total, word) => total + wordAdvance(word, uppercase), 0) * fontSize * glyphWidth * safety +
    Math.max(0, words.length - 1) * fontSize * 0.28
  );
}

/**
 * Extra margin the longest word must clear. A word alone on a line has no
 * spaces to absorb estimate error, and when it overruns the browser breaks it
 * mid-word, which reads far worse than slightly smaller type.
 */
const wordSafety = 1.12;

function longestWordFits(request: FitRequest, size: number): boolean {
  const character = size * request.glyphWidth * safety * wordSafety;
  return request.text
    .split(/[\s-]+/u)
    .every((word) => wordAdvance(word, request.uppercase ?? false) * character <= request.width);
}

export function fitText(request: FitRequest): FitResult {
  const lineHeight = request.lineHeight ?? 1.15;
  for (let size = request.maxSize; size >= request.minSize; size -= 2) {
    const lines = estimateLines(
      request.text,
      size,
      request.width,
      request.glyphWidth,
      request.uppercase,
    );
    const heightOk =
      request.maxHeight === undefined || lines * size * lineHeight <= request.maxHeight;
    if (lines <= request.maxLines && heightOk && longestWordFits(request, size))
      return Object.freeze({ fontSize: size, lines, fits: true });
  }
  const lines = estimateLines(
    request.text,
    request.minSize,
    request.width,
    request.glyphWidth,
    request.uppercase,
  );
  return Object.freeze({
    fontSize: request.minSize,
    lines,
    fits:
      lines <= request.maxLines &&
      (request.maxHeight === undefined ||
        lines * request.minSize * lineHeight <= request.maxHeight),
  });
}

/** One size for a group of texts that must share a type size. */
export function fitTextGroup(
  texts: readonly string[],
  request: Omit<FitRequest, "text">,
): FitResult {
  let fontSize = request.maxSize;
  let lines = 1;
  let fits = true;
  for (const text of texts) {
    const result = fitText({ ...request, text, maxSize: fontSize });
    fontSize = Math.min(fontSize, result.fontSize);
    lines = Math.max(lines, result.lines);
    fits = fits && result.fits;
  }
  return Object.freeze({ fontSize, lines, fits });
}
