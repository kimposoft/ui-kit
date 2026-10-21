/**
 * KDialog 尺寸记忆的存取通道。
 *
 * ui-kit 不依赖宿主 store，拿不到「当前用户」，所以把存取抽成接口：
 *  - 宿主在根组件 provide(KDIALOG_MEMORY, store) 注入按登录用户分桶的实现（后续迁移卡接线）；
 *  - 组件也可经 prop `memoryStore` 单独覆盖；
 *  - 都没有时回落到 localStorage（键前缀 + memoryKey，不分用户），保证开发/展示页可用；
 *    localStorage 不可用（隐私模式、被禁用）时静默退化为不记忆。
 */
import type { InjectionKey } from 'vue';

/** 持久化的窗口尺寸（位置不持久化，见 useDialogGeometry）。 */
export interface KDialogSize {
  width?: number;
  height?: number;
  /** 手动缩放尺寸相对 CSS 视口的比例；仅 sizePreset 窗口解释，旧像素格式继续兼容。 */
  wr?: number;
  hr?: number;
}

/** 尺寸记忆存取接口。 */
export interface KDialogMemoryStore {
  load(key: string): KDialogSize | null;
  save(key: string, size: { width: number; height: number; wr?: number; hr?: number }): void;
}

/** 宿主注入 key（Symbol.for：与重复打包的副本共用）。 */
export const KDIALOG_MEMORY: InjectionKey<KDialogMemoryStore> = Symbol.for(
  'kimpo.ui.dialogMemory'
) as InjectionKey<KDialogMemoryStore>;

const STORAGE_PREFIX = 'kimpo-ui:dialog-size:';

/** 默认实现：localStorage，全部读写包 try/catch。 */
export const localStorageDialogMemory: KDialogMemoryStore = {
  load(key) {
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as KDialogSize;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  },
  save(key, size) {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(size));
    } catch {
      /* 存储不可用：放弃记忆，不影响窗口使用 */
    }
  }
};
