import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// 构建检查：以库模式把源码编译一遍（验证 .vue / .ts 能被标准工具链编译），产物在 dist/，不随 npm 包发布。
// 运行时依赖（vue / naive-ui 等）一律外部化，由使用方提供。
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: [/^vue($|\/)/, /^naive-ui($|\/)/]
    },
    emptyOutDir: true
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.ts'],
    globals: false
  }
});
