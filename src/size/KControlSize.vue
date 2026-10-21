<script lang="ts">
/** 单个档位的钉定规格（px 数字；未给的字段保持 Naive 原值）。 */
export interface KControlSizeTierSpec {
  /** 控件高度：输入类 / 选择类 / 颜色选择器 / 单选按钮（RadioButton）；includeButton 时含按钮。 */
  height?: number;
  /** 字号：输入类 / 选择类 / 颜色选择器 / 复选框与单选的文字 / 单选按钮；includeButton 时含按钮。 */
  fontSize?: number;
  /** 左右内边距：输入类（Input 及其内部 Input 的 DatePicker / TimePicker / InputNumber / AutoComplete）与选择类；includeButton 时含按钮。 */
  paddingX?: number;
  /** 复选框方块与单选圆点的边长。 */
  boxSize?: number;
  /** 开关（NSwitch）轨道宽度；Switch 没有 tiny 档，tiny 档里给了也忽略。 */
  switchWidth?: number;
  /** 开关（NSwitch）轨道高度；同上无 tiny 档。 */
  switchHeight?: number;
  /** 开关（NSwitch）滑块边长（宽高相等）；按下时的拉长宽度自动取「边长 + 6px」，保持 Naive 原有的按压拉伸量。 */
  switchButtonSize?: number;
}

/** 四档钉定表：键为 Naive 的 size 档（不写 size 的控件是 medium）。 */
export type KControlSizeTiers = Partial<Record<'tiny' | 'small' | 'medium' | 'large', KControlSizeTierSpec>>;
</script>

<script setup lang="ts">
/**
 * KControlSize 控件尺寸钉定容器。
 *
 * ```vue
 * <KControlSize :tiers="{ small: { height: 24, fontSize: 12 }, medium: { height: 32, fontSize: 14, paddingX: 10 } }">
 *   <NInput size="small" /> <NSelect />
 * </KControlSize>
 * ```
 *
 * tiers 语义：键 tiny | small | medium | large，值 { height, fontSize, paddingX, boxSize, switchWidth, switchHeight, switchButtonSize }（px）；未给的字段、未给的档
 * 保持 Naive 原值。height / fontSize / paddingX 作用于输入类与选择类；boxSize 是复选框方块与单选圆点边长；
 * fontSize 同时作用于复选框 / 单选的文字。
 *
 * 生效组件（以 naive-ui 2.44.1 源码为准，主题键见下）：
 * - NInput / NInputNumber / NDatePicker / NTimePicker / NAutoComplete：它们内部都渲染 NInput，写全局键 `Input`
 *   （heightX / fontSizeX / paddingX，padding 为 `0 Npx` 字符串）。
 * - NSelect：内部 InternalSelection，写全局键 `InternalSelection`（heightX / fontSizeX；padding 在该主题里不分档，
 *   只有 paddingSingle / paddingMultiple 两个值，故取 tiers 中 medium → small → large → tiny 里第一个给了 paddingX 的值，
 *   右侧保持 Naive 为箭头预留的 26px）。
 * - NColorPicker：键 `ColorPicker`（heightX / fontSizeX，只有 small / medium / large 三档；其面板内的 hex 输入框是 Input，
 *   会一并吃到 Input 的钉定）。
 * - NCheckbox：键 `Checkbox`（sizeX = boxSize、fontSizeX），仅 small / medium / large。
 * - NRadio / NRadioButton：键 `Radio`（radioSizeX = boxSize、fontSizeX、buttonHeightX = height），仅 small / medium / large。
 *   RadioButton 的高度与字号由所在 NRadioGroup 取值，需放在 NRadioGroup 里（Naive 本身即如此）。
 *
 * - NSwitch：键 `Switch`，仅 small / medium / large（无 tiny 档）。tiers 里 switchWidth → railWidthX、switchHeight → railHeightX、
 *   switchButtonSize → buttonWidthX 与 buttonHeightX（滑块为正方形）；同时把 buttonWidthPressedX 设为「switchButtonSize + 6」，
 *   与 Naive 默认三档（14→20、18→24、22→28）的按压拉伸量一致，避免只改滑块大小而按下态不跟随。
 *   依据：node_modules/naive-ui/es/switch/styles/_common.mjs（各档默认值）与 switch/src/Switch.mjs 的 cssVarsRef
 *   （createKey('railHeight'|'railWidth'|'buttonHeight'|'buttonWidth'|'buttonWidthPressed', size)）。
 *   轨道圆角（railBorderRadiusX）、滑块圆角属形状键，本容器不写，沿用全局 common.borderRadius。
 *
 * 为什么默认不覆盖 NButton：窗口页脚（KDialogFooter 小档 28px，D3）等按钮的规格是统一设计，不能被表单控件的钉定带歪。
 * 需要把设置类文字按钮与同行控件一起钉定时，才显式传 `includeButton`，此时 Button 同档位（heightX / fontSizeX / paddingX）一并钉定；
 * 注意 includeButton 也会让容器内其它组件内部使用的 Button（如 InputNumber 的加减按钮、ColorPicker 面板按钮）吃到钉定。
 *
 * 实现与 Naive 机制依据（node_modules/naive-ui/es）：
 * - 嵌套 NConfigProvider 的 themeOverrides 与上层 `lodash.merge` 合并（config-provider/src/ConfigProvider.mjs 的
 *   mergedThemeOverridesRef），故宿主在上层设的 common（字号 / 圆角等）与组件覆盖都保留，本容器的只在同键上覆盖。
 * - 不传 `theme` 时 mergedThemeRef 直接取上层的（同文件 mergedThemeRef），所以明暗主题自动继承；本组件绝不传 theme。
 * - 组件取值走 _mixins/use-theme.mjs：`mergedSelf = merge(self(common), builtinOverrides, 全局 [组件名] 覆盖, props.themeOverrides)`。
 *   NDatePicker / NInputNumber / NAutoComplete / NTimePicker 内部的 NInput 同样 inject 同一个 ConfigProvider，
 *   所以全局键 `Input` 对它们生效；无需写成 `{ DatePicker: { peers: { Input } } }`（那条路只覆盖该组件自己的 Input，
 *   且优先级高于全局键，会盖住这里的钉定，本容器不使用）。
 * - 容器使用 `abstract`：ConfigProvider 只渲染默认插槽，不产生 DOM，不影响布局。
 *
 * 红线：只写组件自身尺寸键（heightX / fontSizeX / paddingX / sizeX / radioSizeX / buttonHeightX），不写 common，
 * 不写颜色，不传 theme。
 * （Switch 的 railHeightX / railWidthX / buttonHeightX / buttonWidthX / buttonWidthPressedX 同属尺寸键。）
 */
import { computed } from 'vue';
import { NConfigProvider, type GlobalThemeOverrides } from 'naive-ui';

defineOptions({ name: 'KControlSize', inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    /** 四档钉定表；缺省（或某档缺省）保持 Naive 原值。 */
    tiers?: KControlSizeTiers;
    /** 同时钉定 NButton 的同档位 height / fontSize / paddingX；缺省 false（按钮不受影响）。 */
    includeButton?: boolean;
  }>(),
  { tiers: () => ({}), includeButton: false }
);

/** 档名 → Naive 主题键后缀（createKey('height', 'small') === 'heightSmall'）。 */
const TIER_SUFFIX = { tiny: 'Tiny', small: 'Small', medium: 'Medium', large: 'Large' } as const;
type TierName = keyof typeof TIER_SUFFIX;
const TIER_NAMES = Object.keys(TIER_SUFFIX) as TierName[];
/** InternalSelection 的 paddingSingle / paddingMultiple 不分档，取值时按此顺序找第一个给了 paddingX 的档。 */
const SELECTION_PADDING_ORDER: TierName[] = ['medium', 'small', 'large', 'tiny'];
/** Naive 选择器为右侧箭头预留的内边距（selection/styles/_common.mjs），改左边距时保持不变。 */
const SELECTION_ARROW_RIGHT_PX = 26;

/** Naive Switch 按下态滑块比常态宽出的像素（_common.mjs：14→20、18→24、22→28，三档均为 +6）。 */
const SWITCH_PRESSED_EXTRA_PX = 6;

type ThemeBlock = Record<string, string>;

/** 把 tiers 翻译成 Naive 的 themeOverrides（只含被钉定的键）。 */
const themeOverrides = computed<GlobalThemeOverrides>(() => {
  const tiers = props.tiers ?? {};
  const input: ThemeBlock = {};
  const selection: ThemeBlock = {};
  const colorPicker: ThemeBlock = {};
  const checkbox: ThemeBlock = {};
  const radio: ThemeBlock = {};
  const switcher: ThemeBlock = {};
  const button: ThemeBlock = {};

  for (const name of TIER_NAMES) {
    const spec = tiers[name];
    if (!spec) continue;
    const sfx = TIER_SUFFIX[name];
    const { height, fontSize, paddingX, boxSize, switchWidth, switchHeight, switchButtonSize } = spec;
    // Checkbox / Radio / ColorPicker / Switch 没有 tiny 档，tiny 的值只给 Input / Select / Button
    const noTiny = name === 'tiny';

    if (height !== undefined) {
      input[`height${sfx}`] = `${height}px`;
      selection[`height${sfx}`] = `${height}px`;
      if (!noTiny) {
        colorPicker[`height${sfx}`] = `${height}px`;
        radio[`buttonHeight${sfx}`] = `${height}px`;
      }
      if (props.includeButton) button[`height${sfx}`] = `${height}px`;
    }
    if (fontSize !== undefined) {
      input[`fontSize${sfx}`] = `${fontSize}px`;
      selection[`fontSize${sfx}`] = `${fontSize}px`;
      if (!noTiny) {
        colorPicker[`fontSize${sfx}`] = `${fontSize}px`;
        checkbox[`fontSize${sfx}`] = `${fontSize}px`;
        radio[`fontSize${sfx}`] = `${fontSize}px`;
      }
      if (props.includeButton) button[`fontSize${sfx}`] = `${fontSize}px`;
    }
    if (paddingX !== undefined) {
      input[`padding${sfx}`] = `0 ${paddingX}px`;
      if (props.includeButton) button[`padding${sfx}`] = `0 ${paddingX}px`;
    }
    if (boxSize !== undefined && !noTiny) {
      checkbox[`size${sfx}`] = `${boxSize}px`;
      radio[`radioSize${sfx}`] = `${boxSize}px`;
    }
    // Switch：轨道宽高、滑块边长（正方形）；按下态拉长宽度 = 滑块边长 + 6（对齐 Naive 默认差值）
    if (!noTiny) {
      if (switchWidth !== undefined) switcher[`railWidth${sfx}`] = `${switchWidth}px`;
      if (switchHeight !== undefined) switcher[`railHeight${sfx}`] = `${switchHeight}px`;
      if (switchButtonSize !== undefined) {
        switcher[`buttonWidth${sfx}`] = `${switchButtonSize}px`;
        switcher[`buttonHeight${sfx}`] = `${switchButtonSize}px`;
        switcher[`buttonWidthPressed${sfx}`] = `${switchButtonSize + SWITCH_PRESSED_EXTRA_PX}px`;
      }
    }
  }

  // 选择类内边距不分档：按顺序取第一个给了 paddingX 的档
  const padTier = SELECTION_PADDING_ORDER.find(n => tiers[n]?.paddingX !== undefined);
  if (padTier) {
    const x = tiers[padTier]!.paddingX!;
    selection.paddingSingle = `0 ${SELECTION_ARROW_RIGHT_PX}px 0 ${x}px`;
    selection.paddingMultiple = `3px ${SELECTION_ARROW_RIGHT_PX}px 0 ${x}px`;
  }

  // 只输出非空块，避免空对象无意义地参与合并与样式哈希
  const out: Record<string, ThemeBlock> = {};
  const put = (key: string, block: ThemeBlock) => {
    if (Object.keys(block).length) out[key] = block;
  };
  put('Input', input);
  put('InternalSelection', selection);
  put('ColorPicker', colorPicker);
  put('Checkbox', checkbox);
  put('Radio', radio);
  put('Switch', switcher);
  put('Button', button);
  return out as GlobalThemeOverrides;
});
</script>

<template>
  <!-- abstract：不产生 DOM；不传 theme，明暗主题与上层 common 覆盖由 Naive 继承 / 合并 -->
  <NConfigProvider abstract :theme-overrides="themeOverrides">
    <slot />
  </NConfigProvider>
</template>
