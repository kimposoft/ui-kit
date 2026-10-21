/**
 * KDialog 单测：两档结构、点遮罩无动作、Esc 顺序、dirty 确认、
 * 非模态、弹层栈 z-index、最小化、四语窗控提示。
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted } from 'vue';
import KDialog from './KDialog.vue';
import { KDIALOG_CONFIRM_CLOSE } from './confirm';
import { getLayerStack } from '../layer/KLayerStack';

const mounted: VueWrapper[] = [];

/** 挂载并等 NModal 的懒传送与进场渲染完成。 */
async function mountDialog(props: Record<string, unknown> = {}, slots: Record<string, string> = { default: '<p class="content">内容</p>' }) {
  const wrapper = mount(KDialog, {
    attachTo: document.body,
    props: { show: true, title: '标题', ...props },
    slots
  });
  mounted.push(wrapper);
  await flushPromises();
  await nextTick();
  return wrapper;
}

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
  window.dispatchEvent(event);
  return event;
}

const shell = (): HTMLElement | null => document.body.querySelector<HTMLElement>('.kdlg-shell');
const buttons = (): HTMLButtonElement[] => Array.from(document.body.querySelectorAll<HTMLButtonElement>('.kdlg-btn'));

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40, toJSON: () => ({})
  } as DOMRect);
});

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('KDialog 结构与两档规格', () => {
  it('standard：标题、内容、最大化 + 关闭按钮、八向缩放手柄', async () => {
    await mountDialog();
    const el = shell()!;
    expect(el).toBeTruthy();
    expect(el.classList.contains('kdlg-shell--standard')).toBe(true);
    expect(el.classList.contains('kdlg-shell--compact')).toBe(false);
    expect(el.querySelector('.kdlg-title')?.textContent).toBe('标题');
    expect(el.querySelector('.content')?.textContent).toBe('内容');
    // 默认：可最大化、不可最小化 → 两个窗控按钮（最大化、关闭）
    expect(buttons().map(b => b.title)).toEqual(['最大化', '关闭']);
    expect(el.querySelectorAll('.kdlg-resize')).toHaveLength(8);
    expect(el.getAttribute('role')).toBe('dialog');
  });

  it('compact：只有关闭按钮，无缩放手柄，不能最大化', async () => {
    await mountDialog({ density: 'compact', maximizable: true, resizable: true, minimizable: true });
    const el = shell()!;
    expect(el.classList.contains('kdlg-shell--compact')).toBe(true);
    expect(buttons().map(b => b.title)).toEqual(['关闭']);
    expect(el.querySelectorAll('.kdlg-resize')).toHaveLength(0);
    // 双击标题栏也不会最大化
    el.querySelector('.kdlg-header')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await nextTick();
    expect(el.classList.contains('kdlg-shell--maximized')).toBe(false);
  });

  it('resizable=false / maximizable=false 关闭对应能力', async () => {
    await mountDialog({ resizable: false, maximizable: false });
    expect(buttons().map(b => b.title)).toEqual(['关闭']);
    expect(shell()!.querySelectorAll('.kdlg-resize')).toHaveLength(0);
  });

  it('footer 与 header-extra 插槽按需渲染', async () => {
    await mountDialog({}, {
      default: '<p>x</p>',
      footer: '<span class="my-footer">页脚</span>',
      'header-extra': '<span class="my-extra">额外</span>'
    });
    expect(shell()!.querySelector('.kdlg-footer .my-footer')).toBeTruthy();
    expect(shell()!.querySelector('.kdlg-header-extra .my-extra')).toBeTruthy();
  });

  it('未给 footer 插槽时不渲染页脚区；外壳不是 overflow:hidden', async () => {
    await mountDialog();
    expect(shell()!.querySelector('.kdlg-footer')).toBeNull();
    expect(shell()!.style.overflow).not.toBe('hidden');
  });

  it('flush：内容区带通栏修饰类（内边距归零由样式负责），缺省不带；两档都生效', async () => {
    await mountDialog({ flush: true });
    expect(shell()!.querySelector('.kdlg-body')!.classList.contains('kdlg-body--flush')).toBe(true);
    await mountDialog({ flush: true, density: 'compact' });
    const compactBody = Array.from(document.body.querySelectorAll('.kdlg-shell--compact .kdlg-body'))[0];
    expect(compactBody.classList.contains('kdlg-body--flush')).toBe(true);
    mounted.pop()!.unmount();
    mounted.pop()!.unmount();
    await mountDialog();
    expect(shell()!.querySelector('.kdlg-body')!.classList.contains('kdlg-body--flush')).toBe(false);
  });

  it('使用方 attrs（data-testid 等）落在外壳上', async () => {
    await mountDialog({ 'data-testid': 'my-dialog' });
    expect(shell()!.getAttribute('data-testid')).toBe('my-dialog');
  });
});

describe('KDialog 关闭与点遮罩', () => {
  it('点遮罩既不关闭也不还原', async () => {
    const wrapper = await mountDialog();
    buttons()[0].click(); // 先最大化
    await nextTick();
    expect(shell()!.classList.contains('kdlg-shell--maximized')).toBe(true);

    const mask = document.body.querySelector<HTMLElement>('.n-modal-mask');
    const container = document.body.querySelector<HTMLElement>('.n-modal-container');
    (mask ?? container)!.click();
    container!.click();
    await flushPromises();
    expect(wrapper.emitted('update:show')).toBeUndefined();
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(shell()!.classList.contains('kdlg-shell--maximized')).toBe(true);
  });

  it('点关闭按钮：发出 close 与 update:show=false', async () => {
    const wrapper = await mountDialog();
    document.body.querySelector<HTMLButtonElement>('.kdlg-btn--close')!.click();
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('update:show')).toEqual([[false]]);
  });
});

describe('KDialog Esc 顺序', () => {
  it('最大化 → 先还原；再 Esc → 关闭', async () => {
    const wrapper = await mountDialog();
    buttons()[0].click();
    await nextTick();
    expect(shell()!.classList.contains('kdlg-shell--maximized')).toBe(true);

    const first = pressEscape();
    await flushPromises();
    expect(first.defaultPrevented).toBe(true);
    expect(shell()!.classList.contains('kdlg-shell--maximized')).toBe(false);
    expect(wrapper.emitted('close')).toBeUndefined();

    pressEscape();
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('update:show')).toEqual([[false]]);
  });

  it('双击标题栏切换最大化 / 还原', async () => {
    await mountDialog();
    const header = shell()!.querySelector('.kdlg-header')!;
    header.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await nextTick();
    expect(shell()!.classList.contains('kdlg-shell--maximized')).toBe(true);
    header.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await nextTick();
    expect(shell()!.classList.contains('kdlg-shell--maximized')).toBe(false);
  });

  it('dirty：关闭前先确认；拒绝则保持打开，同意才关闭', async () => {
    const confirmClose = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const wrapper = await mountDialog({ dirty: true, confirmClose });

    pressEscape();
    await flushPromises();
    expect(confirmClose).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('close')).toBeUndefined();

    pressEscape();
    await flushPromises();
    expect(confirmClose).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('dirty 但未提供 confirmClose：直接关闭；非 dirty：不调用确认', async () => {
    const confirmClose = vi.fn(async () => true);
    const a = await mountDialog({ dirty: true });
    pressEscape();
    await flushPromises();
    expect(a.emitted('close')).toHaveLength(1);
    a.unmount();
    mounted.length = 0;

    const b = await mountDialog({ dirty: false, confirmClose });
    pressEscape();
    await flushPromises();
    expect(confirmClose).not.toHaveBeenCalled();
    expect(b.emitted('close')).toHaveLength(1);
  });

  it('dirty 且 prop 未传 confirmClose：使用宿主注入的 KDIALOG_CONFIRM_CLOSE；prop 优先于注入', async () => {
    const injected = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const wrapper = mount(KDialog, {
      attachTo: document.body,
      props: { show: true, title: '标题', dirty: true },
      slots: { default: '<p>内容</p>' },
      global: { provide: { [KDIALOG_CONFIRM_CLOSE as symbol]: injected } }
    });
    mounted.push(wrapper);
    await flushPromises();

    // 注入的确认函数拒绝 → 保持打开；同意 → 关闭
    pressEscape();
    await flushPromises();
    expect(injected).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('close')).toBeUndefined();
    pressEscape();
    await flushPromises();
    expect(injected).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted('close')).toHaveLength(1);

    // prop 传了则优先用 prop，不再调用注入值
    const own = vi.fn(async () => true);
    const other = mount(KDialog, {
      attachTo: document.body,
      props: { show: true, title: '标题', dirty: true, confirmClose: own },
      slots: { default: '<p>内容</p>' },
      global: { provide: { [KDIALOG_CONFIRM_CLOSE as symbol]: injected } }
    });
    mounted.push(other);
    await flushPromises();
    pressEscape();
    await flushPromises();
    expect(own).toHaveBeenCalledTimes(1);
    expect(injected).toHaveBeenCalledTimes(2);
  });

  it('确认进行中再按 Esc：不重复弹确认，也不被拦截（交给确认框自己）', async () => {
    let resolveConfirm: (v: boolean) => void = () => {};
    const confirmClose = vi.fn(() => new Promise<boolean>(r => (resolveConfirm = r)));
    const wrapper = await mountDialog({ dirty: true, confirmClose });
    pressEscape();
    await nextTick();
    const second = pressEscape();
    expect(confirmClose).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
    resolveConfirm(false);
    await flushPromises();
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('escapeInterceptor 返回 true 时消费本次 Esc，不还原也不关闭', async () => {
    const escapeInterceptor = vi.fn(() => true);
    const wrapper = await mountDialog({ escapeInterceptor });
    pressEscape();
    await flushPromises();
    expect(escapeInterceptor).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('KDialog 之上有未登记的嵌套 NModal：Esc 让位给它，窗口不关；嵌套消失后正常关闭', async () => {
    const wrapper = await mountDialog();
    // 模拟未迁移嵌套弹窗：挂在 body、DOM 位于 KDialog 容器之后的 .n-modal-container，内含可见窗口内容
    const nested = document.createElement('div');
    nested.className = 'n-modal-container';
    const card = document.createElement('div');
    card.className = 'n-modal';
    nested.appendChild(card);
    document.body.appendChild(nested);
    const event = pressEscape();
    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.emitted('close')).toBeUndefined();
    nested.remove();
    pressEscape();
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('只有栈顶窗口响应 Esc：两层叠开时先关上层', async () => {
    const lower = await mountDialog({ title: '下层' });
    const upper = await mountDialog({ title: '上层' });
    pressEscape();
    await flushPromises();
    expect(upper.emitted('close')).toHaveLength(1);
    expect(lower.emitted('close')).toBeUndefined();
  });
});

describe('KDialog 弹层栈与非模态', () => {
  it('三层嵌套（主窗 → 节点配置 → 嵌套弹窗，后者在前者插槽内）：z-index 逐层递增，嵌套层最高；Esc 只关最上层', async () => {
    // 复现动作设计器场景：外层窗口的插槽里再放 KDialog，NModal 都传送到 body，只靠弹层栈决定谁在上
    const closed: string[] = [];
    const show = { main: true, node: true, nested: true };
    const Tree = defineComponent({
      setup() {
        const layer = (key: 'main' | 'node' | 'nested', title: string, inner?: () => unknown) =>
          h(
            KDialog,
            {
              show: show[key],
              title,
              'data-testid': `lvl-${key}`,
              'onUpdate:show': (v: boolean) => {
                show[key] = v;
                if (!v) closed.push(key);
              }
            },
            { default: () => inner?.() ?? null }
          );
        return () => layer('main', '主窗', () => layer('node', '节点配置', () => layer('nested', '嵌套弹窗')));
      }
    });
    const wrapper = mount(Tree, { attachTo: document.body });
    mounted.push(wrapper);
    await flushPromises();
    await nextTick();

    expect(getLayerStack().size).toBe(3);
    const zOf = (testid: string): number =>
      Number(document.body.querySelector(`[data-testid="${testid}"]`)!.closest<HTMLElement>('.n-modal-container')!.style.zIndex);
    expect(zOf('lvl-main')).toBe(2000);
    expect(zOf('lvl-node')).toBe(2001);
    expect(zOf('lvl-nested')).toBe(2002);
    expect(zOf('lvl-nested')).toBeGreaterThan(zOf('lvl-node'));

    // Esc 只关最上层（嵌套弹窗），下两层不动
    pressEscape();
    await flushPromises();
    expect(closed).toEqual(['nested']);
  });

  it('打开入栈并分配 z-index，关闭 / 卸载出栈', async () => {
    expect(getLayerStack().size).toBe(0);
    const a = await mountDialog();
    const b = await mountDialog();
    expect(getLayerStack().size).toBe(2);
    const zs = Array.from(document.body.querySelectorAll<HTMLElement>('.n-modal-container')).map(el => Number(el.style.zIndex));
    expect(zs).toEqual([2000, 2001]);

    await a.setProps({ show: false });
    expect(getLayerStack().size).toBe(1);
    b.unmount();
    mounted.length = 0;
    a.unmount();
    expect(getLayerStack().size).toBe(0);
  });

  it('modal=false：Teleport 到 body 的容器，不创建 NModal 遮罩，窗口本体可交互', async () => {
    const wrapper = await mountDialog({ modal: false });
    const layer = document.body.querySelector<HTMLElement>('.kdlg-modeless-layer');
    expect(layer).toBeTruthy();
    expect(layer!.style.zIndex).toBe('2000');
    expect(document.body.querySelector('.n-modal-container')).toBeNull();
    expect(document.body.querySelector('.n-modal-mask')).toBeNull();
    expect(layer!.contains(shell())).toBe(true);
    expect(shell()!.getAttribute('aria-modal')).toBeNull();

    // 非模态同样走 Esc 栈
    pressEscape();
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('show 变 false 后非模态容器移除', async () => {
    const wrapper = await mountDialog({ modal: false });
    await wrapper.setProps({ show: false });
    await flushPromises();
    expect(document.body.querySelector('.kdlg-modeless-layer')).toBeNull();
    expect(getLayerStack().size).toBe(0);
  });
});

describe('KDialog 最小化（minimizable）', () => {
  it('最小化为胶囊：内容保持挂载但隐藏，不参与 Esc；还原后恢复', async () => {
    const wrapper = await mountDialog({ minimizable: true, modal: false });
    expect(buttons().map(b => b.title)).toEqual(['最小化', '最大化', '关闭']);
    buttons()[0].click();
    await nextTick();
    const el = shell()!;
    expect(el.classList.contains('kdlg-shell--minimized')).toBe(true);
    // 内容仍挂载（窗口内状态不丢），只是被 v-show 隐藏
    const body = el.querySelector<HTMLElement>('.kdlg-body')!;
    expect(body.style.display).toBe('none');
    // 胶囊态只剩「还原」「关闭」
    expect(buttons().map(b => b.title)).toEqual(['还原', '关闭']);
    expect(el.querySelectorAll('.kdlg-resize')).toHaveLength(0);

    const event = pressEscape();
    await flushPromises();
    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.emitted('close')).toBeUndefined();

    buttons()[0].click();
    await nextTick();
    expect(el.classList.contains('kdlg-shell--minimized')).toBe(false);
    pressEscape();
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});

describe('KDialog 多语言', () => {
  it.each([
    ['en-US', ['Maximize', 'Close']],
    ['zh-TW', ['最大化', '關閉']],
    ['ja-JP', ['最大化', '閉じる']],
    ['zh-CN', ['最大化', '关闭']]
  ])('locale=%s 的窗控提示', async (locale, expected) => {
    await mountDialog({ locale });
    expect(buttons().map(b => b.title)).toEqual(expected);
  });
});

describe('KDialog 尺寸记忆（memoryKey）', () => {
  it('提供 memoryStore 时读取记忆尺寸', async () => {
    const memoryStore = { load: vi.fn(() => ({ width: 640, height: 400 })), save: vi.fn() };
    await mountDialog({ memoryKey: 'demo', memoryStore });
    expect(memoryStore.load).toHaveBeenCalledWith('demo');
    expect(shell()!.style.width).toBe('640px');
    expect(shell()!.style.height).toBe('400px');
  });

  it('未给 memoryKey 不读写记忆', async () => {
    const memoryStore = { load: vi.fn(() => null), save: vi.fn() };
    await mountDialog({ memoryStore });
    expect(memoryStore.load).not.toHaveBeenCalled();
  });
});

describe('KDialog 最大尺寸上限', () => {
  it('默认尺寸与记忆尺寸都被 maxSize 限位；未给 maxSize 不设硬顶', async () => {
    await mountDialog({ defaultSize: { width: 900, height: 700 }, maxSize: { width: 600, height: 400 } });
    expect(shell()!.style.width).toBe('600px');
    expect(shell()!.style.height).toBe('400px');
    mounted.pop()!.unmount();
    document.body.innerHTML = '';

    // 记忆里存了更大的尺寸（如旧版本留下的）：读回时同样被限位
    const memoryStore = { load: vi.fn(() => ({ width: 1500, height: 650 })), save: vi.fn() };
    await mountDialog({ memoryKey: 'k', memoryStore, maxSize: { width: 700 } });
    expect(shell()!.style.width).toBe('700px');
    // 只限宽度时高度不受硬顶，仅受视口比例（0.96 * innerHeight）约束
    expect(shell()!.style.height).toBe(`${Math.min(650, window.innerHeight * 0.96)}px`);
    mounted.pop()!.unmount();
    document.body.innerHTML = '';

    // 无 maxSize：宽度只受视口比例上限约束（去掉 hook 的 1200 硬顶）
    await mountDialog({ defaultSize: { width: 5000, height: 300 } });
    expect(shell()!.style.width).toBe(`${window.innerWidth * 0.98}px`);
  });

  it('拖拽缩放不能超过 maxSize；最大化不受 maxSize 限制', async () => {
    const wrapper = await mountDialog({ defaultSize: { width: 580, height: 400 }, maxSize: { width: 600, height: 420 } });
    const handle = document.body.querySelector<HTMLElement>('.kdlg-rz-se')!;
    handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 300 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await nextTick();
    expect(shell()!.style.width).toBe('600px');
    expect(shell()!.style.height).toBe('420px');

    // 最大化：铺满视口（100vw × 100vh），不受 maxSize 限制
    buttons().find(b => b.title === '最大化')!.click();
    await nextTick();
    expect(shell()!.style.width).toBe('100vw');
    expect(shell()!.style.height).toBe('100vh');
    wrapper.unmount();
  });
});

describe('KDialog 补充能力：draggable / closeOnEsc / #title', () => {
  /** 在标题栏上按下并拖动 (dx,dy)，返回外壳 transform。 */
  async function dragHeader(dx: number, dy: number): Promise<string> {
    const header = document.body.querySelector<HTMLElement>('.kdlg-header')!;
    header.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100 + dx, clientY: 100 + dy }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await nextTick();
    return shell()!.style.transform;
  }

  it('draggable 缺省 true：标题栏可拖动；false：不可拖动且光标类生效，双击仍按 maximizable 最大化', async () => {
    await mountDialog();
    expect(shell()!.classList.contains('kdlg-shell--nodrag')).toBe(false);
    expect(await dragHeader(30, 20)).toContain('30px');
    document.body.innerHTML = '';

    await mountDialog({ draggable: false });
    expect(shell()!.classList.contains('kdlg-shell--nodrag')).toBe(true);
    const before = shell()!.style.transform;
    expect(await dragHeader(30, 20)).toBe(before);
    // 双击最大化不受 draggable 影响
    document.body.querySelector('.kdlg-header')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await nextTick();
    expect(shell()!.classList.contains('kdlg-shell--maximized')).toBe(true);
  });

  it('closeOnEsc=false：Esc 不关闭；最大化时仍先还原；escapeInterceptor 仍生效；关闭按钮仍可关', async () => {
    const interceptor = vi.fn(() => false);
    const wrapper = await mountDialog({ closeOnEsc: false, escapeInterceptor: interceptor });
    buttons()[0].click();
    await nextTick();
    expect(shell()!.classList.contains('kdlg-shell--maximized')).toBe(true);

    pressEscape();
    await flushPromises();
    expect(shell()!.classList.contains('kdlg-shell--maximized')).toBe(false);
    expect(wrapper.emitted('close')).toBeUndefined();

    pressEscape();
    await flushPromises();
    expect(interceptor).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted('close')).toBeUndefined();

    buttons().find(b => b.title === '关闭')!.click();
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('closeOnEsc 缺省 true：Esc 仍关闭', async () => {
    const wrapper = await mountDialog();
    pressEscape();
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('#title 插槽替换标题内容，aria-label 仍取 title 属性；不传槽时用 title 属性', async () => {
    await mountDialog({ title: '纯文本标题' }, { default: '<p>x</p>', title: '<i class="ico">★</i><b>带样式</b>' });
    const el = shell()!;
    expect(el.querySelector('.kdlg-title .ico')?.textContent).toBe('★');
    expect(el.querySelector('.kdlg-title b')?.textContent).toBe('带样式');
    expect(el.querySelector('.kdlg-title')?.textContent).not.toContain('纯文本标题');
    expect(el.getAttribute('aria-label')).toBe('纯文本标题');
    document.body.innerHTML = '';

    await mountDialog({ title: '纯文本标题' });
    expect(shell()!.querySelector('.kdlg-title')?.textContent).toBe('纯文本标题');
  });
});

describe('KDialog 运行中换档', () => {
  /** 计数子组件：记录挂载 / 卸载次数，并带一个输入框验证草稿保留。 */
  let mountCount = 0;
  let unmountCount = 0;
  const Counter = defineComponent({
    setup() {
      onMounted(() => (mountCount += 1));
      onBeforeUnmount(() => (unmountCount += 1));
      return () => h('input', { class: 'draft' });
    }
  });
  beforeEach(() => {
    mountCount = 0;
    unmountCount = 0;
  });

  async function mountWithCounter(props: Record<string, unknown>) {
    const wrapper = mount(KDialog, {
      attachTo: document.body,
      props: { show: true, title: '换档', ...props },
      slots: { default: () => h(Counter) }
    });
    mounted.push(wrapper);
    await flushPromises();
    await nextTick();
    return wrapper;
  }

  it('standard → compact → standard：插槽内组件实例不重建，输入框草稿保留', async () => {
    const wrapper = await mountWithCounter({ defaultSize: { width: 720, height: 520 } });
    expect(mountCount).toBe(1);
    const input = document.body.querySelector<HTMLInputElement>('.draft')!;
    input.value = '草稿内容';

    await wrapper.setProps({ density: 'compact', defaultSize: { width: 420 } });
    await flushPromises();
    expect(shell()!.classList.contains('kdlg-shell--compact')).toBe(true);
    expect(shell()!.style.width).toBe('420px');
    expect(document.body.querySelector('.draft')).toBe(input);

    await wrapper.setProps({ density: 'standard', defaultSize: { width: 720, height: 520 } });
    await flushPromises();
    expect(shell()!.classList.contains('kdlg-shell--standard')).toBe(true);
    expect(shell()!.style.width).toBe('720px');
    expect(document.body.querySelector('.draft')).toBe(input);
    expect(input.value).toBe('草稿内容');
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);
  });

  it('standard 档内改 defaultSize：尺寸跟随，中心点不变（transform 居中基准与拖动偏移保持）', async () => {
    const wrapper = await mountWithCounter({ defaultSize: { width: 600, height: 400 } });
    // 先拖动一次，产生偏移
    const header = document.body.querySelector<HTMLElement>('.kdlg-header')!;
    header.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 110, clientY: 105 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await nextTick();
    const transformBefore = shell()!.style.transform;
    expect(transformBefore).toContain('10px');

    await wrapper.setProps({ defaultSize: { width: 800, height: 500 } });
    await flushPromises();
    expect(shell()!.style.width).toBe('800px');
    expect(shell()!.style.height).toBe('500px');
    // left/top 恒 50% + translate(-50%,-50%)+偏移 → 中心点 = 视口中心 + 偏移，偏移不变即中心不变
    expect(shell()!.style.transform).toBe(transformBefore);
    expect(mountCount).toBe(1);
  });

  it('按值监听：父组件每次渲染传新的等值对象不会重置用户缩放过的尺寸', async () => {
    const wrapper = await mountWithCounter({ defaultSize: { width: 580, height: 400 } });
    const handle = document.body.querySelector<HTMLElement>('.kdlg-rz-se')!;
    handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 40 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await nextTick();
    expect(shell()!.style.width).toBe('640px');

    await wrapper.setProps({ defaultSize: { width: 580, height: 400 } });
    await flushPromises();
    expect(shell()!.style.width).toBe('640px');
  });

  it('切到 compact 取消最大化并去掉缩放手柄；切回 standard 优先用记忆尺寸', async () => {
    const memoryStore = { load: vi.fn(() => ({ width: 640, height: 410 })), save: vi.fn() };
    const wrapper = await mountWithCounter({ memoryKey: 'k', memoryStore, defaultSize: { width: 720, height: 520 } });
    expect(shell()!.style.width).toBe('640px');
    buttons().find(b => b.title === '最大化')!.click();
    await nextTick();
    expect(shell()!.classList.contains('kdlg-shell--maximized')).toBe(true);

    await wrapper.setProps({ density: 'compact', defaultSize: { width: 420 } });
    await flushPromises();
    expect(shell()!.classList.contains('kdlg-shell--maximized')).toBe(false);
    expect(shell()!.querySelectorAll('.kdlg-resize')).toHaveLength(0);

    await wrapper.setProps({ density: 'standard', defaultSize: { width: 720, height: 520 } });
    await flushPromises();
    // 已不再最大化（切 compact 时取消），尺寸取记忆值而非默认值
    expect(shell()!.classList.contains('kdlg-shell--maximized')).toBe(false);
    expect(shell()!.style.width).toBe('640px');
    expect(shell()!.style.height).toBe('410px');
    expect(shell()!.querySelectorAll('.kdlg-resize')).toHaveLength(8);
  });

  it('换档过渡：带 morphing 类与固定像素高度，到时撤掉；内容不重建', async () => {
    vi.useFakeTimers();
    try {
      // happy-dom 没有布局：补一个可用的 offsetHeight
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
      const wrapper = await mountWithCounter({ defaultSize: { width: 720, height: 520 } });
      await wrapper.setProps({ density: 'compact', defaultSize: { width: 420 } });
      await nextTick();
      await nextTick();
      expect(shell()!.classList.contains('kdlg-shell--morphing')).toBe(true);
      expect(shell()!.style.height).toBe('300px');
      vi.advanceTimersByTime(400);
      await nextTick();
      expect(shell()!.classList.contains('kdlg-shell--morphing')).toBe(false);
      // compact 回到内容自适应高度
      expect(shell()!.style.height).toBe('');
      expect(mountCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});


describe('KDialog 自适应外壳', () => {
  beforeEach(() => Object.assign(window, { innerWidth: 1920, innerHeight: 940 }));
  it('档位默认基准与 defaultSize覆盖，小屏自动全屏保留standard密度，放大退出', async () => {
    await mountDialog({ sizePreset: 'M', defaultSize: { width: 830, height: 700 } });
    expect(shell()!.style.width).toBe('960px');
    expect(shell()!.style.height).toBe('700px');
    mounted.pop()!.unmount();
    Object.assign(window, { innerWidth: 1093, innerHeight: 500 });
    const wrapper = await mountDialog({ sizePreset: 'L', resizable: false, maximizable: false, modal: false }, {
      default: '<p>工作区</p>', footer: '<button>保存</button>'
    });
    expect(shell()!.style.width).toBe('100vw');
    expect(shell()!.classList.contains('kdlg-shell--standard')).toBe(true);
    expect(shell()!.classList.contains('kdlg-shell--compact')).toBe(false);
    expect(shell()!.classList.contains('kdlg-shell--auto-maximized')).toBe(true);
    expect(shell()!.closest('.kdlg-modeless-layer')).toBeTruthy();
    expect(shell()!.querySelectorAll('.kdlg-resize')).toHaveLength(0);
    expect(buttons().map(b => b.title)).toEqual(['关闭']);
    expect(shell()!.querySelector('.kdlg-footer button')).toBeTruthy();
    Object.assign(window, { innerWidth: 1920, innerHeight: 940 });
    window.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(shell()!.style.width).toBe('1280px');
    expect(shell()!.style.height).toBe('752px');
    expect(shell()!.classList.contains('kdlg-shell--auto-maximized')).toBe(false);
    expect(wrapper.emitted('close')).toBeUndefined();
  });
  it('纯自动全屏Esc执行关闭，closeOnEsc=false保留窗口且没有无效还原按钮', async () => {
    Object.assign(window, { innerWidth: 1093, innerHeight: 500 });
    const wrapper = await mountDialog({ sizePreset: 'L' });
    expect(buttons().map(b => b.title)).toEqual(['关闭']);
    pressEscape();
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount(); mounted.pop();
    const fixed = await mountDialog({ sizePreset: 'L', closeOnEsc: false });
    pressEscape();
    await flushPromises();
    expect(fixed.emitted('close')).toBeUndefined();
    expect(shell()!.classList.contains('kdlg-shell--auto-maximized')).toBe(true);
  });
  it('compact即使传入尺寸档也保持原宽高与关闭能力', async () => {
    Object.assign(window, { innerWidth: 1093, innerHeight: 500 });
    await mountDialog({ density: 'compact', sizePreset: 'XL' });
    expect(shell()!.style.width).toBe('420px');
    expect(shell()!.style.height).toBe('');
    expect(shell()!.classList.contains('kdlg-shell--auto-maximized')).toBe(false);
    expect(buttons().map(b => b.title)).toEqual(['关闭']);
  });
});
