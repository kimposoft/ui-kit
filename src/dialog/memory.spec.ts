/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from 'vitest';
import { localStorageDialogMemory } from './memory';

afterEach(() => window.localStorage.clear());
describe('尺寸记忆兼容', () => {
  it('相对比例完整保留，旧像素格式原样读回', () => {
    const size = { width: 1100, height: 700, wr: 0.6, hr: 0.7 };
    localStorageDialogMemory.save('adaptive', size);
    expect(localStorageDialogMemory.load('adaptive')).toEqual(size);
    window.localStorage.setItem('kimpo-ui:dialog-size:old', '{"width":900,"height":600}');
    expect(localStorageDialogMemory.load('old')).toEqual({ width: 900, height: 600 });
  });
});
