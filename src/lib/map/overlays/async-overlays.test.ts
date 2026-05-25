import { describe, expect, it } from 'vitest';
import { MX_AQI_CITIES, buildAqiUrl } from './aqi';
import { MX_BEACHES, buildMarineUrl, sstToColor } from './marine';

describe('aqi overlay', () => {
  it('lists 12 major MX metros', () => {
    expect(MX_AQI_CITIES).toHaveLength(12);
    expect(MX_AQI_CITIES.map((c) => c.name)).toContain('CDMX');
    expect(MX_AQI_CITIES.map((c) => c.name)).toContain('Tijuana');
  });

  it('buildAqiUrl encodes lat/lng lists', () => {
    const u = buildAqiUrl([
      { name: 'A', lat: 1.5, lng: -10 },
      { name: 'B', lat: 2.5, lng: -20 },
    ]);
    expect(u).toContain('latitude=1.5,2.5');
    expect(u).toContain('longitude=-10,-20');
    expect(u).toContain('current=pm2_5');
    expect(u.startsWith('https://air-quality-api.open-meteo.com/')).toBe(true);
  });
});

describe('marine overlay', () => {
  it('lists 14 coastal destinations across Pacific + Caribbean + Gulf', () => {
    expect(MX_BEACHES).toHaveLength(14);
    const names = MX_BEACHES.map((b) => b.name);
    expect(names).toContain('Cancún'); // Caribe
    expect(names).toContain('Acapulco'); // Pacífico
    expect(names).toContain('Veracruz'); // Golfo
  });

  it('sstToColor maps tempterature to a 5-stop cool→warm ramp', () => {
    expect(sstToColor(10)).toBe('#5b8ff9'); // cold
    expect(sstToColor(20)).toBe('#7dd1c8');
    expect(sstToColor(25)).toBe('#7ad151');
    expect(sstToColor(28)).toBe('#f9d423');
    expect(sstToColor(31)).toBe('#f08a24'); // hot
  });

  it('buildMarineUrl includes wave_height + SST currents', () => {
    const u = buildMarineUrl([{ name: 'X', lat: 19, lng: -99 }]);
    expect(u).toContain('wave_height');
    expect(u).toContain('sea_surface_temperature');
    expect(u.startsWith('https://marine-api.open-meteo.com/')).toBe(true);
  });
});
