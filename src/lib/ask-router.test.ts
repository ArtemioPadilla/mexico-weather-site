import { describe, expect, it } from 'vitest';
import {
  detectIntent,
  lookupKnownCity,
  normalize,
  planRoute,
} from './ask-router';

describe('ask-router', () => {
  it('normalize lowercases, strips diacritics, collapses spaces', () => {
    expect(normalize('  ¿Lloverá mañana en  CDMX?  ')).toBe(
      'llovera manana en cdmx',
    );
  });

  it('detectIntent identifies rain queries', () => {
    expect(detectIntent('llovera manana')).toBe('rain');
    expect(detectIntent('habra precipitacion en gdl')).toBe('rain');
  });

  it('detectIntent identifies temperature queries', () => {
    expect(detectIntent('cual es la temperatura en mty')).toBe('temp');
    expect(detectIntent('hace calor en hermosillo')).toBe('temp');
  });

  it('detectIntent identifies map intents', () => {
    expect(detectIntent('quiero el mapa de radar')).toBe('map-radar');
    expect(detectIntent('mapa satelital')).toBe('map-satellite');
    expect(detectIntent('mapa de sismos')).toBe('quakes');
  });

  it('detectIntent identifies forecast fallback', () => {
    expect(detectIntent('clima en oaxaca')).toBe('forecast');
    expect(detectIntent('pronostico para hoy')).toBe('forecast');
  });

  it('lookupKnownCity finds longest-prefix match', () => {
    expect(lookupKnownCity('llovera en cdmx')?.name).toBe('Ciudad de México');
    expect(lookupKnownCity('ciudad de mexico')?.name).toBe('Ciudad de México');
    expect(lookupKnownCity('viento en monterrey')?.name).toBe('Monterrey');
    expect(lookupKnownCity('no city here')).toBeNull();
  });

  it('planRoute → forecast URL with lat/lng/name', () => {
    const city = { name: 'Mérida', lat: 20.97, lng: -89.61 };
    const r = planRoute('forecast', city);
    expect(r.path).toContain('forecast/?');
    expect(r.path).toContain('lat=20.97');
    expect(r.path).toContain('lng=-89.61');
    expect(r.path).toMatch(/name=M%C3%A9rida/);
  });

  it('planRoute → map with layer hash for radar/satellite', () => {
    expect(planRoute('map-radar', null).path).toContain('#layer=radar');
    expect(planRoute('map-satellite', null).path).toContain(
      '#layer=satellite',
    );
  });

  it('planRoute → mapa fallback when city missing for forecast intent', () => {
    expect(planRoute('forecast', null).path).toBe('mapa/');
  });

  it('planRoute → mapa with description for overlay intents', () => {
    expect(planRoute('quakes', null).description).toMatch(/Sismos/);
    expect(planRoute('aqi', null).description).toMatch(/Calidad del aire/);
    expect(planRoute('beach', null).description).toMatch(/Playas/);
  });
});
