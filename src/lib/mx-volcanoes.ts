/**
 * The 7 monitored Mexican volcanoes. Each gets a /volcan/<slug>/ page
 * that links out to CENAPRED for the live activity report (semáforo
 * de alerta volcánica) — CENAPRED doesn't expose CORS-enabled JSON so
 * we can't safely embed the current alert level statically.
 *
 * Content here is biographical (location, elevation, last major
 * eruption) — pure static SEO content. The hot/breaking status lives
 * at the linked CENAPRED page.
 */
export interface MxVolcano {
  slug: string;
  name: string;
  /** Federal entity (or two if straddling a border). */
  admin: string;
  lat: number;
  lng: number;
  /** Summit elevation, meters. */
  elevationM: number;
  /** Brief one-paragraph context. */
  summary: string;
  /** ISO year of the last significant eruption (null = dormant in
   *  historical record / Holocene only). */
  lastEruptionYear: number | null;
  /** CENAPRED report URL when one exists, otherwise null. */
  cenapredUrl?: string;
}

export const MX_VOLCANOES: readonly MxVolcano[] = [
  {
    slug: 'popocatepetl',
    name: 'Popocatépetl',
    admin: 'Puebla / Estado de México / Morelos',
    lat: 19.0233,
    lng: -98.6228,
    elevationM: 5426,
    lastEruptionYear: 2025,
    cenapredUrl: 'https://www.cenapred.unam.mx/reportesnvo/popo/Popoes.html',
    summary:
      'Estratovolcán activo en la frontera de Puebla, Estado de México y Morelos. ' +
      'Es el volcán más monitoreado del país; CENAPRED emite reportes diarios y un ' +
      'Semáforo de Alerta Volcánica con fases Verde, Amarillo y Rojo.',
  },
  {
    slug: 'volcan-de-colima',
    name: 'Volcán de Colima',
    admin: 'Jalisco / Colima',
    lat: 19.514,
    lng: -103.617,
    elevationM: 3839,
    lastEruptionYear: 2017,
    cenapredUrl: 'https://www.cenapred.unam.mx/reportesnvo/colima/colima.html',
    summary:
      'También conocido como Volcán de Fuego, es uno de los más activos de México. ' +
      'Su última fase eruptiva importante ocurrió en 2015–2017, con flujos piroclásticos ' +
      'que afectaron comunidades cercanas en Jalisco y Colima.',
  },
  {
    slug: 'el-chichon',
    name: 'El Chichón',
    admin: 'Chiapas',
    lat: 17.36,
    lng: -93.23,
    elevationM: 1150,
    lastEruptionYear: 1982,
    summary:
      'La erupción de El Chichón en 1982 fue una de las más destructivas del siglo XX ' +
      'en México. Aunque hoy permanece en reposo, sigue siendo monitoreado por su ' +
      'historial explosivo y la presencia de un lago cratérico ácido.',
  },
  {
    slug: 'tacana',
    name: 'Tacaná',
    admin: 'Chiapas',
    lat: 15.13,
    lng: -92.11,
    elevationM: 4060,
    lastEruptionYear: 1986,
    summary:
      'Volcán fronterizo entre México y Guatemala, en el extremo sur de Chiapas. ' +
      'Su última actividad significativa fueron emisiones de gas y vapor en 1986. ' +
      'Monitoreado conjuntamente por CENAPRED e INSIVUMEH.',
  },
  {
    slug: 'pico-de-orizaba',
    name: 'Pico de Orizaba (Citlaltépetl)',
    admin: 'Veracruz / Puebla',
    lat: 19.03,
    lng: -97.268,
    elevationM: 5636,
    lastEruptionYear: 1846,
    summary:
      'La cumbre más alta de México y la tercera de Norteamérica. Aunque no ha tenido ' +
      'erupciones desde mediados del siglo XIX, se le considera potencialmente activo. ' +
      'Es un destino popular de montañismo en Veracruz y Puebla.',
  },
  {
    slug: 'iztaccihuatl',
    name: 'Iztaccíhuatl',
    admin: 'Estado de México / Puebla',
    lat: 19.179,
    lng: -98.642,
    elevationM: 5230,
    lastEruptionYear: null,
    summary:
      'Estratovolcán dormido vecino del Popocatépetl. Sin erupciones registradas en ' +
      'tiempo histórico, su silueta de cumbres conforma el horizonte del Valle de México.',
  },
  {
    slug: 'nevado-de-toluca',
    name: 'Nevado de Toluca (Xinantécatl)',
    admin: 'Estado de México',
    lat: 19.108,
    lng: -99.757,
    elevationM: 4680,
    lastEruptionYear: null,
    summary:
      'Estratovolcán inactivo con dos lagos cratéricos (Sol y Luna). No registra ' +
      'erupciones en tiempo histórico pero conserva señales de actividad reciente en ' +
      'su geología.',
  },
];

export function findVolcanoBySlug(slug: string): MxVolcano | undefined {
  return MX_VOLCANOES.find((v) => v.slug === slug);
}
