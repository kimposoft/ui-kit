/**
 * 宿主默认值单测：
 * 用独立 createApp 挂载 KDialog / KDialogFooter（没有任何 provide，等价于插件自己的 Vue 应用），
 * 验证模块级宿主默认值对语言、尺寸记忆、关闭确认生效，且取值顺序为 prop → inject → 宿主默认值 → 内置缺省。
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createApp, h, nextTick, ref, type App } from 'vue';
import KDialog from './dialog/KDialog.vue';
import KDialogFooter from './dialog/KDialogFooter.vue';
import { KDIALOG_MEMORY } from './dialog/memory';
import { KIMPO_UI_LOCALE } from './locale';
import { getKimpoUiHostDefaults, resetKimpoUiHostDefaults, setKimpoUiHostDefaults } from './hostDefaults';

const apps: App[] = [];

/** 独立 createApp 挂载（不继承任何宿主 provide）；provides 用于单独模拟 inject 场景。 */
async function mountStandalone(
  props: Record<string, unknown>,
  provides: Array<[unknown, unknown]> = [],
  component: unknown = KDialog
) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(component as never, { show: true, title: '标题', ...props }) });
  for (const [key, value] of provides) app.provide(key as symbol, value);
  app.mount(host);
  apps.push(app);
  await flushPromises();
  await nextTick();
}

const titles = (): string[] => Array.from(document.body.querySelectorAll<HTMLButtonElement>('.kdlg-btn')).map(b => b.title);

function pressEscape(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true }));
}

beforeEach(() => {
  resetKimpoUiHostDefaults();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40, toJSON: () => ({})
  } as DOMRect);
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  resetKimpoUiHostDefaults();
  vi.restoreAllMocks();
});

describe('setKimpoUiHostDefaults', () => {
  it('按字段合并，reset 清空', () => {
    const locale = () => 'en-US';
    setKimpoUiHostDefaults({ locale });
    setKimpoUiHostDefaults({ confirmClose: () => true });
    expect(getKimpoUiHostDefaults().locale).toBe(locale);
    expect(getKimpoUiHostDefaults().confirmClose).toBeTypeOf('function');
    resetKimpoUiHostDefaults();
    expect(getKimpoUiHostDefaults()).toEqual({});
  });
});

describe('独立 createApp 的 KDialog 取宿主默认值', () => {
  it('语言：无 prop / inject 时取宿主默认值，且随读取函数响应', async () => {
    const current = ref('en-US');
    setKimpoUiHostDefaults({ locale: () => current.value });
    await mountStandalone({});
    expect(titles()).toEqual(['Maximize', 'Close']);
    current.value = 'ja-JP';
    await nextTick();
    expect(titles()).toEqual(['最大化', '閉じる']);
  });

  it('语言顺序：prop > inject > 宿主默认值', async () => {
    setKimpoUiHostDefaults({ locale: () => 'en-US' });
    await mountStandalone({}, [[KIMPO_UI_LOCALE, 'zh-TW']]);
    expect(titles()).toEqual(['最大化', '關閉']);
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    await mountStandalone({ locale: 'ja-JP' }, [[KIMPO_UI_LOCALE, 'zh-TW']]);
    expect(titles()).toEqual(['最大化', '閉じる']);
  });

  it('尺寸记忆：无 prop / inject 时取宿主默认值；inject 优先于宿主默认值', async () => {
    const hostStore = { load: vi.fn(() => ({ width: 640, height: 400 })), save: vi.fn() };
    setKimpoUiHostDefaults({ memory: hostStore });
    await mountStandalone({ memoryKey: 'k' });
    expect(hostStore.load).toHaveBeenCalledWith('k');
    apps.pop()!.unmount();
    document.body.innerHTML = '';

    const injected = { load: vi.fn(() => null), save: vi.fn() };
    hostStore.load.mockClear();
    await mountStandalone({ memoryKey: 'k' }, [[KDIALOG_MEMORY, injected]]);
    expect(injected.load).toHaveBeenCalledWith('k');
    expect(hostStore.load).not.toHaveBeenCalled();
  });

  it('关闭确认：dirty 时取宿主默认值，拒绝则不关闭', async () => {
    const confirmClose = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    setKimpoUiHostDefaults({ confirmClose });
    const onClose = vi.fn();
    await mountStandalone({ dirty: true, onClose });
    pressEscape();
    await flushPromises();
    expect(confirmClose).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    pressEscape();
    await flushPromises();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('独立 createApp 的 KDialogFooter 取宿主默认值语言', () => {
  it('默认按钮文案走宿主默认语言', async () => {
    setKimpoUiHostDefaults({ locale: () => 'en-US' });
    await mountStandalone({}, [], KDialogFooter);
    const labels = Array.from(document.body.querySelectorAll('button')).map(b => b.textContent?.trim());
    expect(labels).toEqual(['Cancel', 'Confirm']);
  });
});
