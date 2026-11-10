import { describe, expect, it } from 'vitest';
import { nextTab } from '../src/lib/tabs';

describe('abas pelo teclado', () => {
  const keys = ['answer', 'steps', 'trace'];
  it('setas dão a volta', () => {
    expect(nextTab(keys, 'answer', 'ArrowRight')).toBe('steps');
    expect(nextTab(keys, 'trace', 'ArrowRight')).toBe('answer');
    expect(nextTab(keys, 'answer', 'ArrowLeft')).toBe('trace');
  });
  it('Home e End', () => {
    expect(nextTab(keys, 'steps', 'Home')).toBe('answer');
    expect(nextTab(keys, 'steps', 'End')).toBe('trace');
  });
  it('aba escondida some da navegação', () => {
    // "O que muda" escondida: só as visíveis entram na lista; a atual fora dela vale como a primeira
    expect(nextTab(['answer', 'trace'], 'diff', 'ArrowRight')).toBe('trace');
  });
  it('outras teclas não navegam', () => {
    expect(nextTab(keys, 'answer', 'Enter')).toBeNull();
    expect(nextTab([], 'x', 'ArrowRight')).toBeNull();
  });
});
