import { videoTheme } from "@avlp/design-system/video-theme";

export type LayoutMeasurement = Readonly<{
  availableHeight: number;
  estimatedHeight: number;
  fits: boolean;
  lineCount: number;
}>;

export type TextFitOptions = Readonly<{
  fontSize: number;
  lineHeight: number;
  maxLines: number;
  width: number;
}>;

export type SceneTextBlock = Readonly<{
  path: string;
  value: string;
}>;

export type SceneContentMeasurement = Readonly<{
  availableHeight: number;
  estimatedHeight: number;
  fits: boolean;
  firstOverflowPath?: string;
}>;

const averageCharacterWidthRatio = 0.55;

export function measureTextLayout(
  text: string,
  options: TextFitOptions,
): LayoutMeasurement {
  const charactersPerLine = Math.max(
    1,
    Math.floor(options.width / (options.fontSize * averageCharacterWidthRatio)),
  );
  const lineCount = Math.max(1, Math.ceil(text.length / charactersPerLine));
  const estimatedHeight = lineCount * options.fontSize * options.lineHeight;
  const availableHeight =
    options.maxLines * options.fontSize * options.lineHeight;
  return Object.freeze({
    availableHeight,
    estimatedHeight,
    fits: lineCount <= options.maxLines,
    lineCount,
  });
}

export function measureSceneText(text: string): LayoutMeasurement {
  return measureTextLayout(text, {
    fontSize: videoTheme.typography.bodySize,
    lineHeight: videoTheme.typography.lineHeight,
    maxLines: 6,
    width:
      videoTheme.canvas.width -
      videoTheme.safeAreas.body.left -
      videoTheme.safeAreas.body.right,
  });
}

export function measureSceneContent(
  blocks: readonly SceneTextBlock[],
): SceneContentMeasurement {
  const availableHeight =
    videoTheme.canvas.height -
    videoTheme.safeAreas.body.top -
    videoTheme.safeAreas.body.bottom;
  let estimatedHeight = 0;
  let firstOverflowPath: string | undefined;
  for (const [index, block] of blocks.entries()) {
    const options: TextFitOptions = {
      fontSize:
        block.path === "title"
          ? videoTheme.typography.titleSize
          : videoTheme.typography.bodySize,
      lineHeight: videoTheme.typography.lineHeight,
      maxLines: 6,
      width:
        videoTheme.canvas.width -
        videoTheme.safeAreas.body.left -
        videoTheme.safeAreas.body.right,
    };
    const measurement = measureTextLayout(block.value, options);
    estimatedHeight += measurement.estimatedHeight;
    if (index > 0) estimatedHeight += videoTheme.spacing.sm;
    if (!measurement.fits && firstOverflowPath === undefined)
      firstOverflowPath = block.path;
  }
  if (estimatedHeight > availableHeight && firstOverflowPath === undefined)
    firstOverflowPath = blocks.at(-1)?.path;
  return Object.freeze({
    availableHeight,
    estimatedHeight,
    fits: firstOverflowPath === undefined,
    ...(firstOverflowPath === undefined ? {} : { firstOverflowPath }),
  });
}
