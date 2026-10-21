/**
 * KLayerStack 弹层栈。
 *
 * 职责：
 *  1. 宿主单例：每个 KDialog（及后续 KDrawer）打开时入栈、关闭时出栈，栈按入栈顺序分配 z-index，
 *     从 2000 起递增，非模态与模态同一序列；
 *  2. 全局只装一个 keydown(Escape) 捕获监听，Esc 只派给栈顶一层，非栈顶层不响应；
 *  3. 栈顶层之上若存在可见的 Naive 弹层（下拉 / 气泡 / 日期面板等，位于 `.v-binder-follower-container`），
 *     本次 Esc 完整交给 Naive 去收起，栈不处理、不拦截；
 *  3b. 栈顶层之上若存在未登记进栈、可见的 Naive 模态（未迁移的嵌套弹窗），同样让位（过渡规则，迁移完成后可收紧）；
 *  4. 未迁移的自绘弹层可通过 useLayer() 登记进栈，与已迁移的层一起正确仲裁。
 *
 * 做法参照插件 kimpo-action-designer 的 actionDesignerEscapeArbitration.ts / ActionDesignerDialog.vue：
 *  - 监听绑在 window 捕获阶段，栈顶层命中后 stopImmediatePropagation，避免 Esc 漏给画布全局快捷键或宿主弹窗；
 *  - 「是否有更上层 Naive 浮层」只统计真正可见（display / visibility / 尺寸）的候选，且必须在本层之上，
 *    宿主祖先弹窗不算；
 *  - 非栈顶层完全不触碰事件。
 *
 * 单例存放：栈状态挂在 globalThis 的 Symbol.for 键上，宿主与（万一重复打包的）插件副本共用同一个栈，
 * 避免两份栈各自装监听、各自分配 z-index。
 */
import { getCurrentInstance, onBeforeUnmount, ref, type Ref } from 'vue';

/** 层级起点：与 Naive 的 zindexable 起点一致，也是 dialog-layer.ts 所述 Naive 默认对话框层级。 */
export const LAYER_BASE_Z_INDEX = 2000;

/** useLayer / push 的登记选项。 */
export interface LayerOptions {
  /**
   * 本层成为栈顶且 Esc 未被 Naive 弹层消费时调用。
   * 返回值忽略；本层自行决定「还原最大化 → 关闭（dirty 先确认）」等顺序。
   */
  onEscape: (event: KeyboardEvent) => void;
  /**
   * 可选：返回本层**实际**使用的 z-index。
   * 未迁移的自绘弹层有自己固定的层级（如 2200），这里据实上报，栈按它判断 Naive 弹层是否在本层之上，
   * 并保证后入栈的层级高于它。不提供则用栈分配的值。
   */
  getZIndex?: () => number | undefined;
  /**
   * 可选：返回本层最外层 DOM 元素（模态取 `.n-modal-container`，非模态取层容器）。
   * 提供后，位于该元素内部的 Naive 弹层一律算「在本层之上」——Naive 会把模态内的下拉/气泡传送进模态 body，
   * 其 z-index 受模态层叠上下文约束，不能单靠数值比较判断。
   */
  getElement?: () => HTMLElement | null | undefined;
}

/** 栈内条目（内部结构，经 useLayer 的句柄间接操作）。 */
interface LayerEntry {
  readonly id: symbol;
  readonly options: LayerOptions;
  /** 入栈时栈分配的 z-index，响应式，供组件绑定到 style。 */
  readonly zIndex: Ref<number>;
  /** 暂时不参与 Esc 仲裁（例如窗口被最小化成胶囊）：派发时跳过，由下一层栈顶接手。 */
  skipped: boolean;
  /** 本层正在处理一个必须独占 Esc 的上层交互（例如关闭前的二次确认框）：栈既不派发也不拦截，Esc 原样放行。 */
  passthrough: boolean;
}

/** 判断元素当前是否真实可见（display / visibility / 尺寸）。 */
function isVisibleElement(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** 读取元素有效 z-index：沿祖先找第一个数值型 z-index（follower 内容上有，container 通常是 auto）。 */
function effectiveZIndex(el: HTMLElement): number | null {
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    const value = Number.parseInt(window.getComputedStyle(node).zIndex, 10);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

/** Naive 弹层候选：vueuc 的 follower 内容（下拉、气泡、日期面板、级联面板等都经它渲染）。 */
const NAIVE_OVERLAY_SELECTOR = '.v-binder-follower-container .v-binder-follower-content';

/**
 * 栈顶层之上是否有可见的 Naive 弹层。
 * - tooltip（`.n-tooltip`）只是悬浮提示，不响应 Esc，不算；
 * - 在 getElement() 返回的元素之内：算（模态内弹层传送进模态 body）；
 * - 否则比较 z-index：高于本层算；相等时看 DOM 顺序（排在本层之后算）；无法取得数值时保守按「算」处理。
 */
function hasNaiveOverlayAbove(entry: LayerEntry): boolean {
  const root = entry.options.getElement?.() ?? null;
  const layerZ = entry.options.getZIndex?.() ?? entry.zIndex.value;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(NAIVE_OVERLAY_SELECTOR));
  return candidates.some(el => {
    if (el.querySelector('.n-tooltip') || el.classList.contains('n-tooltip')) return false;
    if (!isVisibleElement(el) && !Array.from(el.querySelectorAll<HTMLElement>('*')).some(isVisibleElement)) return false;
    if (root && root.contains(el)) return true;
    const z = effectiveZIndex(el);
    if (z === null) return true;
    if (z > layerZ) return true;
    if (z === layerZ) {
      if (!root) return true;
      return Boolean(root.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    }
    return false;
  });
}

/** 未登记的 Naive 模态 / 对话框容器（NModal、NDialog 的传送容器）。 */
const NAIVE_MODAL_CONTAINER_SELECTOR = '.n-modal-container, .n-dialog-container';
/** 容器内「真正的窗口内容」：只有遮罩（`.n-modal-mask`）或空容器不算可见模态。 */
const NAIVE_MODAL_CONTENT_SELECTOR = '.n-modal, .n-dialog, [role="dialog"], [role="alertdialog"]';

/**
 * 栈顶层之上是否有**未登记进栈**、可见的 Naive 模态。
 *
 * 背景：尚未迁移到 KDialog / useLayer 的嵌套弹窗（如表达式编辑器包内的 SourceTreePicker、
 * FieldMultiPickDialog、JoinDesignerDialog）仍是各自的 NModal，默认 close-on-esc。栈在 window 捕获阶段
 * 先收到 Esc，若直接派给栈顶 KDialog，会把外层误关；因此栈顶层之上存在这类模态时本次 Esc 让给它自己。
 * 🔴 过渡规则：待这些嵌套弹窗全部迁移（登记进栈）后可收紧（删除本规则，只留已登记层的仲裁）。
 *
 * 判定：
 *  - 候选 = `.n-modal-container` / `.n-dialog-container`，容器未被 display/visibility 隐藏，
 *    且内含有尺寸的可见窗口内容（非仅遮罩）；
 *  - 已登记层的元素排除（KDialog 自己用 NModal 渲染，其容器由 getElement 上报）；
 *  - 栈顶层最外层元素的祖先容器排除；
 *  - 必须在栈顶层之上：DOM 顺序位于栈顶层元素之后，或有效 z-index 高于本层
 *    （栈顶层没有 getElement 时只能比 z-index，且无法取得数值时保守按「不算」，避免误吞 Esc）。
 */
function hasUnregisteredNaiveModalAbove(entry: LayerEntry, entries: readonly LayerEntry[]): boolean {
  const topRoot = entry.options.getElement?.() ?? null;
  const layerZ = entry.options.getZIndex?.() ?? entry.zIndex.value;
  // 已登记层的最外层元素集合
  const registeredRoots = entries.map(e => e.options.getElement?.() ?? null).filter((el): el is HTMLElement => Boolean(el));
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(NAIVE_MODAL_CONTAINER_SELECTOR));
  return candidates.some(el => {
    if (registeredRoots.some(root => root === el)) return false;
    if (topRoot && el.contains(topRoot)) return false;
    // 容器本身是无尺寸的 fixed 外壳，不能按尺寸判断，只看 display / visibility；真正的可见性看窗口内容
    const containerStyle = window.getComputedStyle(el);
    if (containerStyle.display === 'none' || containerStyle.visibility === 'hidden') return false;
    const content = Array.from(el.querySelectorAll<HTMLElement>(NAIVE_MODAL_CONTENT_SELECTOR));
    if (!content.some(isVisibleElement)) return false;
    if (topRoot && Boolean(topRoot.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) return true;
    const z = effectiveZIndex(el);
    return z !== null && z > layerZ;
  });
}

/** 弹层栈本体。 */
class LayerStack {
  private readonly entries: LayerEntry[] = [];
  private bound = false;

  /** 入栈：分配 z-index = 当前栈内最高有效层级 + 1（空栈从 2000 起）。 */
  push(options: LayerOptions): LayerEntry {
    const top = this.entries.reduce((max, e) => Math.max(max, e.options.getZIndex?.() ?? e.zIndex.value), LAYER_BASE_Z_INDEX - 1);
    const entry: LayerEntry = {
      id: Symbol('kimpo-ui-layer'),
      options,
      zIndex: ref(top + 1),
      skipped: false,
      passthrough: false
    };
    this.entries.push(entry);
    this.bind();
    return entry;
  }

  /** 出栈：栈空时摘除全局监听；已出栈的条目重复调用无副作用。 */
  remove(entry: LayerEntry): void {
    const index = this.entries.indexOf(entry);
    if (index < 0) return;
    this.entries.splice(index, 1);
    if (this.entries.length === 0) this.unbind();
  }

  /** 当前栈深度（测试与调试用）。 */
  get size(): number {
    return this.entries.length;
  }

  /** 栈顶参与仲裁的条目：从顶向下跳过 skipped 的层。 */
  topEntry(): LayerEntry | undefined {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (!this.entries[i].skipped) return this.entries[i];
    }
    return undefined;
  }

  /** 条目是否为参与仲裁的栈顶。 */
  isTop(entry: LayerEntry): boolean {
    return this.topEntry() === entry;
  }

  /** window 捕获阶段的 Esc 派发（见文件头注释）。 */
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    // 输入法组字中按 Esc 是取消组字，长按重复触发不应连续关多层。
    if (event.isComposing || event.repeat) return;
    const top = this.topEntry();
    if (!top) return;
    // 栈顶层正处理必须独占 Esc 的上层交互（如关闭确认框）：不派发、不拦截，让那一层自己处理。
    if (top.passthrough) return;
    // 栈顶层之上有 Naive 弹层：交还给 Naive 收起，栈不拦截也不处理。
    if (hasNaiveOverlayAbove(top)) return;
    // 栈顶层之上有未登记的 Naive 模态（未迁移的嵌套弹窗）：同样让位，由它自己的 close-on-esc 处理
    if (hasUnregisteredNaiveModalAbove(top, this.entries)) return;
    // 栈顶层职责：本次 Esc 到此为止，不再漏给画布全局快捷键或宿主弹窗。
    event.stopImmediatePropagation();
    event.preventDefault();
    top.options.onEscape(event);
  };

  private bind(): void {
    if (this.bound) return;
    window.addEventListener('keydown', this.onKeydown, true);
    this.bound = true;
  }

  private unbind(): void {
    if (!this.bound) return;
    window.removeEventListener('keydown', this.onKeydown, true);
    this.bound = false;
  }
}

/** 单例键：宿主与重复打包的副本共用同一个栈。 */
const STACK_KEY = Symbol.for('kimpo.ui.layerStack');

/** 取得（必要时创建）全局唯一的弹层栈。 */
export function getLayerStack(): LayerStack {
  const holder = globalThis as unknown as Record<symbol, LayerStack | undefined>;
  return (holder[STACK_KEY] ??= new LayerStack());
}

/** useLayer 返回的句柄。 */
export interface LayerHandle {
  /** 栈分配的 z-index；未入栈时为 2000 的占位值，入栈后为实际值。 */
  readonly zIndex: Ref<number>;
  /** 入栈（已在栈内则无副作用）。 */
  open(): void;
  /** 出栈（不在栈内则无副作用）。 */
  close(): void;
  /** 当前是否在栈内。 */
  isOpen(): boolean;
  /** 当前是否为参与仲裁的栈顶。 */
  isTop(): boolean;
  /** 暂时跳过本层的 Esc 仲裁（窗口最小化期间）。 */
  setEscapeSkipped(skipped: boolean): void;
  /** 本层处理上层交互期间让 Esc 原样放行（关闭确认框期间）。 */
  setEscapePassthrough(passthrough: boolean): void;
}

/**
 * 登记一层弹窗。在组件 setup 中调用时，卸载会自动出栈；脱离组件也可使用，须自行 close()。
 *
 * ```ts
 * const layer = useLayer({ onEscape: () => close(), getZIndex: () => 2200 });
 * watch(show, v => (v ? layer.open() : layer.close()), { immediate: true });
 * ```
 */
export function useLayer(options: LayerOptions): LayerHandle {
  const stack = getLayerStack();
  const zIndex = ref(LAYER_BASE_Z_INDEX);
  let entry: LayerEntry | null = null;

  const handle: LayerHandle = {
    zIndex,
    open() {
      if (entry) return;
      entry = stack.push(options);
      zIndex.value = entry.zIndex.value;
    },
    close() {
      if (!entry) return;
      stack.remove(entry);
      entry = null;
    },
    isOpen: () => entry !== null,
    isTop: () => entry !== null && stack.isTop(entry),
    setEscapeSkipped(skipped) {
      if (entry) entry.skipped = skipped;
    },
    setEscapePassthrough(passthrough) {
      if (entry) entry.passthrough = passthrough;
    }
  };

  if (getCurrentInstance()) onBeforeUnmount(handle.close);
  return handle;
}
