export type DialogSizePreset = 'M' | 'L' | 'XL';

export const DIALOG_SIZE_PRESETS = {
  M: { width: 830, height: 620, wr: 0.60, hr: 0.72, minWidth: 720, minHeight: 480, maxWidth: 960, maxHeight: 760 },
  L: { width: 1000, height: 620, wr: 0.72, hr: 0.80, minWidth: 860, minHeight: 560, maxWidth: 1280, maxHeight: 880 },
  XL: { width: 1200, height: 800, wr: 0.86, hr: 0.86, minWidth: 960, minHeight: 620, maxWidth: 1600, maxHeight: 1000 }
} as const;

/** 与宿主 uiScale 共享 2200 CSS px 断点；浏览器缩放自然改变 CSS 视口。 */
export function dialogViewportScale(width: number): number {
  return width > 2200 ? 1.125 : 1;
}
