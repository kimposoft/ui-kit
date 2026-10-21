/**
 * @kimposoft/ui-kit 入口。
 *
 * 宿主直接 `import { KDialog, KDialogFooter } from '@kimposoft/ui-kit'`，并在
 * platformPluginLoader 的 installPluginSharedGlobals 把本入口的导出对象注入为 window.KimpoUi；
 * 插件构建把 @kimposoft/ui-kit 外部化为全局 KimpoUi，运行时只用宿主那一份。
 * 组件只依赖 Vue、Naive UI 与宿主 CSS 变量。
 */
export { default as KDialog } from './dialog/KDialog.vue';
export { default as KDialogFooter } from './dialog/KDialogFooter.vue';
// 控件尺寸钉定容器：容器内 Naive 表单控件按档位取钉定数值
export { default as KControlSize } from './size/KControlSize.vue';
export type { KControlSizeTiers, KControlSizeTierSpec } from './size/KControlSize.vue';
export { KDIALOG_CONFIRM_CLOSE, type KDialogConfirmClose } from './dialog/confirm';
export {
  KDIALOG_MEMORY,
  localStorageDialogMemory,
  type KDialogMemoryStore,
  type KDialogSize
} from './dialog/memory';

export {
  LAYER_BASE_Z_INDEX,
  getLayerStack,
  useLayer,
  type LayerHandle,
  type LayerOptions
} from './layer/KLayerStack';

export {
  useDialogGeometry,
  type DialogGeometry,
  type DialogResizeDirection,
  type UseDialogGeometryOptions,
  type UseDialogGeometryReturn
} from './geometry/useDialogGeometry';

export {
  KIMPO_UI_LOCALE,
  normalizeUiLocale,
  uiText,
  type KimpoUiLocale,
  type KimpoUiMessageKey
} from './locale';

export {
  getKimpoUiHostDefaults,
  resetKimpoUiHostDefaults,
  setKimpoUiHostDefaults,
  type KimpoUiHostDefaults
} from './hostDefaults';

export { DIALOG_SIZE_PRESETS, dialogViewportScale, type DialogSizePreset } from './geometry/dialogSizePreset';
