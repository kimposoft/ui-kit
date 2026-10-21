/**
 * KDialogFooter 单测：按钮排列与档位、事件、禁用 / 加载、危险确认、
 * 默认四语文案、extra 插槽。
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import KDialogFooter from './KDialogFooter.vue';

const cancelBtn = (w: ReturnType<typeof mount>) => w.find('[data-kdlf="cancel"]');
const confirmBtn = (w: ReturnType<typeof mount>) => w.find('[data-kdlf="confirm"]');

describe('KDialogFooter', () => {
  it('取消在左、确认在右，均为小档；取消描边主色、确认主色实底', () => {
    const w = mount(KDialogFooter);
    const btns = w.findAll('button');
    expect(btns.map(b => b.text())).toEqual(['取消', '确认']);
    expect(btns[0].attributes('data-kdlf')).toBe('cancel');
    expect(btns[0].classes()).toEqual(expect.arrayContaining(['n-button--small-type', 'n-button--primary-type', 'n-button--ghost']));
    expect(btns[1].classes()).toEqual(expect.arrayContaining(['n-button--small-type', 'n-button--primary-type']));
    expect(btns[1].classes()).not.toContain('n-button--ghost');
    // 最小宽度 72：类名承载，样式在 scoped CSS
    expect(btns.every(b => b.classes().includes('kdlf-btn'))).toBe(true);
  });

  it('危险确认：confirmType=error', () => {
    const w = mount(KDialogFooter, { props: { confirmType: 'error' } });
    expect(confirmBtn(w).classes()).toContain('n-button--error-type');
    // 取消仍是描边主色，不跟着变红
    expect(cancelBtn(w).classes()).toContain('n-button--primary-type');
  });

  it('confirmType 五档（流程按钮语义色）：success / warning / default 映射到对应 Naive 类型', () => {
    for (const t of ['primary', 'success', 'warning', 'error', 'default'] as const) {
      const w = mount(KDialogFooter, { props: { confirmType: t } });
      expect(confirmBtn(w).classes()).toContain(`n-button--${t}-type`);
      // 取消始终是描边主色，不随确认色变化
      expect(cancelBtn(w).classes()).toContain('n-button--primary-type');
    }
  });

  it('点击发出 cancel / confirm', async () => {
    const w = mount(KDialogFooter);
    await cancelBtn(w).trigger('click');
    await confirmBtn(w).trigger('click');
    expect(w.emitted('cancel')).toHaveLength(1);
    expect(w.emitted('confirm')).toHaveLength(1);
  });

  it('confirmDisabled：确认按钮禁用，点击不发事件', async () => {
    const w = mount(KDialogFooter, { props: { confirmDisabled: true } });
    expect(confirmBtn(w).attributes('disabled')).toBeDefined();
    await confirmBtn(w).trigger('click');
    expect(w.emitted('confirm')).toBeUndefined();
  });

  it('confirmLoading：确认按钮显示加载态，点击不重复提交', async () => {
    const w = mount(KDialogFooter, { props: { confirmLoading: true } });
    expect(confirmBtn(w).classes()).toContain('n-button--loading');
    await confirmBtn(w).trigger('click');
    expect(w.emitted('confirm')).toBeUndefined();
  });

  it('hideCancel：不渲染取消按钮', () => {
    const w = mount(KDialogFooter, { props: { hideCancel: true } });
    expect(cancelBtn(w).exists()).toBe(false);
    expect(w.findAll('button')).toHaveLength(1);
  });

  it('hideConfirm：只留取消（只读 / 无保存权限）', () => {
    const w = mount(KDialogFooter, { props: { hideConfirm: true } });
    expect(confirmBtn(w).exists()).toBe(false);
    expect(w.findAll('button').map(b => b.text())).toEqual(['取消']);
  });

  it('cancelDisabled：取消置灰且不发 cancel，确认不受影响', async () => {
    const w = mount(KDialogFooter, { props: { cancelDisabled: true } });
    expect(cancelBtn(w).attributes('disabled')).toBeDefined();
    await cancelBtn(w).trigger('click');
    expect(w.emitted('cancel')).toBeUndefined();
    expect(confirmBtn(w).attributes('disabled')).toBeUndefined();
    await confirmBtn(w).trigger('click');
    expect(w.emitted('confirm')).toHaveLength(1);
  });

  it('自定义文案与四语默认文案', () => {
    const custom = mount(KDialogFooter, { props: { confirmText: '删除', cancelText: '再想想' } });
    expect(custom.findAll('button').map(b => b.text())).toEqual(['再想想', '删除']);
    const en = mount(KDialogFooter, { props: { locale: 'en-US' } });
    expect(en.findAll('button').map(b => b.text())).toEqual(['Cancel', 'Confirm']);
    const ja = mount(KDialogFooter, { props: { locale: 'ja-JP' } });
    expect(ja.findAll('button').map(b => b.text())).toEqual(['キャンセル', '確認']);
    const tw = mount(KDialogFooter, { props: { locale: 'zh-TW' } });
    expect(tw.findAll('button').map(b => b.text())).toEqual(['取消', '確認']);
  });

  it('extra 插槽渲染在按钮左侧', () => {
    const w = mount(KDialogFooter, { slots: { extra: '<span class="hint">已选 3 项</span>' } });
    const extra = w.find('.kdlf-extra');
    expect(extra.exists()).toBe(true);
    expect(extra.find('.hint').text()).toBe('已选 3 项');
    // 顺序：extra 在 actions 之前
    const children = Array.from<Element>(w.element.children).map(c => c.className);
    expect(children).toEqual(['kdlf-extra', 'kdlf-actions']);
  });

  it('无 extra 插槽时不渲染占位', () => {
    const w = mount(KDialogFooter);
    expect(w.find('.kdlf-extra').exists()).toBe(false);
  });
});
