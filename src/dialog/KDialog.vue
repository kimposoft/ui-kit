<script setup lang="ts">
/**
 * KDialog 窗口外壳。
 *
 * - 底座：模态（默认）用 Naive NModal（焦点锁定、滚动锁、弹层管理）；几何统一用 useDialogGeometry
 *   （视口限位、八向缩放、尺寸记忆、最大化还原）。`modal=false` 为非模态变体：Teleport 到 body，
 *   全屏容器 pointer-events:none，只有窗口本体可交互，不加遮罩、不锁页面。
 * - 两档密度：`standard`（完整窗口，可最大化/调整大小/最小化）、`compact`（宽度 ≤ 480 的确认、
 *   填写类小窗：16px 标题、无分隔线、只有关闭按钮、固定居中、不可调整/最大化/拖动）。
 * - 点遮罩无动作：NModal `mask-closable=false`；本组件没有任何遮罩点击逻辑。
 * - Esc：NModal `close-on-esc=false`，Esc 全部交给 KLayerStack 仲裁，本组件只实现 onEscape：
 *   最大化先还原，否则走关闭流程（`dirty` 时先经 `confirmClose` 确认）。栈顶层之上有 Naive 弹层时由栈让位给 Naive。
 * - 外壳不得 overflow:hidden：Naive 会把窗口内的下拉、气泡传送进 NModal body，外壳一裁就没了；
 *   内容区自己滚动，外壳宽高固定，内容不撑高。
 * - 颜色、圆角、阴影全部取宿主变量，变量缺失时落到 fallback：
 *   `--kimpo-radius-card`（8px）、`--kimpo-shadow-dialog`；明暗主题随宿主变量自动切换。
 * - 补充能力：`draggable`（缺省 true，false 时标题栏不可拖动）、`closeOnEsc`（缺省 true，false 时
 *   Esc 只还原最大化/交给 escapeInterceptor，不关闭）、`#title` 插槽（图标/带样式标题，aria-label 仍取 title 属性）。
 * - 运行中换档：density 与 defaultSize/minSize/maxSize 为响应式；打开状态下变化时同一组件实例原地
 *   变形（插槽内容不重建，子表单草稿保留），中心点不变，尺寸用 CSS transition 平滑过渡（尊重 prefers-reduced-motion）。
 * - 系统文本（窗控按钮提示）来自 ui-kit 自带四语小表，语言取 prop `locale` > 宿主 provide(KIMPO_UI_LOCALE) > zh-CN。
 */
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { NModal } from 'naive-ui';
import { DIALOG_SIZE_PRESETS, type DialogSizePreset } from '../geometry/dialogSizePreset';
import { useDialogGeometry, type DialogResizeDirection } from '../geometry/useDialogGeometry';
import { useLayer } from '../layer/KLayerStack';
import { getKimpoUiHostDefaults } from '../hostDefaults';
import { useUiText } from '../locale';
import { KDIALOG_CONFIRM_CLOSE } from './confirm';
import { KDIALOG_MEMORY, localStorageDialogMemory, type KDialogMemoryStore } from './memory';
import { KDialogModeless } from './KDialogModeless';

defineOptions({ name: 'KDialog', inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    /** 是否显示（v-model:show）。 */
    show: boolean;
    title?: string;
    /**
     * 标题栏可拖动（缺省 true）。false 时标题栏不可拖动（光标不变 move），双击最大化仍只看 maximizable。
     */
    draggable?: boolean;
    /**
     * Esc 关闭（缺省 true）。false 时 Esc 只做「还原最大化」与 escapeInterceptor，不关闭窗口——
     * 用于原本没有 Esc 关闭、且关闭会丢未保存数据的窗口；右上角关闭按钮不受影响。
     */
    closeOnEsc?: boolean;
    /** 密度档：standard（缺省）/ compact。 */
    density?: 'standard' | 'compact';
    /** M 表单 / L 配置器 / XL 工作区；compact 不应用自适应档位。 */
    sizePreset?: DialogSizePreset;
    /** 模态（缺省 true）；false 为非模态变体。 */
    modal?: boolean;
    /** 可最大化；缺省：standard 为 true、compact 恒为 false。 */
    maximizable?: boolean;
    /** 可最小化为右下角胶囊（仅动作设计器类使用，缺省 false；compact 恒为 false）。 */
    minimizable?: boolean;
    /** 可调整大小（八向）；缺省：standard 为 true、compact 恒为 false。 */
    resizable?: boolean;
    /** 尺寸记忆键（按「用户 × 键」，用户维度由宿主注入的 KDIALOG_MEMORY 实现负责）；缺省不记忆。 */
    memoryKey?: string;
    /** 覆盖尺寸记忆存取实现；缺省取宿主 provide 的，再缺省回落 localStorage。 */
    memoryStore?: KDialogMemoryStore;
    /** 默认尺寸；standard 缺省 720×520；compact 只用 width（缺省 420），高度由内容决定。 */
    defaultSize?: { width: number; height?: number };
    /** 最小尺寸；缺省 480×320。 */
    minSize?: { width: number; height: number };
    /**
     * 最大尺寸上限：限制默认尺寸、记忆尺寸与拖拽缩放的上限（px，仍同时受视口比例上限约束）；
     * 最大化不受限，仍铺满视口。缺省不设硬顶（仅视口比例上限）。
     */
    maxSize?: { width?: number; height?: number };
    /** 有未保存内容：关闭前先经 confirmClose 确认。 */
    dirty?: boolean;
    /**
     * 内容区通栏：为真时 .kdlg-body 内边距为 0，内容区由子组件自带分栏与内边距
     * （引导语条、分栏选择器等需要贴满窗口宽度的内容）；compact 档同样生效。缺省 false。
     */
    flush?: boolean;
    /**
     * 关闭确认函数：dirty 时关闭前调用，返回 true 才关闭。未传时取宿主 provide 的 KDIALOG_CONFIRM_CLOSE
     * （宿主在 app-provider 注入 host-ui 的 openConfirm）；两者都没有则 dirty 也直接关闭
     * （ui-kit 不自带确认框，避免与宿主确认服务重复）。
     */
    confirmClose?: () => Promise<boolean> | boolean;
    /**
     * Esc 拦截器：内容里有比「还原/关闭」更内层的 Esc 语义（清空搜索、收起函数目录等）时由使用方提供，
     * 返回 true 表示已消费，本次 Esc 不再还原/关闭。
     */
    escapeInterceptor?: (event: KeyboardEvent) => boolean;
    /** 语言码；缺省取宿主注入的当前语言，再缺省 zh-CN。 */
    locale?: string;
  }>(),
  {
    title: undefined,
    draggable: true,
    closeOnEsc: true,
    density: 'standard',
    sizePreset: undefined,
    modal: true,
    maximizable: undefined,
    minimizable: false,
    resizable: undefined,
    memoryKey: undefined,
    memoryStore: undefined,
    defaultSize: undefined,
    minSize: undefined,
    maxSize: undefined,
    dirty: false,
    flush: false,
    confirmClose: undefined,
    escapeInterceptor: undefined,
    locale: undefined
  }
);

const emit = defineEmits<{
  'update:show': [value: boolean];
  /** 窗口被关闭（已通过 dirty 确认）。 */
  close: [];
}>();

const tx = useUiText(() => props.locale);

// —— 档位与能力开关 ——
const isCompact = computed(() => props.density === 'compact');
const canMaximize = computed(() => !isCompact.value && (props.maximizable ?? true));
const canResize = computed(() => !isCompact.value && (props.resizable ?? true));
const canMinimize = computed(() => !isCompact.value && props.minimizable);

const minimized = ref(false);
/** 关闭确认进行中：防止重复触发确认框。 */
const closing = ref(false);
const shellRef = ref<HTMLElement | null>(null);

// —— 尺寸记忆 ——
const injectedStore = inject(KDIALOG_MEMORY, null);
// —— 默认关闭确认：prop 未传时取宿主注入 ——
const injectedConfirmClose = inject(KDIALOG_CONFIRM_CLOSE, null);
function memory(): KDialogMemoryStore {
  // prop → inject → 宿主模块级默认值（插件独立 createApp 时 inject 落空）→ localStorage 缺省
  return props.memoryStore ?? injectedStore ?? getKimpoUiHostDefaults().memory ?? localStorageDialogMemory;
}

// —— 窗口几何（standard 使用；compact 固定居中、不用几何） ——
// 参数口径同 ExpressionDialogShell：去掉 hook 缺省的 1200 硬顶，只留视口比例上限；最大化铺满视口，四边不留空。
// 传 getter：尺寸边界随响应式 props 现取，运行中换档不必重建几何
const adaptivePreset = computed(() => !isCompact.value && props.sizePreset ? DIALOG_SIZE_PRESETS[props.sizePreset] : undefined);
const geometry = useDialogGeometry(() => ({
  sizePreset: !isCompact.value ? props.sizePreset : undefined,
  defaultWidth: props.defaultSize?.width ?? adaptivePreset.value?.width ?? 720,
  defaultHeight: props.defaultSize?.height ?? adaptivePreset.value?.height ?? 520,
  minWidth: props.minSize?.width ?? adaptivePreset.value?.minWidth ?? 480,
  minHeight: props.minSize?.height ?? adaptivePreset.value?.minHeight ?? 320,
  // maxSize.width 为硬顶；缺省去掉 hook 的 1200 硬顶。最大化走 maximized*Ratio，不受此限
  maxWidth: props.maxSize?.width ?? adaptivePreset.value?.maxWidth ?? Number.POSITIVE_INFINITY,
  maxHeight: props.maxSize?.height ?? adaptivePreset.value?.maxHeight,
  maxWidthRatio: 0.98,
  maxHeightRatio: 0.96,
  maximizedWidthRatio: 1,
  maximizedHeightRatio: 1,
  // 标题栏 12+28+12，拖动限位的兜底值；实际以 pointerdown 时实测为准
  headerHeight: 52,
  load: () => (props.memoryKey ? memory().load(props.memoryKey) : null),
  save: size => {
    if (props.memoryKey) memory().save(props.memoryKey, size);
  }
}));

const maximized = computed(() => !isCompact.value && geometry.maximized.value);

// —— 运行中换档 ——
/** 换档过渡中：外壳带 transition 的开关（平时不带，避免拖动/缩放被过渡拖慢）。 */
const morphing = ref(false);
/** 换档过渡中强制的像素高度（null = 不强制）。 */
const morphHeight = ref<number | null>(null);
let morphTimer: ReturnType<typeof setTimeout> | null = null;
/** 过渡时长需与样式里 transition 时长一致（ms）。 */
const MORPH_MS = 220;

/** 外壳 style：standard 走几何；compact 只定宽，高度由内容决定；最小化胶囊由 class 定位，不给 style。 */
const shellStyle = computed<Record<string, string> | undefined>(() => {
  if (minimized.value) return undefined;
  // compact 的居中 transform 写在 inline style 上（与 standard 的几何 style 一致），
  // 否则 Naive 进场缩放动画的 class 会在动画期间盖掉它，窗口会短暂偏到右下
  if (isCompact.value) {
    const style: Record<string, string> = {
      width: `${props.defaultSize?.width ?? 420}px`,
      // 沿用 standard 档拖动留下的偏移，换档时中心点不变；未拖动过（偏移 0）时与原先完全一致
      transform:
        geometry.offsetX.value || geometry.offsetY.value
          ? `translate(calc(-50% + ${geometry.offsetX.value}px), calc(-50% + ${geometry.offsetY.value}px))`
          : 'translate(-50%, -50%)'
    };
    // 换档过渡中：高度固定为像素值以便 CSS 过渡（auto 无法过渡），过渡结束后回到 auto
    if (morphHeight.value !== null) style.height = `${morphHeight.value}px`;
    return style;
  }
  if (morphHeight.value !== null) return { ...geometry.style.value, height: `${morphHeight.value}px` };
  return geometry.style.value;
});

// —— 弹层栈：打开入栈（分配 z-index）、关闭出栈；Esc 由栈派发到 onEscape ——
/** 本层最外层元素：模态取 Naive 的 modal 容器（其内含传送进来的下拉/气泡），非模态取层容器。 */
function layerRoot(): HTMLElement | null {
  const shell = shellRef.value;
  if (!shell) return null;
  return shell.closest<HTMLElement>('.n-modal-container, .kdlg-modeless-layer') ?? shell;
}

function onEscape(event: KeyboardEvent): void {
  // 使用方有更内层的 Esc 语义时优先
  if (props.escapeInterceptor?.(event)) return;
  // 顺序：（Naive 弹层由栈让位）→ 还原最大化 → 关闭（dirty 先确认）
  if (geometry.manualMaximized.value) {
    geometry.restore();
    return;
  }
  // closeOnEsc=false：Esc 不关闭（右上角关闭按钮仍可用）
  if (!props.closeOnEsc) return;
  void requestClose();
}

const layer = useLayer({ onEscape, getElement: layerRoot });

watch(
  () => props.show,
  shown => {
    if (shown) {
      minimized.value = false;
      closing.value = false;
      geometry.reset();
      layer.open();
      // 非模态没有 NModal 的 auto-focus，把焦点移进外壳，保证键盘用户落在窗口内
      if (!props.modal) void nextTick(() => shellRef.value?.focus({ preventScroll: true }));
    } else {
      layer.close();
    }
  },
  { immediate: true }
);

// —— 运行中换档：density 与尺寸边界按「值」监听（使用方常把 defaultSize 写成内联对象，按引用监听会每次渲染都触发）——
const morphKey = computed(() => {
  const d = props.defaultSize;
  const m = props.minSize;
  const x = props.maxSize;
  return [props.density, props.sizePreset, d?.width, d?.height, m?.width, m?.height, x?.width, x?.height].join('|');
});

/** 过渡结束的收尾：撤掉过渡 class 与强制高度。 */
function endMorph(): void {
  if (morphTimer) clearTimeout(morphTimer);
  morphTimer = null;
  morphing.value = false;
  morphHeight.value = null;
}

watch(
  morphKey,
  // flush 'pre'：此刻 DOM 还是换档前的样子，可以量到起始高度
  async (_next, _prev) => {
    if (!props.show) return; // 关闭状态无需过渡，下次打开 geometry.reset() 会按新边界取尺寸
    const shell = shellRef.value;
    const fromHeight = shell && !minimized.value ? shell.offsetHeight : 0;
    // 切到 compact：compact 不可最大化/最小化 → 退出最大化与最小化
    if (isCompact.value) {
      geometry.restore();
      if (minimized.value) setMinimized(false);
    }
    // 按新边界重取尺寸（compact→standard 时有记忆尺寸用记忆尺寸，否则新默认值）；位置偏移保持 → 中心点不变
    geometry.reapply();
    if (!shell || minimized.value || !fromHeight) return;
    // 过渡：先把高度钉在起始像素值并带上 transition，下一帧再放到目标高度
    if (morphTimer) clearTimeout(morphTimer);
    morphing.value = true;
    morphHeight.value = fromHeight;
    await nextTick();
    const el = shellRef.value;
    if (!el) return;
    // 目标高度：standard = 几何高度；compact = 内容自然高度（临时撤掉固定高度量一次）
    let target: number;
    if (isCompact.value) {
      // 🔴 不能直接在原元素上量：此刻宽度仍在过渡中（还是旧宽度），内容折行不同，量出的高度会偏小，
      // 过渡结束时高度会突跳。改用离屏克隆：宽度取目标宽度（inline style 已是目标值）、关掉过渡、高度 auto，量完即删。
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.height = 'auto';
      clone.style.transition = 'none';
      clone.style.visibility = 'hidden';
      clone.style.pointerEvents = 'none';
      clone.removeAttribute('data-testid');
      el.parentElement?.appendChild(clone);
      target = clone.offsetHeight || el.offsetHeight;
      clone.remove();
    } else {
      target = geometry.size.value.height;
    }
    void el.offsetHeight; // 强制回流，保证起始高度先被浏览器采用
    morphHeight.value = target;
    morphTimer = setTimeout(endMorph, MORPH_MS + 40);
  }
);

onBeforeUnmount(() => {
  if (morphTimer) clearTimeout(morphTimer);
});

/** 关闭流程：dirty 且提供了 confirmClose 时先确认；确认期间 Esc 原样放行给确认框自己处理。 */
async function requestClose(): Promise<void> {
  if (closing.value) return;
  const confirmClose = props.confirmClose ?? injectedConfirmClose ?? getKimpoUiHostDefaults().confirmClose;
  if (props.dirty && confirmClose) {
    closing.value = true;
    layer.setEscapePassthrough(true);
    let confirmed = false;
    try {
      confirmed = await confirmClose();
    } catch {
      confirmed = false;
    } finally {
      closing.value = false;
      layer.setEscapePassthrough(false);
    }
    if (!confirmed) return;
  }
  emit('close');
  emit('update:show', false);
}

// —— 最大化 / 最小化 ——
function toggleMaximize(): void {
  if (!canMaximize.value) return;
  if (minimized.value) setMinimized(false);
  geometry.toggleMaximize();
}

function setMinimized(value: boolean): void {
  minimized.value = value;
  // 最小化期间不参与 Esc 仲裁，由下一层栈顶接手
  layer.setEscapeSkipped(value);
}

// —— 标题栏手势 ——
/** 标题栏拖动（仅 standard 普通态）；窗控按钮与 header-extra 自行 stop。 */
function onHeaderPointerDown(event: PointerEvent): void {
  // draggable=false：标题栏不可拖动（双击最大化另算，见 onHeaderDblClick）
  if (isCompact.value || minimized.value || !props.draggable) return;
  geometry.onHeaderPointerDown(event);
}

/** 双击标题栏切换最大化 / 还原，点在窗控按钮或 header-extra 上不算。 */
function onHeaderDblClick(event: MouseEvent): void {
  if (!canMaximize.value || minimized.value || (geometry.autoMaximized.value && !geometry.manualMaximized.value)) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('.kdlg-btn, .kdlg-header-extra')) return;
  geometry.toggleMaximize();
}

// —— 八向缩放手柄 ——
const RESIZE_DIRS: DialogResizeDirection[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
function onResizeDown(event: PointerEvent, dir: DialogResizeDirection): void {
  event.stopPropagation();
  geometry.onResizePointerDown(event, dir);
}

// —— 外层容器：模态 NModal / 非模态 Teleport 容器 ——
const wrapper = computed(() => (props.modal ? NModal : KDialogModeless));
const wrapperProps = computed(() =>
  props.modal
    ? {
        show: props.show,
        maskClosable: false,
        closeOnEsc: false,
        // 保留 Naive 的自动聚焦；最小化期间不锁焦点、不锁滚动、不显示遮罩（窗口缩成胶囊，页面可操作）
        autoFocus: true,
        trapFocus: !minimized.value,
        blockScroll: !minimized.value,
        showMask: !minimized.value,
        zIndex: layer.zIndex.value
      }
    : { show: props.show, zIndex: layer.zIndex.value }
);

defineExpose({
  /** 外壳元素（测试与使用方定位）。 */
  shellRef,
  /** 关闭（含 dirty 确认），等同点击关闭按钮。 */
  requestClose,
  /** 当前是否最大化 / 最小化。 */
  isMaximized: () => maximized.value,
  isMinimized: () => minimized.value
});
</script>

<template>
  <component :is="wrapper" v-bind="wrapperProps">
    <!-- 自绘外壳而非 NCard：标题栏要接管拖动、双击与窗控按钮。几何（尺寸/位置/最大化）来自 useDialogGeometry.style，
         故定位方式固定为 fixed + left/top 50% + translate（居中与偏移都在 transform 里）。 -->
    <div
      ref="shellRef"
      v-bind="$attrs"
      class="kdlg-shell"
      :class="{
        'kdlg-shell--standard': !isCompact,
        'kdlg-shell--compact': isCompact,
        'kdlg-shell--nodrag': !draggable,
        'kdlg-shell--morphing': morphing,
        'kdlg-shell--maximized': maximized,
        'kdlg-shell--auto-maximized': !isCompact && geometry.autoMaximized.value,
        'kdlg-shell--minimized': minimized
      }"
      role="dialog"
      :aria-modal="modal ? 'true' : undefined"
      :aria-label="title"
      tabindex="-1"
      :style="shellStyle"
    >
      <div class="kdlg-header" @pointerdown="onHeaderPointerDown" @dblclick="onHeaderDblClick">
        <!-- #title 插槽：可放图标与带样式片段；不传时用 title 属性（aria-label 始终取 title 属性） -->
        <span class="kdlg-title"><slot name="title">{{ title }}</slot></span>
        <!-- header-extra：标题右侧的使用方内容（徽标、状态、次要入口）；阻止冒泡避免触发拖动 -->
        <div v-if="$slots['header-extra'] && !minimized" class="kdlg-header-extra" @pointerdown.stop>
          <slot name="header-extra" />
        </div>
        <div class="kdlg-controls" @pointerdown.stop>
          <!-- 最小化态：只留「还原」与「关闭」 -->
          <template v-if="minimized">
            <button type="button" class="kdlg-btn" :title="tx('restore')" :aria-label="tx('restore')" @click="setMinimized(false)">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5" y="2" width="9" height="9" rx="1.5" />
                <rect x="2" y="5" width="9" height="9" rx="1.5" />
              </svg>
            </button>
          </template>
          <template v-else>
            <button v-if="canMinimize" type="button" class="kdlg-btn" :title="tx('minimize')" :aria-label="tx('minimize')" @click="setMinimized(true)">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M3 8h10" />
              </svg>
            </button>
            <button
              v-if="canMaximize && (!geometry.autoMaximized.value || geometry.manualMaximized.value)"
              type="button"
              class="kdlg-btn"
              :title="maximized ? tx('restore') : tx('maximize')"
              :aria-label="maximized ? tx('restore') : tx('maximize')"
              @click="toggleMaximize"
            >
              <svg v-if="!maximized" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="10" height="10" rx="1.5" />
              </svg>
              <svg v-else viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5" y="2" width="9" height="9" rx="1.5" />
                <rect x="2" y="5" width="9" height="9" rx="1.5" />
              </svg>
            </button>
          </template>
          <button type="button" class="kdlg-btn kdlg-btn--close" :title="tx('close')" :aria-label="tx('close')" @click="requestClose">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
        </div>
      </div>

      <!-- 内容区：宽高固定，内容超出在此滚动；最小化时保持挂载仅隐藏，窗口内状态不丢 -->
      <div v-show="!minimized" class="kdlg-body" :class="{ 'kdlg-body--flush': flush }">
        <slot />
      </div>
      <div v-if="$slots.footer" v-show="!minimized" class="kdlg-footer">
        <slot name="footer" />
      </div>

      <!-- 八向缩放手柄：仅 standard、可调整、普通态；最大化/最小化时不渲染 -->
      <template v-if="canResize && !maximized && !minimized">
        <div
          v-for="dir in RESIZE_DIRS"
          :key="dir"
          class="kdlg-resize"
          :class="`kdlg-rz-${dir}`"
          aria-hidden="true"
          @pointerdown="onResizeDown($event, dir)"
        />
      </template>
    </div>
  </component>
</template>

<style>
/* 非 scoped：外壳经 NModal / Teleport 传送到 body，且需要被使用方在需要时按类名覆盖；类名统一 kdlg- 前缀避免串味。 */

/* 非模态容器：全屏但不拦截指针，窗口外的页面照常可点 */
.kdlg-modeless-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.kdlg-shell {
  position: fixed;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  /* 非模态容器 pointer-events:none，窗口本体恢复可交互 */
  pointer-events: auto;
  background: rgb(var(--container-bg-color, 255 255 255));
  color: rgb(var(--base-text-color, 31 35 41));
  border-radius: var(--kimpo-radius-card, 8px);
  box-shadow: var(--kimpo-shadow-dialog, 0 12px 40px rgb(0 0 0 / 0.16));
  /* 🔴 不能 overflow:hidden：Naive 会把窗口内的下拉/气泡传送进 NModal body，外壳一裁就没了。
     各区自己滚动（.kdlg-body）；外壳本身没有需要裁切的内容。 */
  overflow: visible;
  outline: none;
}
/* compact：固定居中（transform 在 inline style），高度由内容决定，但不超过视口 */
.kdlg-shell--compact {
  max-height: 90vh;
}
/* 最大化：铺满视口，圆角与阴影去掉（否则四角会透出底色，看着仍像没铺满） */
.kdlg-shell--maximized {
  border-radius: 0;
  box-shadow: none;
}
/* 自动全屏仍是 standard；仅压缩窗口 chrome，内容与 footer 均留在 flex 布局内。 */
.kdlg-shell--auto-maximized:not(.kdlg-shell--minimized) .kdlg-header {
  box-sizing: border-box;
  height: 40px;
  padding: 5px 16px;
}
.kdlg-shell--auto-maximized:not(.kdlg-shell--minimized) .kdlg-title {
  font-size: 16px;
  line-height: 24px;
}
.kdlg-shell--auto-maximized:not(.kdlg-shell--minimized) .kdlg-footer {
  box-sizing: border-box;
  height: 46px;
  padding: 8px 16px 9px;
}
/* 最小化胶囊：右下角，只剩标题栏 */
.kdlg-shell--minimized {
  top: auto;
  left: auto;
  right: 24px;
  bottom: 24px;
  width: 280px;
  height: auto;
  transform: none;
}

/* 标题栏：standard 20px/500、内边距 12px 24px、下分隔线 */
.kdlg-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  border-bottom: 1px solid rgb(var(--border-lighter-color, 235 238 245));
  user-select: none;
}
.kdlg-shell--standard:not(.kdlg-shell--maximized):not(.kdlg-shell--minimized) .kdlg-header {
  cursor: move;
}
/* 不可拖动：光标恢复默认 */
.kdlg-shell--standard.kdlg-shell--nodrag:not(.kdlg-shell--maximized):not(.kdlg-shell--minimized) .kdlg-header {
  cursor: default;
}
/* 运行中换档过渡：仅换档期间带 class，平时拖动/缩放不受影响；尊重 prefers-reduced-motion */
.kdlg-shell--morphing {
  transition:
    width 0.22s ease,
    height 0.22s ease,
    transform 0.22s ease;
}
@media (prefers-reduced-motion: reduce) {
  .kdlg-shell--morphing {
    transition: none;
  }
}
.kdlg-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgb(var(--base-text-color, 31 35 41));
}
.kdlg-header-extra {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  cursor: default;
}
/* 窗控按钮：24×24、间距 16、图标 16 */
.kdlg-controls {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 16px;
  cursor: default;
}
.kdlg-btn {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: rgb(var(--text-secondary-color, 102 102 102));
  line-height: 1;
  cursor: pointer;
}
.kdlg-btn:hover {
  background: rgb(var(--fill-color, 240 242 245));
  color: rgb(var(--base-text-color, 31 35 41));
}
.kdlg-btn:focus-visible {
  outline: 2px solid rgb(var(--primary-color, 22 119 255) / 0.6);
  outline-offset: 1px;
}

/* compact：标题 16px/500、内边距 14px 20px、无分隔线、只有关闭按钮 */
.kdlg-shell--compact .kdlg-header {
  padding: 14px 20px 6px;
  border-bottom: none;
}
.kdlg-shell--compact .kdlg-title {
  font-size: 16px;
  line-height: 24px;
}

/* 最小化胶囊：小标题，避免 280px 宽度里 20px 字过大 */
.kdlg-shell--minimized .kdlg-header {
  padding: 8px 12px 8px 16px;
  border-bottom: none;
}
.kdlg-shell--minimized .kdlg-title {
  font-size: 14px;
  line-height: 24px;
}

/* 内容区：standard 内边距 16px 24px；超出滚动，外壳宽高不被撑开 */
.kdlg-body {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  padding: 16px 24px;
  overflow: auto;
}
.kdlg-shell--compact .kdlg-body {
  padding: 0 20px 16px;
}
/* flush：内容区通栏，内边距归零；选择器权重高于 compact 档，两档都生效 */
.kdlg-shell .kdlg-body.kdlg-body--flush {
  padding: 0;
}

/* 页脚：standard 内边距 12px 24px + 上分隔线；compact 不加分隔线 */
.kdlg-footer {
  flex-shrink: 0;
  padding: 12px 24px;
  border-top: 1px solid rgb(var(--border-lighter-color, 235 238 245));
}
.kdlg-shell--compact .kdlg-footer {
  padding: 0 20px 14px;
  border-top: none;
}

/* 八向缩放手柄：贴外壳边缘内侧，命中区 6px，角 12px */
.kdlg-resize {
  position: absolute;
  z-index: 1;
}
.kdlg-rz-n { top: 0; left: 12px; right: 12px; height: 6px; cursor: ns-resize; }
.kdlg-rz-s { bottom: 0; left: 12px; right: 12px; height: 6px; cursor: ns-resize; }
.kdlg-rz-e { top: 12px; bottom: 12px; right: 0; width: 6px; cursor: ew-resize; }
.kdlg-rz-w { top: 12px; bottom: 12px; left: 0; width: 6px; cursor: ew-resize; }
.kdlg-rz-ne { top: 0; right: 0; width: 12px; height: 12px; cursor: nesw-resize; }
.kdlg-rz-nw { top: 0; left: 0; width: 12px; height: 12px; cursor: nwse-resize; }
.kdlg-rz-se { right: 0; bottom: 0; width: 12px; height: 12px; cursor: nwse-resize; }
.kdlg-rz-sw { bottom: 0; left: 0; width: 12px; height: 12px; cursor: nesw-resize; }
/* 右下角抓手：低调对角线，提示可拖拽 */
.kdlg-rz-se::after {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 8px;
  height: 8px;
  border-right: 2px solid rgb(var(--border-deep-color, 205 208 214));
  border-bottom: 2px solid rgb(var(--border-deep-color, 205 208 214));
  border-bottom-right-radius: 2px;
  content: '';
}
</style>
