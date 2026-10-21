import { ref, computed, onBeforeUnmount, onMounted, type ComputedRef, type Ref } from 'vue';
import type { KDialogSize } from '../dialog/memory';
import { DIALOG_SIZE_PRESETS, dialogViewportScale, type DialogSizePreset } from './dialogSizePreset';

/** 弹窗几何快照：width/height 持久化，offsetX/offsetY 不持久化（见字段注释）。 */
export interface DialogGeometry {
  width: number;
  height: number;
  /** 相对居中位置的偏移量（px），拖动标题栏产生；不持久化。 */
  offsetX: number;
  offsetY: number;
}

export interface UseDialogGeometryOptions {
  /** 可选自适应档位；不传时保留旧像素几何与记忆行为。 */
  sizePreset?: DialogSizePreset;
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  minHeight: number;
  /** 普通态宽度硬上限；缺省 1200。仍会同时受 maxWidthRatio 约束。 */
  maxWidth?: number;
  /** 普通态宽度视口比例上限；缺省 0.92。 */
  maxWidthRatio?: number;
  /** 普通态高度硬上限；缺省不设硬上限。仍会同时受 maxHeightRatio 约束。 */
  maxHeight?: number;
  /** 普通态高度视口比例上限；缺省 0.9。 */
  maxHeightRatio?: number;
  /** 最大化态宽/高占视口比例；缺省 0.96 / 0.92。 */
  maximizedWidthRatio?: number;
  maximizedHeightRatio?: number;
  /**
   * 标题栏高度兜底值（px）：拖动钳制要求「标题栏整条留在视口内」（见 clampOffset），高度优先在标题栏
   * pointerdown 时实测 `currentTarget` 的 getBoundingClientRect().height；量不到（脱离 DOM 派发的合成
   * 事件等）才用本值。缺省 48。
   */
  headerHeight?: number;
  /** 读回持久化尺寸（自适应档位还读 wr/hr；位置不持久化）。未提供 = 不记忆。 */
  load?: () => KDialogSize | null;
  /** 写入持久化尺寸。未提供 = 不记忆。 */
  save?: (size: { width: number; height: number; wr?: number; hr?: number }) => void;
  /** 尺寸或最大化状态变化时通知宿主（画布等调用方可据此重新 fit）。 */
  onSizeChange?: (
    size: { width: number; height: number },
    reason: 'resize' | 'maximize' | 'restore' | 'reset' | 'viewport'
  ) => void;
}

export type DialogResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface UseDialogGeometryReturn {
  /** 绑到弹窗根元素的 style（width/height/transform）。最大化时走 96vw/92vh。 */
  style: ComputedRef<Record<string, string>>;
  maximized: ComputedRef<boolean>;
  /** 自动全屏与手动最大化分开；Esc 只还原手动态，自动状态由视口决定。 */
  autoMaximized: ComputedRef<boolean>;
  manualMaximized: Ref<boolean>;
  toggleMaximize(): void;
  /** 从最大化还原到记忆尺寸；未最大化时是 no-op（供 Esc 调用方安全调用）。 */
  restore(): void;
  /** 标题栏 pointerdown：开始拖动移动。 */
  onHeaderPointerDown(e: PointerEvent): void;
  /** 缩放手柄 pointerdown：缺省为右下角，兼容旧调用方。 */
  onResizePointerDown(e: PointerEvent, direction?: DialogResizeDirection): void;
  /** 弹窗每次打开时调用：位置归零、尺寸读回记忆值、退出最大化。 */
  reset(): void;
  /** 运行中换档：按当前（响应式）边界重取尺寸，位置偏移保持（中心点不变）。 */
  reapply(): void;
  /** 拖动产生的相对居中偏移（px），compact 档沿用以保持中心点不变。 */
  offsetX: Ref<number>;
  offsetY: Ref<number>;
  /** 当前实际尺寸，供调用方换算分栏比例。 */
  size: ComputedRef<{ width: number; height: number }>;
}

/** 标题栏高度兜底值（px）：见 UseDialogGeometryOptions.headerHeight。 */
const DEFAULT_HEADER_HEIGHT_PX = 48;

/** 弹窗几何状态与交互逻辑（不含渲染）。 */
export function useDialogGeometry(
  optionsOrGetter: UseDialogGeometryOptions | (() => UseDialogGeometryOptions)
): UseDialogGeometryReturn {
  const opt = (): UseDialogGeometryOptions =>
    typeof optionsOrGetter === 'function' ? optionsOrGetter() : optionsOrGetter;
  // window 尺寸本身不响应；独立 ref 让全屏 size 与自动状态在 resize 时同步刷新。
  const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
  const preset = () => opt().sizePreset ? DIALOG_SIZE_PRESETS[opt().sizePreset!] : undefined;
  const maxWidthRatio = opt().maxWidthRatio ?? 0.92;
  const maxHeightRatio = opt().maxHeightRatio ?? 0.9;
  const maximizedWidthRatio = opt().maximizedWidthRatio ?? 0.96;
  const maximizedHeightRatio = opt().maximizedHeightRatio ?? 0.92;
  const onSizeChange: UseDialogGeometryOptions['onSizeChange'] = (size, reason) => opt().onSizeChange?.(size, reason);

  function finiteOr(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function numericOr(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
  }

  /**
   * 上限专用取值：与 finiteOr 的区别是**接受 Infinity**。
   * 🔴 finiteOr 用 Number.isFinite 判定，传 Number.POSITIVE_INFINITY 会被判为"无效"而退回 fallback——
   * 调用方写 `maxWidth: Infinity`（意为"不要硬顶"）时会静默拿回 1200 硬顶，改了等于没改。
   * 上限语义下 Infinity 是合法值（表示无硬顶，实际仍受 vw 比例上限约束），故单独一个取值函数。
   */
  function upperBoundOr(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && !Number.isNaN(value) && value > 0 ? value : fallback;
  }

  /** 宽度钳制：上限 min(maxWidth ?? 1200, 92vw)（比例与硬顶都可由调用方覆盖）。 */
  function clampWidth(w: number): number {
    const o = opt();
    const maxWidth = Math.min(
      upperBoundOr(o.maxWidth, 1200) * (preset() ? dialogViewportScale(viewport.value.width) : 1),
      viewport.value.width * finiteOr(maxWidthRatio, 0.92)
    );
    return Math.min(maxWidth, Math.max(o.minWidth, numericOr(w, o.defaultWidth)));
  }
  /** 高度钳制：上限 min(maxHeight ?? ∞, 90vh)（同上，比例与硬顶都可由调用方覆盖）。 */
  function clampHeight(h: number): number {
    const o = opt();
    const maxHeight = Math.min(
      upperBoundOr(o.maxHeight, Number.POSITIVE_INFINITY) * (preset() ? dialogViewportScale(viewport.value.width) : 1),
      viewport.value.height * finiteOr(maxHeightRatio, 0.9)
    );
    return Math.min(maxHeight, Math.max(o.minHeight, numericOr(h, o.defaultHeight)));
  }

  /** 原始用户比例不被小屏钳制改写，放大视口可恢复；无记忆时默认随视口重算。 */
  let remembered: { wr?: number; hr?: number } | null = null;
  const positive = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

  function preferredSize(): { width: number; height: number } {
    const o = opt();
    const p = preset();
    return {
      width: clampWidth(remembered?.wr
        ? remembered.wr * viewport.value.width
        : Math.max(o.defaultWidth, p ? viewport.value.width * p.wr : 0)),
      height: clampHeight(remembered?.hr
        ? remembered.hr * viewport.value.height
        : Math.max(o.defaultHeight, p ? viewport.value.height * p.hr : 0))
    };
  }

  /** 新比例优先；旧像素按当前视口建立原始比例，仅有档位时启用新记忆语义。 */
  function loadSize(): { width: number; height: number } {
    const o = opt();
    const loaded = o.load?.() ?? null;
    remembered = null;
    if (preset()) {
      const wr = positive(loaded?.wr) ? loaded.wr : positive(loaded?.width) ? loaded.width / viewport.value.width : undefined;
      const hr = positive(loaded?.hr) ? loaded.hr : positive(loaded?.height) ? loaded.height / viewport.value.height : undefined;
      if (wr || hr) remembered = { wr, hr };
      return preferredSize();
    }
    return {
      width: clampWidth(finiteOr(loaded?.width, o.defaultWidth)),
      height: clampHeight(finiteOr(loaded?.height, o.defaultHeight))
    };
  }

  const initial = loadSize();
  const width = ref(initial.width);
  const height = ref(initial.height);
  /** 相对居中位置的偏移量：不持久化，弹窗每次打开都从 0 开始（见 reset）。 */
  const offsetX = ref(0);
  const offsetY = ref(0);
  const manualMaximized = ref(false);
  const autoMaximized = computed(() => Boolean(preset()) && (
    opt().minWidth > viewport.value.width * 0.98 || opt().minHeight > viewport.value.height * 0.96
  ));
  const maximized = computed(() => manualMaximized.value || autoMaximized.value);

  /**
   * 标题栏实测高度（px）：标题栏 pointerdown 时按 currentTarget 实际渲染高度刷新（见 onHeaderPointerDown），
   * 拖动前先用 headerHeight 兜底值。各消费方标题栏高度不一（动作设计器固定 53px、表达式壳按 padding 撑开），
   * 所以不能写死常量。
   */
  let headerHeight = finiteOr(opt().headerHeight, DEFAULT_HEADER_HEIGHT_PX);

  /**
   * 把拖动偏移钳制到「标题栏整条留在视口内」：弹窗以 position:fixed + left/top:50% + translate(-50%,-50%)
   * 居中为基准，offsetX/offsetY 是在此基准上再叠加的像素偏移，故弹窗左边缘 = (vw-w)/2 + offsetX、
   * 顶边 = (vh-h)/2 + offsetY。
   * - 水平：标题栏横贯弹窗全宽，要求左边缘 ≥ 0 且右边缘 ≤ vw（弹窗宽度本就受视口比例上限约束，恒能放下）；
   * - 竖直：顶边 ≥ 0（不许把标题栏拖出上沿），且 顶边 + 标题栏高 ≤ vh（不许把标题栏拖出下沿；
   *   弹窗主体可以垂到视口下方，用户仍抓得住标题栏拖回来）。
   * 🔴 此前只保证弹窗任一侧留 40px 在视口内，标题栏可被整条拖出视口、只剩一角主体露着；
   * 用户 2026-09-07 要求「title 区域应保持在窗口内、不应被拖到窗口外」后改为本口径。
   * 区间反转（弹窗比视口还宽 / 标题栏比视口还高的极端小窗）时贴左/上沿，至少保证标题文字可见。
   */
  function clampOffset(x: number, y: number): { x: number; y: number } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minOffsetX = (width.value - vw) / 2; // 左边缘 = 0
    const maxOffsetX = (vw - width.value) / 2; // 右边缘 = vw
    const minOffsetY = (height.value - vh) / 2; // 顶边 = 0
    const maxOffsetY = (vh + height.value) / 2 - headerHeight; // 顶边 + 标题栏高 = vh
    const clampAxis = (value: number, min: number, max: number): number =>
      min > max ? min : Math.min(max, Math.max(min, value));
    return { x: clampAxis(x, minOffsetX, maxOffsetX), y: clampAxis(y, minOffsetY, maxOffsetY) };
  }

  const style = computed<Record<string, string>>(() => {
    if (maximized.value) {
      // 最大化：尺寸走视口相对单位，位置固定居中（拖动偏移在最大化态下不生效，还原后才重新叠加）。
      return {
        width: `${(autoMaximized.value ? 1 : finiteOr(maximizedWidthRatio, 0.96)) * 100}vw`,
        height: `${(autoMaximized.value ? 1 : finiteOr(maximizedHeightRatio, 0.92)) * 100}vh`,
        transform: 'translate(-50%, -50%)'
      };
    }
    return {
      width: `${width.value}px`,
      height: `${height.value}px`,
      transform: `translate(calc(-50% + ${offsetX.value}px), calc(-50% + ${offsetY.value}px))`
    };
  });

  /** 当前实际渲染尺寸（px）：最大化态换算 vw/vh 为具体像素，供调用方按此换算分栏比例。 */
  const size = computed(() => {
    if (maximized.value) {
      return {
        width: viewport.value.width * (autoMaximized.value ? 1 : finiteOr(maximizedWidthRatio, 0.96)),
        height: viewport.value.height * (autoMaximized.value ? 1 : finiteOr(maximizedHeightRatio, 0.92))
      };
    }
    return { width: width.value, height: height.value };
  });

  function toggleMaximize(): void {
    manualMaximized.value = !manualMaximized.value;
    onSizeChange?.(size.value, manualMaximized.value ? 'maximize' : 'restore');
  }

  function restore(): void {
    if (!manualMaximized.value) return;
    // width/height 全程存的都是"记忆尺寸"（最大化态只是换了一套 style 展示，没有改写它们），
    // 故还原只需退出最大化标记，style 会自动回落到 width.value/height.value。
    manualMaximized.value = false;
    onSizeChange?.(size.value, 'restore');
  }

  // 当前活跃的 window 级拖拽监听器：拖拽/缩放进行中才非空，供组件卸载时兜底清理
  // （正常路径下 pointerup 已经自行摘除，这里覆盖"拖到一半组件被卸载"的边界情形）。
  let activeMove: ((e: PointerEvent) => void) | null = null;
  let activeUp: (() => void) | null = null;

  function teardownActiveDrag(): void {
    if (activeMove) window.removeEventListener('pointermove', activeMove);
    if (activeUp) window.removeEventListener('pointerup', activeUp);
    activeMove = null;
    activeUp = null;
  }

  /** 标题栏 pointerdown：开始拖动移动。最大化时禁止（先还原再拖）。 */
  function onHeaderPointerDown(e: PointerEvent): void {
    if (maximized.value) return;
    e.preventDefault();
    // currentTarget 即绑定 pointerdown 的标题栏元素（消费方把本函数直接或经一层转发绑在标题栏上，
    // 转发是同步的、仍在派发期内，currentTarget 有效）：按实际渲染高度刷新钳制用的标题栏高度。
    const header = e.currentTarget as HTMLElement | null;
    headerHeight = finiteOr(header?.getBoundingClientRect?.().height, headerHeight);
    const startX = e.clientX;
    const startY = e.clientY;
    const startOffsetX = offsetX.value;
    const startOffsetY = offsetY.value;
    const move = (ev: PointerEvent) => {
      const next = clampOffset(startOffsetX + (ev.clientX - startX), startOffsetY + (ev.clientY - startY));
      offsetX.value = next.x;
      offsetY.value = next.y;
    };
    const up = () => {
      teardownActiveDrag();
      // 位置不持久化（DialogGeometry.offsetX/offsetY 字段注释），拖动移动结束不调用 save——
      // save 的签名也只收 width/height，语义上就没有"记住位置"这回事。
    };
    activeMove = move;
    activeUp = up;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** 任意边/角手柄 pointerdown：开始缩放。最大化时禁止（先还原再缩放）。 */
  function onResizePointerDown(e: PointerEvent, direction: DialogResizeDirection = 'se'): void {
    if (maximized.value) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = width.value;
    const startHeight = height.value;
    const startOffsetX = offsetX.value;
    const startOffsetY = offsetY.value;
    let resized = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let nextWidth = startWidth;
      let nextHeight = startHeight;
      if (direction.includes('e')) nextWidth = clampWidth(startWidth + dx);
      if (direction.includes('w')) nextWidth = clampWidth(startWidth - dx);
      if (direction.includes('s')) nextHeight = clampHeight(startHeight + dy);
      if (direction.includes('n')) nextHeight = clampHeight(startHeight - dy);
      const sizeChanged = nextWidth !== width.value || nextHeight !== height.value;
      if (sizeChanged) {
        resized = true;
        if (preset()) {
          // 只改实际变动轴的意图；另一轴可能正被小屏下限夹住，不得顺手覆盖其原始比例。
          remembered = {
            wr: nextWidth !== width.value
              ? nextWidth / viewport.value.width
              : remembered?.wr ?? width.value / viewport.value.width,
            hr: nextHeight !== height.value
              ? nextHeight / viewport.value.height
              : remembered?.hr ?? height.value / viewport.value.height
          };
        }
      }
      width.value = nextWidth;
      height.value = nextHeight;
      offsetX.value =
        startOffsetX +
        (direction.includes('w')
          ? (startWidth - nextWidth) / 2
          : direction.includes('e')
            ? (nextWidth - startWidth) / 2
            : 0);
      offsetY.value =
        startOffsetY +
        (direction.includes('n')
          ? (startHeight - nextHeight) / 2
          : direction.includes('s')
            ? (nextHeight - startHeight) / 2
            : 0);
      const next = clampOffset(offsetX.value, offsetY.value);
      offsetX.value = next.x;
      offsetY.value = next.y;
      onSizeChange?.(size.value, 'resize');
    };
    const up = () => {
      teardownActiveDrag();
      // 仅点击手柄没有改变尺寸，不得把默认自适应误记为用户手动尺寸；旧像素模式保持原行为。
      if (preset() && !resized) return;
      // 拖拽结束才落盘一次：不在 move 里逐帧写 localStorage（避免高频 IO），也不在没有 save 时空跑。
      opt().save?.({ width: width.value, height: height.value, ...(preset() ? remembered : {}) });
    };
    activeMove = move;
    activeUp = up;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function reset(): void {
    viewport.value = { width: window.innerWidth, height: window.innerHeight };
    offsetX.value = 0;
    offsetY.value = 0;
    manualMaximized.value = false;
    const loaded = loadSize();
    width.value = loaded.width;
    height.value = loaded.height;
    onSizeChange?.(size.value, 'reset');
  }

  /**
   * 运行中换档：打开状态下默认/最小/最大尺寸或密度变化后，按新边界重取尺寸（记忆尺寸优先，
   * 否则新默认值，再统一钳制）。位置偏移不动 —— 窗口以「居中 + 偏移」定位，尺寸变化时中心点天然不变，
   * 只把偏移按新尺寸重新钳制回视口内。不退出最大化（调用方按需先 restore）。
   */
  function reapply(): void {
    const loaded = loadSize();
    width.value = loaded.width;
    height.value = loaded.height;
    const next = clampOffset(offsetX.value, offsetY.value);
    offsetX.value = next.x;
    offsetY.value = next.y;
    onSizeChange?.(size.value, 'reset');
  }

  function onViewportResize(): void {
    viewport.value = { width: window.innerWidth, height: window.innerHeight };
    if (preset()) {
      // 即使正全屏也更新普通态尺寸：手动还原/自动退出时立即得到正确的新视口尺寸。
      const preferred = preferredSize();
      width.value = preferred.width;
      height.value = preferred.height;
    } else if (!maximized.value) {
      width.value = clampWidth(width.value);
      height.value = clampHeight(height.value);
    }
    if (!maximized.value) {
      const next = clampOffset(offsetX.value, offsetY.value);
      offsetX.value = next.x;
      offsetY.value = next.y;
    }
    onSizeChange?.(size.value, 'viewport');
  }

  onMounted(() => window.addEventListener('resize', onViewportResize));

  onBeforeUnmount(() => {
    teardownActiveDrag();
    window.removeEventListener('resize', onViewportResize);
  });

  return {
    style,
    maximized,
    autoMaximized,
    manualMaximized,
    toggleMaximize,
    restore,
    onHeaderPointerDown,
    onResizePointerDown,
    reset,
    reapply,
    offsetX,
    offsetY,
    size
  };
}
