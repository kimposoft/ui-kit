/**
 * ui-kit 的「宿主默认值」模块级单例。
 *
 * 为什么需要：宿主用 Vue provide 注入语言 / 尺寸记忆 / 关闭确认，但插件 surface 可能是各自
 * createApp 的独立 Vue 应用，宿主应用树上的 provide 传不过去，KDialog 在插件里 inject 会落空。
 * 而插件运行时用的是宿主注入的同一份 window.KimpoUi，模块级变量因此在宿主与
 * 所有插件之间是同一个单例，宿主只要在启动时设置一次，插件里的 KDialog 同样能读到。
 *
 * 取值顺序（KDialog / KDialogFooter 内实现）：组件 prop → Vue inject → 本宿主默认值 → ui-kit 内置缺省。
 * 本模块不依赖 Vue 响应式：locale 用「读取函数」，函数内部读 ref / store 即可保持响应。
 */
import type { KDialogConfirmClose } from './dialog/confirm';
import type { KDialogMemoryStore } from './dialog/memory';

/** 宿主默认值（字段均可选；未设置的项走内置缺省）。 */
export interface KimpoUiHostDefaults {
  /** 读取宿主当前界面语言（原始语言码，组件内再归一到四语之一）。 */
  locale?: () => string | null | undefined;
  /** 窗口尺寸记忆实现（按用户分桶等由宿主负责）。 */
  memory?: KDialogMemoryStore;
  /** dirty 关闭确认函数。 */
  confirmClose?: KDialogConfirmClose;
}

/** 当前宿主默认值（模块级单例）。 */
let hostDefaults: KimpoUiHostDefaults = {};

/**
 * 设置宿主默认值。按字段合并：只覆盖本次传入且非 undefined 的字段，
 * 传 `null` 语义不支持——要清空请用 resetKimpoUiHostDefaults。
 */
export function setKimpoUiHostDefaults(next: KimpoUiHostDefaults): void {
  const merged: KimpoUiHostDefaults = { ...hostDefaults };
  if (next.locale !== undefined) merged.locale = next.locale;
  if (next.memory !== undefined) merged.memory = next.memory;
  if (next.confirmClose !== undefined) merged.confirmClose = next.confirmClose;
  hostDefaults = merged;
}

/** 读取当前宿主默认值（只读快照引用，调用方不要修改）。 */
export function getKimpoUiHostDefaults(): Readonly<KimpoUiHostDefaults> {
  return hostDefaults;
}

/** 清空宿主默认值（测试与宿主卸载时使用）。 */
export function resetKimpoUiHostDefaults(): void {
  hostDefaults = {};
}
