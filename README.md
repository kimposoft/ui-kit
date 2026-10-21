# @kimposoft/ui-kit

Kimpo 组件库：基于 Vue 3 与 Naive UI 的窗口与控件尺寸组件，供 Kimpo 宿主与插件前端统一界面外观。

Kimpo UI components (Vue 3 + Naive UI): dialog shell, dialog footer, layer stack and control size tiers.

> 当前为预览版（`1.1.0-tp.x`，dist-tag `next`），API 仍可能调整。

## 内容

| 导出 | 说明 |
| --- | --- |
| `KDialog` | 窗口外壳：模态 / 非模态、standard 与 compact 两档密度、M / L / XL 自适应档位、拖动、八向缩放、最大化、尺寸记忆、Esc 分层仲裁、关闭前确认 |
| `KDialogFooter` | 窗口页脚：取消在左、确认在右，统一按钮尺寸 |
| `KControlSize` | 把一块表单区域内的 Naive 控件钉定到指定高度 / 字号 / 内边距 |
| `useLayer` / `getLayerStack` | 弹层栈：统一 z-index 与 Esc 只关最上层 |
| `useDialogGeometry` | 窗口几何（视口限位、缩放、最大化还原、尺寸记忆）组合式函数 |
| `setKimpoUiHostDefaults` 等 | 宿主级默认值（界面语言、尺寸记忆存储、关闭确认） |
| `KIMPO_UI_LOCALE` | 界面语言注入键（内置 zh-CN / zh-TW / en-US / ja-JP 四语系统文本） |

## 安装

```sh
npm i @kimposoft/ui-kit@next
```

对等依赖（需由你的工程提供）：`vue ^3`、`naive-ui ^2`。

## 使用

本包以 TypeScript 与 Vue 单文件组件（`.vue`）源码发布（`exports` 指向 `src/index.ts`），需要用能编译 TS 与 `.vue` 的构建工具，例如 Vite + `@vitejs/plugin-vue`。

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { KDialog, KDialogFooter } from '@kimposoft/ui-kit';

const show = ref(true);
</script>

<template>
  <KDialog v-model:show="show" title="示例窗口" size-preset="M">
    <p>窗口内容</p>
    <template #footer>
      <KDialogFooter @cancel="show = false" @confirm="show = false" />
    </template>
  </KDialog>
</template>
```

颜色、圆角、阴影取 CSS 变量（如 `--kimpo-radius-card`、`--kimpo-shadow-dialog`），未定义时使用内置回退值。

在 Kimpo 插件里使用时，宿主页面已注入一份组件（全局名 `KimpoUi`）；插件构建可把 `@kimposoft/ui-kit` 外部化为 `KimpoUi`，运行时只用宿主那一份。

## 开发

```sh
npm install
npm run typecheck   # vue-tsc 类型检查
npm test            # vitest 单测
npm run build       # 库模式构建检查（产物在 dist/，不随包发布）
```

## 协议

[Apache License 2.0](LICENSE)。Copyright 2026 金宝量行（无锡）软件有限公司。
