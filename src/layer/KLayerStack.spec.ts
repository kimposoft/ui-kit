/**
 * KLayerStack 单测。
 * 覆盖：z-index 从 2000 递增与出栈回退、Esc 只派给栈顶、Naive 弹层在上时让位、
 * 跳过 / 放行态、IME 与长按过滤、监听器随栈空摘除。
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLayerStack, useLayer, LAYER_BASE_Z_INDEX, type LayerHandle } from './KLayerStack';

/** 派发一次 Esc，返回事件以便检查是否被拦截。 */
function pressEscape(init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true, ...init });
  window.dispatchEvent(event);
  return event;
}

/** 在 body 里造一个 Naive 弹层：`.v-binder-follower-container > .v-binder-follower-content`。 */
function addNaiveOverlay(options: { zIndex?: number; hidden?: boolean; tooltip?: boolean; parent?: HTMLElement } = {}): HTMLElement {
  const container = document.createElement('div');
  container.className = 'v-binder-follower-container';
  const content = document.createElement('div');
  content.className = 'v-binder-follower-content';
  if (options.zIndex !== undefined) content.style.zIndex = String(options.zIndex);
  if (options.hidden) content.style.display = 'none';
  if (options.tooltip) {
    const tip = document.createElement('div');
    tip.className = 'n-popover n-tooltip';
    content.appendChild(tip);
  } else {
    content.textContent = 'menu';
  }
  container.appendChild(content);
  (options.parent ?? document.body).appendChild(container);
  return container;
}

const opened: LayerHandle[] = [];
function openLayer(onEscape = vi.fn(), extra: Partial<Parameters<typeof useLayer>[0]> = {}): { layer: LayerHandle; onEscape: ReturnType<typeof vi.fn> } {
  const layer = useLayer({ onEscape, ...extra });
  layer.open();
  opened.push(layer);
  return { layer, onEscape };
}

beforeEach(() => {
  // happy-dom 不做布局，getBoundingClientRect 恒为 0；让所有元素有尺寸，由 display/visibility 决定可见性
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40, toJSON: () => ({})
  } as DOMRect);
});

afterEach(() => {
  while (opened.length) opened.pop()!.close();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('KLayerStack z-index 分配', () => {
  it('按入栈顺序从 2000 递增，非栈顶出栈不影响已分配值，全部出栈后回退到 2000', () => {
    const a = openLayer().layer;
    const b = openLayer().layer;
    const c = openLayer().layer;
    expect([a.zIndex.value, b.zIndex.value, c.zIndex.value]).toEqual([2000, 2001, 2002]);

    // 栈顶出栈后，新入栈的层回到 2002（出栈回退）
    c.close();
    const d = openLayer().layer;
    expect(d.zIndex.value).toBe(2002);

    // 中间层出栈：其余层保持原值，新层取「当前最高 + 1」而不是撞车
    b.close();
    expect(a.zIndex.value).toBe(2000);
    expect(d.zIndex.value).toBe(2002);
    const e = openLayer().layer;
    expect(e.zIndex.value).toBe(2003);

    [a, d, e].forEach(l => l.close());
    expect(getLayerStack().size).toBe(0);
    const f = openLayer().layer;
    expect(f.zIndex.value).toBe(LAYER_BASE_Z_INDEX);
  });

  it('未迁移自绘弹层通过 getZIndex 上报固定层级，后入栈的层高于它', () => {
    openLayer(vi.fn(), { getZIndex: () => 2200 });
    const next = openLayer().layer;
    expect(next.zIndex.value).toBe(2201);
  });

  it('重复 open / close 无副作用', () => {
    const { layer } = openLayer();
    layer.open();
    expect(getLayerStack().size).toBe(1);
    layer.close();
    layer.close();
    expect(getLayerStack().size).toBe(0);
  });
});

describe('KLayerStack Esc 派发', () => {
  it('只派给栈顶层；栈顶出栈后下一层接手', () => {
    const lower = openLayer();
    const upper = openLayer();
    const first = pressEscape();
    expect(upper.onEscape).toHaveBeenCalledTimes(1);
    expect(lower.onEscape).not.toHaveBeenCalled();
    expect(first.defaultPrevented).toBe(true);

    upper.layer.close();
    pressEscape();
    expect(lower.onEscape).toHaveBeenCalledTimes(1);
    expect(upper.onEscape).toHaveBeenCalledTimes(1);
  });

  it('栈顶命中后不再向后续监听器传播（不漏给画布快捷键或宿主弹窗）', () => {
    openLayer();
    const downstream = vi.fn();
    document.addEventListener('keydown', downstream);
    pressEscape();
    document.removeEventListener('keydown', downstream);
    expect(downstream).not.toHaveBeenCalled();
  });

  it('非 Escape 键、输入法组字、长按重复一律忽略', () => {
    const { onEscape } = openLayer();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    pressEscape({ isComposing: true });
    pressEscape({ repeat: true });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('栈空时不处理 Esc，且全局监听随栈空摘除、首个入栈时才装', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const a = openLayer().layer;
    const b = openLayer().layer;
    // 两层只装一次监听
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    a.close();
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);
    b.close();
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    const event = pressEscape();
    expect(event.defaultPrevented).toBe(false);
  });

  it('跳过态（最小化）的层不参与仲裁，由下一层接手；恢复后重新成为栈顶', () => {
    const lower = openLayer();
    const upper = openLayer();
    upper.layer.setEscapeSkipped(true);
    pressEscape();
    expect(lower.onEscape).toHaveBeenCalledTimes(1);
    expect(upper.onEscape).not.toHaveBeenCalled();
    upper.layer.setEscapeSkipped(false);
    pressEscape();
    expect(upper.onEscape).toHaveBeenCalledTimes(1);
  });

  it('放行态（关闭确认期间）：既不派发也不拦截，Esc 原样交给上层交互', () => {
    const lower = openLayer();
    const upper = openLayer();
    upper.layer.setEscapePassthrough(true);
    const event = pressEscape();
    expect(upper.onEscape).not.toHaveBeenCalled();
    expect(lower.onEscape).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    upper.layer.setEscapePassthrough(false);
    pressEscape();
    expect(upper.onEscape).toHaveBeenCalledTimes(1);
  });
});

describe('KLayerStack 与 Naive 弹层仲裁', () => {
  it('栈顶层之上有可见 Naive 下拉（z-index 更高）：栈让位，不处理也不拦截', () => {
    const { onEscape } = openLayer();
    addNaiveOverlay({ zIndex: 3000 });
    const event = pressEscape();
    expect(onEscape).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('弹层不可见（display:none）或没有内容时不让位', () => {
    const { onEscape } = openLayer();
    addNaiveOverlay({ zIndex: 3000, hidden: true });
    const empty = document.createElement('div');
    empty.className = 'v-binder-follower-container';
    document.body.appendChild(empty);
    pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('层级低于本层的弹层（属于更下面的层）不算在其上', () => {
    const { onEscape } = openLayer(vi.fn(), { getZIndex: () => 2500 });
    addNaiveOverlay({ zIndex: 2100 });
    pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('tooltip 只是悬浮提示，不响应 Esc，不让位', () => {
    const { onEscape } = openLayer();
    addNaiveOverlay({ zIndex: 3000, tooltip: true });
    pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('位于本层容器内部的弹层（Naive 传送进模态 body）无论 z-index 高低都算在其上', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const { onEscape } = openLayer(vi.fn(), { getZIndex: () => 2005, getElement: () => root });
    addNaiveOverlay({ zIndex: 2000, parent: root });
    const event = pressEscape();
    expect(onEscape).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('同层级时按 DOM 顺序：排在本层之后算在上，之前不算', () => {
    const before = addNaiveOverlay({ zIndex: 2000 });
    const root = document.createElement('div');
    document.body.appendChild(root);
    const { onEscape } = openLayer(vi.fn(), { getZIndex: () => 2000, getElement: () => root });
    // before 在 root 之前（PRECEDING）→ 不算；移除后追加一个在 root 之后的 → 算
    pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
    before.remove();
    addNaiveOverlay({ zIndex: 2000 });
    pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});

/** 造一个 Naive 模态容器：`.n-modal-container > .n-modal`（content=false 时只有遮罩，没有窗口内容）。 */
function addNaiveModal(options: { zIndex?: number; hidden?: boolean; content?: boolean; parent?: HTMLElement } = {}): HTMLElement {
  const container = document.createElement('div');
  container.className = 'n-modal-container';
  if (options.zIndex !== undefined) container.style.zIndex = String(options.zIndex);
  if (options.hidden) container.style.display = 'none';
  const mask = document.createElement('div');
  mask.className = 'n-modal-mask';
  container.appendChild(mask);
  if (options.content !== false) {
    const body = document.createElement('div');
    body.className = 'n-modal';
    container.appendChild(body);
  }
  (options.parent ?? document.body).appendChild(container);
  return container;
}

describe('KLayerStack 未登记 Naive 模态让位', () => {
  it('栈顶层之后出现未登记的可见 NModal：Esc 让位，不处理也不拦截；消失后恢复派发', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const { onEscape } = openLayer(vi.fn(), { getElement: () => root });
    const nested = addNaiveModal();
    const event = pressEscape();
    expect(onEscape).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    nested.remove();
    pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('无嵌套模态时正常派发并拦截', () => {
    const { onEscape } = openLayer();
    const event = pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('已登记层自己的模态容器不被误判（getElement 上报的元素排除）', () => {
    const own = addNaiveModal({ zIndex: 2000 });
    const { onEscape } = openLayer(vi.fn(), { getElement: () => own });
    // 再叠一层同样用 NModal 渲染的已登记层：其容器位于栈顶之后，但已登记，不算未登记嵌套
    const upperContainer = addNaiveModal({ zIndex: 2001 });
    const upper = openLayer(vi.fn(), { getElement: () => upperContainer });
    pressEscape();
    expect(upper.onEscape).toHaveBeenCalledTimes(1);
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('栈顶层所在的祖先容器（宿主祖先弹窗）不算在其上', () => {
    const host = addNaiveModal();
    const inner = document.createElement('div');
    host.appendChild(inner);
    const { onEscape } = openLayer(vi.fn(), { getElement: () => inner });
    pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('不可见、只有遮罩没有窗口内容、DOM 在前且层级更低的模态，均不让位', () => {
    const below = addNaiveModal({ zIndex: 1999 });
    const root = document.createElement('div');
    document.body.appendChild(root);
    const { onEscape } = openLayer(vi.fn(), { getElement: () => root });
    addNaiveModal({ hidden: true });
    addNaiveModal({ content: false });
    pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
    below.remove();
  });

  it('栈顶层没有 getElement 时，只凭 z-index 判断：更高的让位，更低的不让位', () => {
    const { onEscape } = openLayer(vi.fn(), { getZIndex: () => 2200 });
    addNaiveModal({ zIndex: 2100 });
    pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
    addNaiveModal({ zIndex: 2300 });
    pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});
