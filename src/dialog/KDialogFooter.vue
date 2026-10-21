<script setup lang="ts">
/**
 * KDialogFooter 页脚。
 *
 * - 右对齐：取消在左（描边主色 `type=primary ghost`）、确认在右（`type=primary`，危险动作 `type=error`）；
 *   按钮用小档 28px，最小宽度 72px，按钮间距 8px；左侧 `extra` 插槽放状态文字、开关或次要动作。
 * - 属性 confirmText / cancelText（缺省取 ui-kit 四语小表的「确认 / 取消」）、confirmType、confirmDisabled、
 *   confirmLoading、hideCancel、hideConfirm、cancelDisabled；事件 confirm、cancel。
 * - 本组件自身不带内边距与分隔线：放进 KDialog 的 footer 插槽时由 KDialog 提供页脚内边距与上分隔线；
 *   也可独立放进宿主现有 NModal preset="card" 的 footer，先统一按钮排列与档位。
 */
import { NButton } from 'naive-ui';
import { useUiText } from '../locale';

defineOptions({ name: 'KDialogFooter' });

const props = withDefaults(
  defineProps<{
    /** 确认按钮文案；缺省「确认」。 */
    confirmText?: string;
    /** 取消按钮文案；缺省「取消」。 */
    cancelText?: string;
    /**
     * 确认按钮类型：primary（缺省）/ error（危险动作）；
     * success / warning / default 供「流程按钮语义色」（审批通过、退回等颜色可配置的场景）使用。
     */
    confirmType?: 'primary' | 'success' | 'warning' | 'error' | 'default';
    confirmDisabled?: boolean;
    confirmLoading?: boolean;
    /** 隐藏取消按钮（仅需告知类窗口）。 */
    hideCancel?: boolean;
    /** 隐藏确认按钮（只读态 / 无保存权限时只留取消）。 */
    hideConfirm?: boolean;
    /**
     * 取消按钮置灰（保存中不让取消）。🔴 只管页脚这一个按钮：KDialog 右上角关闭与 Esc 不会因此被拦，
     * 是否允许关闭由使用方的 dirty / escapeInterceptor 决定。
     */
    cancelDisabled?: boolean;
    /** 语言码；缺省取宿主注入的当前语言，再缺省 zh-CN。 */
    locale?: string;
  }>(),
  {
    confirmText: undefined,
    cancelText: undefined,
    confirmType: 'primary',
    confirmDisabled: false,
    confirmLoading: false,
    hideCancel: false,
    hideConfirm: false,
    cancelDisabled: false,
    locale: undefined
  }
);

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const tx = useUiText(() => props.locale);
</script>

<template>
  <div class="kdlf">
    <!-- 左侧 extra：状态文字、开关或次要动作，占满剩余宽度 -->
    <div v-if="$slots.extra" class="kdlf-extra"><slot name="extra" /></div>
    <div class="kdlf-actions">
      <NButton v-if="!hideCancel" size="small" type="primary" ghost class="kdlf-btn" data-kdlf="cancel" :disabled="cancelDisabled" @click="emit('cancel')">
        {{ cancelText ?? tx('cancel') }}
      </NButton>
      <NButton
        v-if="!hideConfirm"
        size="small"
        :type="confirmType"
        class="kdlf-btn"
        data-kdlf="confirm"
        :disabled="confirmDisabled"
        :loading="confirmLoading"
        @click="emit('confirm')"
      >
        {{ confirmText ?? tx('confirm') }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.kdlf {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
}
.kdlf-extra {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  color: rgb(var(--text-secondary-color, 102 102 102));
  font-size: 12px;
}
.kdlf-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  /* 按钮间距 8px */
  gap: 8px;
  margin-left: auto;
}
.kdlf-btn {
  /* 最小宽度 72px */
  min-width: 72px;
}
</style>
