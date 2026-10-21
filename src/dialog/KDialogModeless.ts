/**
 * KDialog 非模态变体的外层容器。
 *
 * Teleport 到 body 的全屏容器，自身 pointer-events:none，只有里面的窗口本体可交互，
 * 于是窗口外的页面仍可正常点击、滚动。层级由 KLayerStack 分配后经 zIndex 传入。
 * 内部组件，不对外导出。
 */
import { Teleport, defineComponent, h, type PropType } from 'vue';

export const KDialogModeless = defineComponent({
  name: 'KDialogModeless',
  props: {
    show: { type: Boolean, default: false },
    zIndex: { type: Number as PropType<number>, default: 2000 }
  },
  setup(props, { slots }) {
    return () =>
      props.show
        ? h(Teleport, { to: 'body' }, [
            h('div', { class: 'kdlg-modeless-layer', style: { zIndex: props.zIndex } }, slots.default?.())
          ])
        : null;
  }
});
