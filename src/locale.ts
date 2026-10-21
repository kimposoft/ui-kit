/**
 * ui-kit 自带的最小多语言表与语言解析。
 */
import { inject, unref, type InjectionKey, type Ref } from 'vue';
import { getKimpoUiHostDefaults } from './hostDefaults';

/** 支持的语言码（BCP-47，与宿主多语言文件一致）。 */
export type KimpoUiLocale = 'zh-CN' | 'en-US' | 'zh-TW' | 'ja-JP';

/** 小表里的文案键。 */
export type KimpoUiMessageKey = 'maximize' | 'restore' | 'minimize' | 'close' | 'confirm' | 'cancel';

const MESSAGES: Record<KimpoUiLocale, Record<KimpoUiMessageKey, string>> = {
  'zh-CN': { maximize: '最大化', restore: '还原', minimize: '最小化', close: '关闭', confirm: '确认', cancel: '取消' },
  'en-US': { maximize: 'Maximize', restore: 'Restore', minimize: 'Minimize', close: 'Close', confirm: 'Confirm', cancel: 'Cancel' },
  'zh-TW': { maximize: '最大化', restore: '還原', minimize: '最小化', close: '關閉', confirm: '確認', cancel: '取消' },
  'ja-JP': { maximize: '最大化', restore: '元に戻す', minimize: '最小化', close: '閉じる', confirm: '確認', cancel: 'キャンセル' }
};

/**
 * 宿主注入的当前语言。用 Symbol.for 保证宿主与（可能存在的）重复打包副本拿到同一个 key；
 * 值可以是字符串或 ref（随界面语言切换响应）。
 */
export const KIMPO_UI_LOCALE: InjectionKey<string | Ref<string>> = Symbol.for('kimpo.ui.locale') as InjectionKey<
  string | Ref<string>
>;

/** 把任意语言码归一到支持的四种之一；未知回落 zh-CN。 */
export function normalizeUiLocale(raw: string | null | undefined): KimpoUiLocale {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return 'zh-CN';
  if (value === 'zh-tw' || value === 'zh-hk' || value === 'zh-mo' || value.startsWith('zh-hant')) return 'zh-TW';
  if (value.startsWith('zh')) return 'zh-CN';
  if (value.startsWith('en')) return 'en-US';
  if (value.startsWith('ja')) return 'ja-JP';
  return 'zh-CN';
}

/** 取某语言的某条文案。 */
export function uiText(locale: string | null | undefined, key: KimpoUiMessageKey): string {
  return MESSAGES[normalizeUiLocale(locale)][key];
}

/**
 * 组件内使用：解析当前语言并返回取词函数。须在 setup 中调用（用到 inject）。
 * @param getPropLocale 读取组件 `locale` prop 的函数（保持响应）
 */
export function useUiText(getPropLocale: () => string | undefined): (key: KimpoUiMessageKey) => string {
  const injected = inject(KIMPO_UI_LOCALE, null);
  // 每次取词现读宿主默认值，宿主晚于组件设置、或切换语言时都能跟上
  return key =>
    uiText(
      getPropLocale() || (injected ? unref(injected) : undefined) || getKimpoUiHostDefaults().locale?.() || undefined,
      key
    );
}
