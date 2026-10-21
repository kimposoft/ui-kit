/**
 * KDialog 默认关闭确认的注入通道。
 *
 * ui-kit 不自带确认框（避免与宿主确认服务重复），而是让宿主在根组件 provide 一个确认函数：
 * KDialog 的 `confirmClose` prop 未传时使用注入值，这样所有使用 `dirty` 的窗口无需各自接线。
 * 函数返回 true 才允许关闭。
 */
import type { InjectionKey } from 'vue';

/** 关闭确认函数：返回 true 表示确认放弃未保存内容、允许关闭。 */
export type KDialogConfirmClose = () => Promise<boolean> | boolean;

/** 宿主注入 key（Symbol.for：与重复打包的副本共用）。 */
export const KDIALOG_CONFIRM_CLOSE: InjectionKey<KDialogConfirmClose> = Symbol.for(
  'kimpo.ui.dialogConfirmClose'
) as InjectionKey<KDialogConfirmClose>;
