// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createModelToggle } from './model-toggle';

function mkWrap(modelIds: string[], initial: string): HTMLElement {
  const wrap = document.createElement('div');
  for (const id of modelIds) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mw-model-btn';
    b.dataset.model = id;
    b.setAttribute('aria-pressed', String(id === initial));
    wrap.appendChild(b);
  }
  return wrap;
}

describe('model toggle', () => {
  it('refresh sets aria-pressed on the active pill only', () => {
    const wrap = mkWrap(['best_match', 'icon_seamless', 'gfs_seamless'], 'best_match');
    let active = 'best_match';
    createModelToggle(
      { wrap },
      () => active,
      (next) => {
        active = next;
      },
    );
    const btns = wrap.querySelectorAll('button');
    expect(btns[0].getAttribute('aria-pressed')).toBe('true');
    expect(btns[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('click fires onChange + flips aria-pressed', () => {
    const wrap = mkWrap(['best_match', 'icon_seamless'], 'best_match');
    let active = 'best_match';
    const changes: string[] = [];
    createModelToggle(
      { wrap },
      () => active,
      (next) => {
        changes.push(next);
        active = next;
      },
    );
    (wrap.children[1] as HTMLButtonElement).click();
    expect(changes).toEqual(['icon_seamless']);
    expect(wrap.children[1].getAttribute('aria-pressed')).toBe('true');
    expect(wrap.children[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking the already-active pill is a no-op', () => {
    const wrap = mkWrap(['best_match', 'icon_seamless'], 'best_match');
    const active = 'best_match';
    let calls = 0;
    createModelToggle(
      { wrap },
      () => active,
      () => {
        calls += 1;
      },
    );
    (wrap.children[0] as HTMLButtonElement).click();
    expect(calls).toBe(0);
  });

  it('null wrap returns a no-op factory', () => {
    expect(() =>
      createModelToggle({ wrap: null }, () => 'best_match', () => undefined),
    ).not.toThrow();
  });
});
