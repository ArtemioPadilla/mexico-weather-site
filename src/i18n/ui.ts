export interface UiStrings {
  search_placeholder: string;
  use_my_location: string;
  searching: string;
  no_results: string;
  geo_denied: string;
  quick_peek: string;
  full_forecast: string;
  back_home: string;
  current: string;
  today: string;
  feels_like: string;
  hourly_48h: string;
  seven_days: string;
  detail: string;
  wind: string;
  uv_index: string;
  sky_air: string;
  humidity: string;
  pressure: string;
  visibility: string;
  sunrise: string;
  sunset: string;
  cloud_cover: string;
  gusts: string;
  pick_location: string;
  loading: string;
  load_error: string;
  map_title: string;
  map_nav: string;
  map_teaser_heading: string;
  map_teaser_cta: string;
  map_layer_base: string;
  map_search_placeholder: string;
  map_locate: string;
  map_popup_full_forecast: string;
  map_layer_unavailable: string;
}

export const ui: Record<'es' | 'en', UiStrings> = {
  es: {
    search_placeholder: 'Buscar cualquier ciudad o lugar…',
    use_my_location: 'Usar mi ubicación',
    searching: 'Buscando…',
    no_results: 'Sin resultados para',
    geo_denied: 'No se pudo obtener tu ubicación.',
    quick_peek: 'Ver vista rápida',
    full_forecast: 'Ver pronóstico completo',
    back_home: 'Volver al inicio',
    current: 'Ahora',
    today: 'Hoy',
    feels_like: 'sensación',
    hourly_48h: 'Por hora — hoy y mañana (48 h)',
    seven_days: '7 días',
    detail: 'Detalle',
    wind: 'Viento',
    uv_index: 'Índice UV',
    sky_air: 'Cielo y aire',
    humidity: 'humedad',
    pressure: 'presión',
    visibility: 'visibilidad',
    sunrise: 'amanecer',
    sunset: 'atardecer',
    cloud_cover: 'nubes',
    gusts: 'ráfagas',
    pick_location: 'Busca una ubicación para ver su pronóstico.',
    loading: 'Cargando pronóstico…',
    load_error: 'Error al cargar. Se reintentará automáticamente.',
    map_title: 'Mapa del tiempo',
    map_nav: 'Mapa',
    map_teaser_heading: 'Mapa interactivo del tiempo',
    map_teaser_cta: 'Ver mapa interactivo',
    map_layer_base: 'Mapa base',
    map_search_placeholder: 'Buscar un lugar en el mapa…',
    map_locate: 'Mi ubicación',
    map_popup_full_forecast: 'Ver pronóstico completo',
    map_layer_unavailable: 'Capa no disponible',
  },
  en: {
    search_placeholder: 'Search any city or place…',
    use_my_location: 'Use my location',
    searching: 'Searching…',
    no_results: 'No results for',
    geo_denied: 'Could not get your location.',
    quick_peek: 'Quick peek',
    full_forecast: 'See full forecast',
    back_home: 'Back to home',
    current: 'Now',
    today: 'Today',
    feels_like: 'feels like',
    hourly_48h: 'Hourly — today & tomorrow (48 h)',
    seven_days: '7 days',
    detail: 'Detail',
    wind: 'Wind',
    uv_index: 'UV index',
    sky_air: 'Sky & air',
    humidity: 'humidity',
    pressure: 'pressure',
    visibility: 'visibility',
    sunrise: 'sunrise',
    sunset: 'sunset',
    cloud_cover: 'clouds',
    gusts: 'gusts',
    pick_location: 'Search for a location to see its forecast.',
    loading: 'Loading forecast…',
    load_error: 'Failed to load. It will retry automatically.',
    map_title: 'Weather map',
    map_nav: 'Map',
    map_teaser_heading: 'Interactive weather map',
    map_teaser_cta: 'Open interactive map',
    map_layer_base: 'Base map',
    map_search_placeholder: 'Search a place on the map…',
    map_locate: 'My location',
    map_popup_full_forecast: 'See full forecast',
    map_layer_unavailable: 'Layer unavailable',
  },
};
