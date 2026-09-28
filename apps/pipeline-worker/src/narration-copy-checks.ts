import { narrationCopiedPassageMinimumRun } from "@avlp/schemas";

/**
 * Copied-passage and quotation rules shared by full narration and single-block
 * transforms. Both work on words: a narration sentence may not reuse a run of
 * `narrationCopiedPassageMinimumRun` consecutive source words unless it is a
 * marked quotation, and a marked quotation must quote its cited block exactly.
 */

function splitWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * Length of the longest run of consecutive words a sentence shares verbatim
 * with the source, counted only when it reaches the copied-passage minimum
 * (shorter shared runs return 0). A run is extended one source position at a
 * time, so it measures what was actually copied rather than every later word
 * that happens to occur somewhere in the source.
 */
export function longestCopiedWordRun(
  sentence: string,
  sourceText: string,
): number {
  const sentenceWords = splitWords(sentence);
  const sourceWords = splitWords(sourceText);
  const minimum = narrationCopiedPassageMinimumRun;
  if (sentenceWords.length < minimum || sourceWords.length < minimum) return 0;
  const positionsByNGram = new Map<string, number[]>();
  for (let index = 0; index + minimum <= sourceWords.length; index += 1) {
    const key = sourceWords.slice(index, index + minimum).join(" ");
    const positions = positionsByNGram.get(key);
    if (positions === undefined) positionsByNGram.set(key, [index]);
    else positions.push(index);
  }
  let longest = 0;
  for (let index = 0; index + minimum <= sentenceWords.length; index += 1) {
    const positions = positionsByNGram.get(
      sentenceWords.slice(index, index + minimum).join(" "),
    );
    if (positions === undefined) continue;
    for (const start of positions) {
      let length = minimum;
      while (
        index + length < sentenceWords.length &&
        start + length < sourceWords.length &&
        sentenceWords[index + length] === sourceWords[start + length]
      )
        length += 1;
      longest = Math.max(longest, length);
    }
  }
  return longest;
}

/** Lowercased words with punctuation and quotation marks removed. */
function comparableWords(text: string): string[] {
  return splitWords(
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[‘’‛′]/g, "'")
      .replace(/[^\p{L}\p{N}'\s]/gu, " ")
      .replace(/(^|\s)'+|'+(?=\s|$)/g, " "),
  );
}

/**
 * True when every quoted span of the sentence (the text inside its double
 * quotation marks, or the whole sentence when it has none) appears word for
 * word and in order in the cited source text. Case, punctuation and quotation
 * marks are ignored; wording is not.
 */
export function quotationAppearsInSource(
  sentence: string,
  sourceText: string,
): boolean {
  const source = ` ${comparableWords(sourceText).join(" ")} `;
  const spans = [
    ...sentence.matchAll(/["“”]([^"“”]+)["“”]/g),
  ].map((match) => match[1]!);
  const candidates = spans.length === 0 ? [sentence] : spans;
  return candidates.every((span) => {
    const words = comparableWords(span);
    return words.length > 0 && source.includes(` ${words.join(" ")} `);
  });
}
