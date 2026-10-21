/**
 * KControlSize 单测：容器内各 Naive 表单控件取到钉定的档位数值；
 * 同容器 size=small 与默认 medium 各取各档；NSwitch 轨道 / 滑块尺寸钉定（无 tiny 档）；容器外、容器内按钮不受影响；includeButton 时按钮受影响；
 * 外层 darkTheme / common 覆盖在容器内保留。
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, type PropType } from 'vue';
import {
  NAutoComplete,
  NButton,
  NCheckbox,
  NColorPicker,
  NConfigProvider,
  NDatePicker,
  NInput,
  NInputNumber,
  NRadio,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSwitch,
  NTimePicker,
  darkTheme,
  useThemeVars
} from 'naive-ui';
import KControlSize from './KControlSize.vue';
import type { KControlSizeTiers } from './KControlSize.vue';

const mounted: VueWrapper[] = [];
afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount();
  document.body.innerHTML = '';
});

const TIERS: KControlSizeTiers = {
  small: { height: 24, fontSize: 12, paddingX: 8, boxSize: 12 },
  medium: { height: 32, fontSize: 14, paddingX: 10, boxSize: 15 }
};

/** 读元素 inline style 里的 CSS 变量（Naive 把主题变量写在控件根元素的 style 上）。 */
function cssVar(el: Element | null, name: string): string {
  expect(el).toBeTruthy();
  const style = (el as HTMLElement).getAttribute('style') ?? '';
  const m = style.match(new RegExp(`${name}:\\s*([^;]+)`));
  return m ? m[1].trim() : '';
}

/** 挂载：用 render 函数把 children 放进 KControlSize。 */
function mountIn(children: () => unknown, props: Record<string, unknown> = { tiers: TIERS }) {
  const w = mount(
    defineComponent({
      render: () => h(KControlSize, props, { default: () => children() as never })
    }),
    { attachTo: document.body }
  );
  mounted.push(w);
  return w;
}

describe('KControlSize 输入类', () => {
  it('NInput：small / 默认 medium 各取各档的 height / font-size / padding', () => {
    const w = mountIn(() => [h(NInput, { size: 'small', class: 'a' }), h(NInput, { class: 'b' })]);
    const a = w.find('.a').element;
    const b = w.find('.b').element;
    expect(cssVar(a, '--n-height')).toBe('24px');
    expect(cssVar(a, '--n-font-size')).toBe('12px');
    expect(cssVar(a, '--n-padding-left')).toBe('8px');
    expect(cssVar(a, '--n-padding-right')).toBe('8px');
    expect(cssVar(b, '--n-height')).toBe('32px');
    expect(cssVar(b, '--n-font-size')).toBe('14px');
    expect(cssVar(b, '--n-padding-left')).toBe('10px');
  });

  it('未钉定的档（large）保持 Naive 原值', () => {
    const w = mountIn(() => h(NInput, { size: 'large', class: 'a' }));
    expect(cssVar(w.find('.a').element, '--n-height')).toBe('40px');
  });

  it('容器外同类控件不受影响', () => {
    const w = mount(
      defineComponent({
        render: () => h('div', [h(KControlSize, { tiers: TIERS }, { default: () => h(NInput, { class: 'in' }) }), h(NInput, { class: 'out' })])
      }),
      { attachTo: document.body }
    );
    mounted.push(w);
    expect(cssVar(w.find('.in').element, '--n-height')).toBe('32px');
    expect(cssVar(w.find('.out').element, '--n-height')).toBe('34px');
  });

  it('NInputNumber：内部 Input 取到钉定值', () => {
    const w = mountIn(() => [h(NInputNumber, { size: 'small', class: 'a' }), h(NInputNumber, { class: 'b' })]);
    const inputs = w.findAll('.n-input');
    expect(cssVar(inputs[0].element, '--n-height')).toBe('24px');
    expect(cssVar(inputs[0].element, '--n-font-size')).toBe('12px');
    expect(cssVar(inputs[1].element, '--n-height')).toBe('32px');
    expect(cssVar(inputs[1].element, '--n-padding-left')).toBe('10px');
  });

  it('NDatePicker / NTimePicker / NAutoComplete：内部 Input 取到钉定值', () => {
    const w = mountIn(() => [
      h(NDatePicker, { size: 'small' }),
      h(NTimePicker, { size: 'small' }),
      h(NAutoComplete, { size: 'small' }),
      h(NDatePicker, {})
    ]);
    const inputs = w.findAll('.n-input');
    expect(inputs).toHaveLength(4);
    for (const i of [0, 1, 2]) {
      expect(cssVar(inputs[i].element, '--n-height')).toBe('24px');
      expect(cssVar(inputs[i].element, '--n-font-size')).toBe('12px');
      expect(cssVar(inputs[i].element, '--n-padding-left')).toBe('8px');
    }
    expect(cssVar(inputs[3].element, '--n-height')).toBe('32px');
  });
});

describe('KControlSize 选择类 / 颜色 / 勾选类', () => {
  it('NSelect：InternalSelection 的 height / font-size / padding-left 钉定，右侧箭头预留保持 26px', () => {
    const w = mountIn(() => [h(NSelect, { size: 'small', options: [] }), h(NSelect, { options: [] })]);
    const sels = w.findAll('.n-base-selection');
    expect(sels).toHaveLength(2);
    expect(cssVar(sels[0].element, '--n-height')).toBe('24px');
    expect(cssVar(sels[0].element, '--n-font-size')).toBe('12px');
    expect(cssVar(sels[1].element, '--n-height')).toBe('32px');
    expect(cssVar(sels[1].element, '--n-font-size')).toBe('14px');
    // padding 不分档：取 medium 的 paddingX=10
    expect(cssVar(sels[0].element, '--n-padding-single-left')).toBe('10px');
    expect(cssVar(sels[0].element, '--n-padding-single-right')).toBe('26px');
  });

  it('NColorPicker：height / font-size 钉定', () => {
    const w = mountIn(() => [h(NColorPicker, { size: 'small' }), h(NColorPicker, {})]);
    const cps = w.findAll('.n-color-picker');
    expect(cssVar(cps[0].element, '--n-height')).toBe('24px');
    expect(cssVar(cps[0].element, '--n-font-size')).toBe('12px');
    expect(cssVar(cps[1].element, '--n-height')).toBe('32px');
    expect(cssVar(cps[1].element, '--n-font-size')).toBe('14px');
  });

  it('NCheckbox：方块边长 --n-size 与文字字号钉定', () => {
    const w = mountIn(() => [h(NCheckbox, { size: 'small' }, () => '甲'), h(NCheckbox, {}, () => '乙')]);
    const cbs = w.findAll('.n-checkbox');
    expect(cssVar(cbs[0].element, '--n-size')).toBe('12px');
    expect(cssVar(cbs[0].element, '--n-font-size')).toBe('12px');
    expect(cssVar(cbs[1].element, '--n-size')).toBe('15px');
    expect(cssVar(cbs[1].element, '--n-font-size')).toBe('14px');
  });

  it('NRadio：圆点边长 --n-radio-size 与字号钉定', () => {
    const w = mountIn(() => [h(NRadio, { size: 'small' }, () => '甲'), h(NRadio, {}, () => '乙')]);
    const rs = w.findAll('.n-radio');
    expect(cssVar(rs[0].element, '--n-radio-size')).toBe('12px');
    expect(cssVar(rs[0].element, '--n-font-size')).toBe('12px');
    expect(cssVar(rs[1].element, '--n-radio-size')).toBe('15px');
    expect(cssVar(rs[1].element, '--n-font-size')).toBe('14px');
  });

  it('NRadioButton（在 NRadioGroup 内）：按钮组 --n-height / --n-font-size 钉定', () => {
    const w = mountIn(() => [
      h(NRadioGroup, { size: 'small', class: 'g1' }, () => h(NRadioButton, { value: 'a' }, () => 'A')),
      h(NRadioGroup, { class: 'g2' }, () => h(NRadioButton, { value: 'a' }, () => 'A'))
    ]);
    expect(cssVar(w.find('.g1').element, '--n-height')).toBe('24px');
    expect(cssVar(w.find('.g1').element, '--n-font-size')).toBe('12px');
    expect(cssVar(w.find('.g2').element, '--n-height')).toBe('32px');
    expect(cssVar(w.find('.g2').element, '--n-font-size')).toBe('14px');
  });
});

describe('KControlSize 开关（NSwitch）', () => {
  /** 开关专用钉定表：small 与默认 medium 各一档，tiny 档给了也应被忽略（Switch 无 tiny）。 */
  const SW_TIERS: KControlSizeTiers = {
    tiny: { switchWidth: 10, switchHeight: 10, switchButtonSize: 8 },
    small: { switchWidth: 30, switchHeight: 16, switchButtonSize: 12 },
    medium: { switchWidth: 36, switchHeight: 20, switchButtonSize: 16 }
  };

  it('small / 默认 medium 各取各档的轨道宽高、滑块边长与按下拉伸宽度', () => {
    const w = mountIn(() => [h(NSwitch, { size: 'small', class: 'a' }), h(NSwitch, { class: 'b' })], { tiers: SW_TIERS });
    const a = w.find('.a').element;
    const b = w.find('.b').element;
    expect(cssVar(a, '--n-rail-width')).toBe('30px');
    expect(cssVar(a, '--n-rail-height')).toBe('16px');
    expect(cssVar(a, '--n-button-width')).toBe('12px');
    expect(cssVar(a, '--n-button-height')).toBe('12px');
    expect(cssVar(a, '--n-button-width-pressed')).toBe('18px');
    expect(cssVar(b, '--n-rail-width')).toBe('36px');
    expect(cssVar(b, '--n-rail-height')).toBe('20px');
    expect(cssVar(b, '--n-button-width')).toBe('16px');
    expect(cssVar(b, '--n-button-width-pressed')).toBe('22px');
  });

  it('未钉定的档（large）与只给了部分字段时未给的字段保持 Naive 原值', () => {
    const w = mountIn(() => [h(NSwitch, { size: 'large', class: 'a' }), h(NSwitch, { class: 'b' })], {
      tiers: { medium: { switchWidth: 36 } }
    });
    const a = w.find('.a').element;
    expect(cssVar(a, '--n-rail-width')).toBe('48px');
    expect(cssVar(a, '--n-rail-height')).toBe('26px');
    const b = w.find('.b').element;
    expect(cssVar(b, '--n-rail-width')).toBe('36px');
    // 没给 switchHeight / switchButtonSize：沿用 Naive medium 默认
    expect(cssVar(b, '--n-rail-height')).toBe('22px');
    expect(cssVar(b, '--n-button-width')).toBe('18px');
    expect(cssVar(b, '--n-button-width-pressed')).toBe('24px');
  });

  it('不含开关字段的 tiers 不覆盖 Switch；容器外开关不受影响', () => {
    const w = mount(
      defineComponent({
        render: () =>
          h('div', [
            h(KControlSize, { tiers: TIERS }, { default: () => h(NSwitch, { class: 'plain' }) }),
            h(KControlSize, { tiers: SW_TIERS }, { default: () => h(NSwitch, { class: 'in' }) }),
            h(NSwitch, { class: 'out' })
          ])
      }),
      { attachTo: document.body }
    );
    mounted.push(w);
    expect(cssVar(w.find('.plain').element, '--n-rail-width')).toBe('40px');
    expect(cssVar(w.find('.in').element, '--n-rail-width')).toBe('36px');
    expect(cssVar(w.find('.out').element, '--n-rail-width')).toBe('40px');
    expect(cssVar(w.find('.out').element, '--n-rail-height')).toBe('22px');
  });

  it('暗色主题继承：开关在容器内仍是暗色主题的轨道色，只有尺寸被钉定', () => {
    const mk = (pinned: boolean) =>
      mount(
        defineComponent({
          render: () =>
            h(NConfigProvider, { theme: darkTheme }, {
              default: () =>
                pinned
                  ? h(KControlSize, { tiers: SW_TIERS }, { default: () => h(NSwitch, { class: 'sw' }) })
                  : h(NSwitch, { class: 'sw' })
            })
        }),
        { attachTo: document.body }
      );
    const pinned = mk(true);
    mounted.push(pinned);
    const free = mk(false);
    mounted.push(free);
    const p = pinned.find('.sw').element;
    const f = free.find('.sw').element;
    expect(cssVar(p, '--n-rail-width')).toBe('36px');
    expect(cssVar(p, '--n-rail-color')).toBe(cssVar(f, '--n-rail-color'));
    expect(cssVar(p, '--n-rail-color-active')).toBe(cssVar(f, '--n-rail-color-active'));
    expect(cssVar(p, '--n-button-color')).toBe(cssVar(f, '--n-button-color'));
  });
});

describe('KControlSize 按钮与主题继承', () => {
  it('NButton 默认不受影响；includeButton 时同档位钉定', () => {
    const plain = mountIn(() => h(NButton, { size: 'small', class: 'btn' }, () => '按钮'));
    expect(cssVar(plain.find('.btn').element, '--n-height')).toBe('28px');
    expect(cssVar(plain.find('.btn').element, '--n-font-size')).toBe('14px');
    const incl = mountIn(() => h(NButton, { size: 'small', class: 'btn2' }, () => '按钮'), { tiers: TIERS, includeButton: true });
    expect(cssVar(incl.find('.btn2').element, '--n-height')).toBe('24px');
    expect(cssVar(incl.find('.btn2').element, '--n-font-size')).toBe('12px');
    expect(cssVar(incl.find('.btn2').element, '--n-padding')).toBe('0 8px');
  });

  it('不产生额外 DOM（abstract）', () => {
    const w = mount(
      defineComponent({
        render: () => h('div', { class: 'host' }, [h(KControlSize, { tiers: TIERS }, { default: () => h('span', { class: 'child' }, 'x') })])
      })
    );
    mounted.push(w);
    expect(w.find('.host').element.children).toHaveLength(1);
    expect(w.find('.host').element.firstElementChild!.className).toBe('child');
  });

  it('外层 darkTheme 与 common 覆盖在容器内保留', () => {
    // 探针组件：读取容器内生效的 common 变量与主题名
    const Probe = defineComponent({
      props: { out: { type: Object as PropType<Record<string, string>>, required: true } },
      setup(p) {
        const vars = useThemeVars();
        return () => {
          p.out.radius = vars.value.borderRadius;
          p.out.fontSizeSmall = vars.value.fontSizeSmall;
          p.out.bodyColor = vars.value.bodyColor;
          return h('i');
        };
      }
    });
    const inside: Record<string, string> = {};
    const outside: Record<string, string> = {};
    const w = mount(
      defineComponent({
        render: () =>
          h(
            NConfigProvider,
            { theme: darkTheme, themeOverrides: { common: { borderRadius: '4px', fontSizeSmall: '12px' } } },
            {
              default: () => [
                h(KControlSize, { tiers: TIERS }, { default: () => [h(Probe, { out: inside }), h(NInput, { class: 'in' })] }),
                h(Probe, { out: outside })
              ]
            }
          )
      }),
      { attachTo: document.body }
    );
    mounted.push(w);
    // common 覆盖保留
    expect(inside.radius).toBe('4px');
    expect(inside.fontSizeSmall).toBe('12px');
    // 仍是暗色：与容器外同一份 body 背景（暗色主题的 bodyColor）
    expect(inside.bodyColor).toBe(outside.bodyColor);
    expect(inside.bodyColor).toBe(darkTheme.common!.bodyColor);
    // 容器内控件使用暗色输入框底色 + 钉定高度
    expect(cssVar(w.find('.in').element, '--n-height')).toBe('32px');
    expect(cssVar(w.find('.in').element, '--n-color')).toBe(String(darkTheme.common!.inputColor));
  });
});
