import { describe, expect, it } from 'vitest';
import {
  ALERTS_KEY,
  type AlertRule,
  add,
  alertKey,
  evaluate,
  forLocation,
  load,
  remove,
} from './alerts';

function mkStore(): {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
} {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}

const rule = (over: Partial<AlertRule> = {}): AlertRule => ({
  lat: 19.43,
  lng: -99.13,
  name: 'CDMX',
  metric: 'rain',
  op: '>',
  threshold: 1,
  createdAt: 0,
  ...over,
});

describe('alerts', () => {
  it('add then load roundtrips', () => {
    const s = mkStore();
    expect(load(s)).toEqual([]);
    expect(add(s, rule())).toBe(true);
    expect(load(s)).toHaveLength(1);
  });

  it('add rejects duplicate (same lat/lng/metric)', () => {
    const s = mkStore();
    expect(add(s, rule())).toBe(true);
    expect(add(s, rule({ threshold: 5 }))).toBe(false);
    expect(load(s)).toHaveLength(1);
  });

  it('add allows different metric at same location', () => {
    const s = mkStore();
    expect(add(s, rule())).toBe(true);
    expect(add(s, rule({ metric: 'wind', threshold: 60 }))).toBe(true);
    expect(load(s)).toHaveLength(2);
  });

  it('remove deletes the matching rule', () => {
    const s = mkStore();
    add(s, rule());
    expect(remove(s, 19.43, -99.13, 'rain')).toBe(true);
    expect(load(s)).toEqual([]);
  });

  it('forLocation filters by 3-dp coordinate match', () => {
    const s = mkStore();
    add(s, rule({ lat: 19.4321 }));
    expect(forLocation(s, 19.432, -99.13)).toHaveLength(1);
    expect(forLocation(s, 20, -99)).toHaveLength(0);
  });

  it('evaluate returns fired alerts only', () => {
    const fc = { maxRainMmH: 2, maxTempC: 35, minTempC: 18, maxWindKmh: 30 };
    const fired = evaluate(
      [
        rule({ metric: 'rain', op: '>', threshold: 1 }),
        rule({ metric: 'temp_hi', op: '>', threshold: 40 }),
        rule({ metric: 'wind', op: '>', threshold: 25 }),
      ],
      fc,
    );
    expect(fired.map((f) => f.rule.metric).sort()).toEqual(['rain', 'wind']);
  });

  it('load tolerates corrupt JSON', () => {
    const s = mkStore();
    s.setItem(ALERTS_KEY, '{not json');
    expect(load(s)).toEqual([]);
  });

  it('alertKey is stable across small lat/lng deltas (3 dp)', () => {
    expect(alertKey({ lat: 19.4321, lng: -99.1313, metric: 'rain' })).toBe(
      alertKey({ lat: 19.4324, lng: -99.131, metric: 'rain' }),
    );
  });
});
