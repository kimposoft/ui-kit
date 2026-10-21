/**
 * useDialogGeometry 单测：本文件需要 window/PointerEvent，走 happy-dom 环境
 * （本包无独立 vitest.config，运行方式见任务汇报；用 docblock 声明环境不依赖任何全局配置）。
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, type App } from 'vue';
import { DIALOG_SIZE_PRESETS, type DialogSizePreset } from './dialogSizePreset';
import { useDialogGeometry, type UseDialogGeometryOptions, type UseDialogGeometryReturn } from './useDialogGeometry';

function mountGeometry(options: UseDialogGeometryOptions): {
  api: UseDialogGeometryReturn;
  app: App;
  unmount: () => void;
} {
  let api!: UseDialogGeometryReturn;
  const app = createApp({
    setup() {
      api = useDialogGeometry(options);
      return () => null;
    }
  });
  const el = document.createElement('div');
  app.mount(el);
  return { api, app, unmount: () => app.unmount() };
}

/** 派发一个带 clientX/clientY 的 window 级 PointerEvent，模拟拖拽过程中的 move/up。 */
function firePointer(type: 'pointermove' | 'pointerup', clientX = 0, clientY = 0): void {
  window.dispatchEvent(new PointerEvent(type, { clientX, clientY }));
}

function makePointerDown(clientX: number, clientY: number): PointerEvent {
  return new PointerEvent('pointerdown', { clientX, clientY });
}

/** 从 style.transform 解析当前拖动偏移（px）；非普通态 transform 没有偏移项时直接让断言失败。 */
function readOffset(api: UseDialogGeometryReturn): { x: number; y: number } {
  const m = api.style.value.transform.match(/calc\(-50% \+ (-?\d+(?:\.\d+)?)px\), calc\(-50% \+ (-?\d+(?:\.\d+)?)px\)/);
  expect(m).not.toBeNull();
  const [, x, y] = m as unknown as [string, string, string];
  return { x: Number(x), y: Number(y) };
}

/**
 * 按 useDialogGeometry 的定位基准（fixed + left/top 50% + translate(-50%,-50%) 再叠加偏移）换算
 * 弹窗在视口里的四条边——断言口径是「标题栏在视口内」这种几何事实，而不是对拍内部偏移公式。
 */
function dialogEdges(api: UseDialogGeometryReturn): { left: number; right: number; top: number; bottom: number } {
  const off = readOffset(api);
  const { width, height } = api.size.value;
  const left = (window.innerWidth - width) / 2 + off.x;
  const top = (window.innerHeight - height) / 2 + off.y;
  return { left, right: left + width, top, bottom: top + height };
}

describe('useDialogGeometry', () => {
  let unmount: (() => void) | null = null;

  beforeEach(() => {
    // 固定视口尺寸，让 maxWidth=min(1200, 0.92vw)、maxHeight=0.9vh 等钳制值在各用例间可预测。
    (window as unknown as { innerWidth: number }).innerWidth = 1400;
    (window as unknown as { innerHeight: number }).innerHeight = 900;
  });

  afterEach(() => {
    unmount?.();
    unmount = null;
  });

  it('默认尺寸：无 load 时使用 defaultWidth/defaultHeight', () => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360
    });
    unmount = u;
    expect(api.size.value).toEqual({ width: 760, height: 520 });
    expect(api.style.value.width).toBe('760px');
    expect(api.style.value.height).toBe('520px');
    // 未拖动过，居中偏移为 0。
    expect(api.style.value.transform).toBe('translate(calc(-50% + 0px), calc(-50% + 0px))');
  });

  it('load 读回：优先用持久化尺寸；缺失的维度落回默认值', () => {
    const load = vi.fn(() => ({ width: 900 })); // 只给 width，height 应落回 default
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360,
      load
    });
    unmount = u;
    expect(load).toHaveBeenCalledTimes(1);
    expect(api.size.value).toEqual({ width: 900, height: 520 });
  });

  it('load 返回 null：等同未提供 load，使用默认值', () => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360,
      load: () => null
    });
    unmount = u;
    expect(api.size.value).toEqual({ width: 760, height: 520 });
  });

  it('load 非法或旧格式尺寸：逐维回落默认值后再执行视口钳制', () => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360,
      load: () => ({ width: Number.NaN, height: -1 })
    });
    unmount = u;
    expect(api.size.value).toEqual({ width: 760, height: 520 });
  });

  it('缩放钳制到 max：拖到远超上限，被钳制到 min(1200, 92vw) / 90vh', () => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360
    });
    unmount = u;
    // innerWidth=1400 → 92vw=1288 > 1200，故 maxWidth 取 1200；innerHeight=900 → maxHeight=810。
    api.onResizePointerDown(makePointerDown(0, 0));
    firePointer('pointermove', 5000, 5000);
    expect(api.size.value).toEqual({ width: 1200, height: 810 });
    firePointer('pointerup');
  });

  it('maxWidth 传 Infinity＝不要硬顶：只受视口比例约束，不再退回 1200', () => {
    // 🔴 这条守护一个真踩过的坑：内部取上限的 finiteOr 用 Number.isFinite 判定，
    // 传 Infinity 会被判为"无效"而静默退回 1200 硬顶——调用方写了 maxWidth: Infinity 等于没写。
    // 宽屏上的表现就是"拖拽柄拉不动了"（用户实测反馈）。
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360,
      maxWidth: Number.POSITIVE_INFINITY,
      maxWidthRatio: 0.98
    });
    unmount = u;
    api.onResizePointerDown(makePointerDown(0, 0));
    firePointer('pointermove', 5000, 0);
    // innerWidth=1400 → 98vw=1372；若 Infinity 被吞掉退回 1200，这里会是 1200。
    expect(api.size.value.width).toBe(1372);
    firePointer('pointerup');
  });

  it('最大化比例传 1＝铺满视口，四边不留空', () => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360,
      maximizedWidthRatio: 1,
      maximizedHeightRatio: 1
    });
    unmount = u;
    api.toggleMaximize();
    expect(api.style.value.width).toBe('100vw');
    expect(api.style.value.height).toBe('100vh');
    // size 也要按满视口换算（内嵌面板据此分配树坞/编辑区高度）
    expect(api.size.value).toEqual({ width: 1400, height: 900 });
  });

  it('缩放钳制到 min：拖到远小于下限，被钳制到 minWidth/minHeight', () => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360
    });
    unmount = u;
    api.onResizePointerDown(makePointerDown(0, 0));
    firePointer('pointermove', -5000, -5000);
    expect(api.size.value).toEqual({ width: 480, height: 360 });
    firePointer('pointerup');
  });

  it('自定义视口上限与最大化比例：供 ActionDesigner 等大壳复用', () => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 1200,
      defaultHeight: 700,
      minWidth: 560,
      minHeight: 380,
      maxWidth: 1280,
      maxWidthRatio: 0.88,
      maxHeightRatio: 0.86,
      maximizedWidthRatio: 1,
      maximizedHeightRatio: 1
    });
    unmount = u;
    api.onResizePointerDown(makePointerDown(0, 0));
    firePointer('pointermove', 5000, 5000);
    firePointer('pointerup');
    expect(api.size.value).toEqual({ width: 1232, height: 774 });
    api.toggleMaximize();
    expect(api.style.value).toEqual({
      width: '100vw',
      height: '100vh',
      transform: 'translate(-50%, -50%)'
    });
  });

  it.each([
    ['n', 760, 480],
    ['s', 760, 560],
    ['e', 800, 520],
    ['w', 720, 520],
    ['ne', 800, 480],
    ['nw', 720, 480],
    ['se', 800, 560],
    ['sw', 720, 560]
  ] as const)('八向缩放 %s 更新对应维度', (direction, expectedWidth, expectedHeight) => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360
    });
    unmount = u;
    api.onResizePointerDown(makePointerDown(0, 0), direction);
    firePointer('pointermove', 40, 40);
    firePointer('pointerup');
    expect(api.size.value).toEqual({
      width: expectedWidth,
      height: expectedHeight
    });
  });

  it('最大化时拖动/缩放是 no-op：两个 pointerdown 直接返回，不注册监听器', () => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360
    });
    unmount = u;
    api.toggleMaximize();
    expect(api.maximized.value).toBe(true);
    expect(api.style.value).toEqual({
      width: '96vw',
      height: '92vh',
      transform: 'translate(-50%, -50%)'
    });

    // 直接断言"没有注册 window 监听器"，而不是只看 size/style——size/style 在 maximized 分支下
    // 会强制走 96vw/92vh/innerWidth*0.96 等固定表达式，即便内部 width/height ref 被意外改写也会被
    // 这层分支盖住看不出来（反验时曾在此处失手一次：去掉 onResizePointerDown 的 maximized 守卫后，
    // 仅凭 size 断言居然仍是绿的，改用 spy 断言监听器数量才真正堵住这个规避路径）。
    const addSpy = vi.spyOn(window, 'addEventListener');
    api.onHeaderPointerDown(makePointerDown(0, 0));
    api.onResizePointerDown(makePointerDown(0, 0));
    expect(addSpy).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it('restore() 在未最大化时是 no-op', () => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360
    });
    unmount = u;
    // 先手动缩放出一个非默认尺寸，证明 restore() 不会把它"顺手"重置回默认值。
    api.onResizePointerDown(makePointerDown(0, 0));
    firePointer('pointermove', 40, 40);
    firePointer('pointerup');
    const before = api.size.value;
    expect(api.maximized.value).toBe(false);
    api.restore();
    expect(api.maximized.value).toBe(false);
    expect(api.size.value).toEqual(before);
  });

  it('restore() 从最大化态还原到记忆尺寸（拖拽产生的尺寸，非设计默认值）', () => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360
    });
    unmount = u;
    api.onResizePointerDown(makePointerDown(0, 0));
    firePointer('pointermove', 40, 40); // 800x560
    firePointer('pointerup');
    api.toggleMaximize();
    expect(api.maximized.value).toBe(true);
    api.restore();
    expect(api.maximized.value).toBe(false);
    expect(api.size.value).toEqual({ width: 800, height: 560 });
  });

  it('reset()：位置归零、退出最大化、尺寸重新读回记忆值', () => {
    let loadResult = { width: 800, height: 600 };
    const load = vi.fn(() => loadResult);
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360,
      load
    });
    unmount = u;
    expect(api.size.value).toEqual({ width: 800, height: 600 });

    // 拖动出一个非零偏移 + 进入最大化，制造"脏"状态。
    api.onHeaderPointerDown(makePointerDown(0, 0));
    firePointer('pointermove', 30, 15);
    firePointer('pointerup');
    expect(api.style.value.transform).not.toBe('translate(calc(-50% + 0px), calc(-50% + 0px))');
    api.toggleMaximize();
    expect(api.maximized.value).toBe(true);

    // reset 前更换 load 的返回值，验证 reset() 确实重新调用了 load（而非复用初始化时的缓存值）。
    loadResult = { width: 900, height: 650 };
    api.reset();

    expect(api.maximized.value).toBe(false);
    expect(api.style.value.transform).toBe('translate(calc(-50% + 0px), calc(-50% + 0px))');
    expect(api.size.value).toEqual({ width: 900, height: 650 });
    expect(load).toHaveBeenCalledTimes(2); // 初始化一次 + reset 一次
  });

  it('save 只在缩放拖拽结束时调用一次，pointermove 过程中不调用', () => {
    const save = vi.fn();
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360,
      save
    });
    unmount = u;
    api.onResizePointerDown(makePointerDown(0, 0));
    firePointer('pointermove', 10, 10);
    firePointer('pointermove', 20, 20);
    firePointer('pointermove', 30, 30);
    expect(save).not.toHaveBeenCalled(); // 拖拽过程中不逐帧落盘
    firePointer('pointerup');
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ width: 790, height: 550 });
  });

  it('save 不因标题栏拖动移动而触发（位置不持久化，见 DialogGeometry.offsetX 字段注释）', () => {
    const save = vi.fn();
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360,
      save
    });
    unmount = u;
    api.onHeaderPointerDown(makePointerDown(0, 0));
    firePointer('pointermove', 50, 50);
    firePointer('pointerup');
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ['右', 100000, 0],
    ['左', -100000, 0],
    ['上', 0, -100000],
    ['下', 0, 100000]
  ] as const)('拖动钳制：往%s拖到极远处，标题栏整条仍留在视口内', (_dir, dx, dy) => {
    // 🔴 此前只保证弹窗任一侧留 40px 在视口内，标题栏可被整条拖出屏幕只剩一角主体（用户 2026-09-07
    // 提出「title 区域应保持在窗口内」）。现口径：左右边缘不出视口、顶边不出上沿、标题栏底边不出下沿。
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360,
      headerHeight: 53
    });
    unmount = u;
    api.onHeaderPointerDown(makePointerDown(0, 0));
    firePointer('pointermove', dx, dy);
    firePointer('pointerup');
    const edges = dialogEdges(api);
    expect(edges.left).toBeGreaterThanOrEqual(0);
    expect(edges.right).toBeLessThanOrEqual(1400);
    expect(edges.top).toBeGreaterThanOrEqual(0);
    expect(edges.top + 53).toBeLessThanOrEqual(900); // 标题栏底边（顶边 + headerHeight）不出下沿
    // 钳制是「贴边」而非「不动」：对应方向确实被推到了边上，证明拖动本身仍然生效。
    if (dx > 0) expect(edges.right).toBe(1400);
    if (dx < 0) expect(edges.left).toBe(0);
    if (dy < 0) expect(edges.top).toBe(0);
    if (dy > 0) expect(edges.top + 53).toBe(900);
  });

  it('拖动钳制：标题栏高度按 pointerdown 的 currentTarget 实测，优先于 headerHeight 兜底值', () => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360,
      headerHeight: 53
    });
    unmount = u;
    // 模拟一个实际渲染高 64px 的标题栏元素，把 pointerdown 经元素派发（currentTarget 才有值）。
    const header = document.createElement('div');
    header.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 760, bottom: 64, width: 760, height: 64, toJSON: () => ({}) }) as DOMRect;
    header.addEventListener('pointerdown', e => api.onHeaderPointerDown(e as PointerEvent));
    header.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }));
    firePointer('pointermove', 0, 100000);
    firePointer('pointerup');
    // 若仍按兜底 53 钳制，顶边会停在 847；按实测 64 应停在 836。
    expect(dialogEdges(api).top + 64).toBe(900);
  });

  it('拖动钳制：视口缩小后重新钳制偏移，标题栏仍留在视口内', () => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360,
      headerHeight: 53
    });
    unmount = u;
    api.onHeaderPointerDown(makePointerDown(0, 0));
    firePointer('pointermove', 100000, 100000); // 先贴到右下角
    firePointer('pointerup');
    expect(dialogEdges(api).right).toBe(1400);
    (window as unknown as { innerWidth: number }).innerWidth = 1000;
    (window as unknown as { innerHeight: number }).innerHeight = 600;
    window.dispatchEvent(new Event('resize'));
    const edges = dialogEdges(api);
    expect(edges.right).toBeLessThanOrEqual(1000);
    expect(edges.top + 53).toBeLessThanOrEqual(600);
  });

  it('卸载后监听器已移除：拖拽进行中卸载组件，后续 pointermove 不再改变状态', () => {
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 760,
      defaultHeight: 520,
      minWidth: 480,
      minHeight: 360
    });
    api.onResizePointerDown(makePointerDown(0, 0));
    firePointer('pointermove', 10, 10);
    const sizeBeforeUnmount = api.size.value;
    u(); // 拖拽尚未 pointerup 就卸载，命中 onBeforeUnmount 的兜底清理分支
    firePointer('pointermove', 500, 500);
    firePointer('pointerup');
    expect(api.size.value).toEqual(sizeBeforeUnmount); // 监听器已被移除，后续事件不再生效
    unmount = null; // 已手动卸载，避免 afterEach 重复 unmount
  });

  it('视口变化重新钳制尺寸并通知宿主', () => {
    const onSizeChange = vi.fn();
    const { api, unmount: u } = mountGeometry({
      defaultWidth: 1100,
      defaultHeight: 700,
      minWidth: 480,
      minHeight: 360,
      onSizeChange
    });
    unmount = u;
    (window as unknown as { innerWidth: number }).innerWidth = 900;
    (window as unknown as { innerHeight: number }).innerHeight = 700;
    window.dispatchEvent(new Event('resize'));
    expect(api.size.value).toEqual({ width: 828, height: 630 });
    expect(onSizeChange).toHaveBeenLastCalledWith({ width: 828, height: 630 }, 'viewport');
  });
});

describe('自适应档位', () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());
  function viewport(width: number, height: number) {
    Object.assign(window, { innerWidth: width, innerHeight: height });
    window.dispatchEvent(new Event('resize'));
  }
  function open(sizePreset: DialogSizePreset, extra: Partial<UseDialogGeometryOptions> = {}) {
    const p = DIALOG_SIZE_PRESETS[sizePreset];
    const mounted = mountGeometry({
      sizePreset, defaultWidth: p.width, defaultHeight: p.height,
      minWidth: p.minWidth, minHeight: p.minHeight, maxWidth: p.maxWidth, maxHeight: p.maxHeight,
      maxWidthRatio: 0.98, maxHeightRatio: 0.96, maximizedWidthRatio: 1, maximizedHeightRatio: 1,
      ...extra
    });
    cleanup = mounted.unmount;
    return mounted.api;
  }
  it.each([
    ['M', 1093, 500, 830, 480, false], ['M', 1280, 600, 830, 576, false],
    ['M', 1920, 940, 960, 676.8, false], ['M', 2560, 1300, 1080, 855, false],
    ['L', 1093, 500, 1093, 500, true], ['L', 1280, 600, 1000, 576, false],
    ['L', 1920, 940, 1280, 752, false], ['L', 2560, 1300, 1440, 990, false],
    ['XL', 1093, 500, 1093, 500, true], ['XL', 1280, 600, 1280, 600, true],
    ['XL', 1920, 940, 1600, 900, false], ['XL', 2560, 1300, 1800, 1118, false]
  ] as const)('%s 在 %i×%i 的尺寸和自动状态', (preset, vw, vh, w, h, auto) => {
    viewport(vw, vh);
    const api = open(preset, preset === 'XL' ? { defaultWidth: 1228, defaultHeight: 900 } : {});
    expect(api.size.value.width).toBeCloseTo(w);
    expect(api.size.value.height).toBeCloseTo(h);
    expect(api.autoMaximized.value).toBe(auto);
  });
  it('未手动缩放时双向重算；CSS viewport跨2200断点，不依赖DPR或物理屏幕', () => {
    viewport(1280, 600);
    const api = open('L');
    viewport(2560, 1300);
    expect(api.size.value).toEqual({ width: 1440, height: 990 });
    viewport(2200, 1300);
    expect(api.size.value).toEqual({ width: 1280, height: 880 });
    viewport(2201, 1300);
    expect(api.size.value).toEqual({ width: 1440, height: 990 });
    viewport(1093, 500);
    expect(api.autoMaximized.value).toBe(true);
    expect(api.size.value).toEqual({ width: 1093, height: 500 });
    viewport(1920, 940);
    expect(api.maximized.value).toBe(false);
    expect(api.size.value).toEqual({ width: 1280, height: 752 });
  });
  it('手动最大化与自动态独立，视口更新回调和全屏size实时准确且均不保存', () => {
    viewport(1920, 940);
    const save = vi.fn();
    const onSizeChange = vi.fn();
    const api = open('L', { save, onSizeChange });
    api.toggleMaximize();
    viewport(1093, 500);
    expect(api.manualMaximized.value).toBe(true);
    expect(api.autoMaximized.value).toBe(true);
    expect(api.size.value).toEqual({ width: 1093, height: 500 });
    api.restore();
    expect(api.manualMaximized.value).toBe(false);
    expect(api.maximized.value).toBe(true);
    viewport(2560, 1300);
    expect(api.maximized.value).toBe(false);
    api.toggleMaximize();
    viewport(1920, 940);
    expect(api.manualMaximized.value).toBe(true);
    expect(api.size.value).toEqual({ width: 1920, height: 940 });
    expect(onSizeChange).toHaveBeenLastCalledWith({ width: 1920, height: 940 }, 'viewport');
    expect(save).not.toHaveBeenCalled();
  });
  it('比例优先，旧像素兼容，非法比例逐维回落；小屏夹断不破坏原比例', () => {
    viewport(1920, 940);
    const api = open('L', { load: () => ({ width: 1, height: 1, wr: 0.6, hr: 0.7 }) });
    expect(api.size.value.width).toBe(1152);
    expect(api.size.value.height).toBe(658);
    viewport(800, 400);
    expect(api.autoMaximized.value).toBe(true);
    viewport(1920, 940);
    expect(api.size.value.width).toBe(1152);
    expect(api.size.value.height).toBe(658);
    cleanup?.();
    const old = open('L', { load: () => ({ width: 1100, height: 650, wr: NaN, hr: -1 }) });
    expect(old.size.value).toEqual({ width: 1100, height: 650 });
  });
  it('手动缩放保存比例，下次跨屏按原比例恢复；缺失记忆维度继续按默认公式', () => {
    viewport(1920, 940);
    const save = vi.fn();
    const api = open('L', { load: () => ({ width: 1100 }), save });
    expect(api.size.value.height).toBe(752);
    api.onResizePointerDown(makePointerDown(0, 0));
    firePointer('pointermove', 100, -52);
    firePointer('pointerup');
    expect(save).toHaveBeenCalledWith({ width: 1200, height: 700, wr: 1200 / 1920, hr: 700 / 940 });
    viewport(1093, 500);
    viewport(1920, 940);
    expect(api.size.value).toEqual({ width: 1200, height: 700 });
  });
  it('只点击手柄不锁定默认尺寸，之后仍按视口自动放大', () => {
    viewport(1280, 600);
    const save = vi.fn();
    const api = open('M', { save });
    api.onResizePointerDown(makePointerDown(0, 0));
    firePointer('pointermove', 0, 0);
    firePointer('pointerup');
    expect(save).not.toHaveBeenCalled();
    viewport(1920, 940);
    expect(api.size.value).toEqual({ width: 960, height: 676.8 });
  });
  it.each(['e', 'se'] as const)('%s仅横向移动时保留被小屏高度下限夹住的原始hr', direction => {
    viewport(1920, 940);
    const save = vi.fn();
    const api = open('M', { save, load: () => ({ wr: 0.85, hr: 0.6 }) });
    viewport(1280, 600);
    expect(api.size.value).toEqual({ width: 960, height: 480 });
    api.onResizePointerDown(makePointerDown(0, 0), direction);
    firePointer('pointermove', -40, 0);
    firePointer('pointerup');
    expect(save).toHaveBeenCalledWith({ width: 920, height: 480, wr: 920 / 1280, hr: 0.6 });
    viewport(1920, 940);
    expect(api.size.value.height).toBe(564);
  });
  it('不传档位继续忽略比例记忆，视口放大不改变原像素尺寸', () => {
    viewport(1920, 940);
    const mounted = mountGeometry({ defaultWidth: 760, defaultHeight: 520, minWidth: 480, minHeight: 360,
      load: () => ({ width: 800, height: 600, wr: 0.99, hr: 0.99 }) });
    cleanup = mounted.unmount;
    viewport(2560, 1300);
    expect(mounted.api.size.value).toEqual({ width: 800, height: 600 });
    expect(mounted.api.autoMaximized.value).toBe(false);
  });
});
