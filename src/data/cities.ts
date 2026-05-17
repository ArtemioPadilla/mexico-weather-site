export interface City {
  name: string;
  emoji: string;
  lat: number;
  lng: number;
  tz: string;
}

export const cities: City[] = [
  { name: "Ciudad de México", emoji: "🌆", lat: 19.43, lng: -99.13, tz: "America/Mexico_City" },
  { name: "Oaxaca",           emoji: "🏔️", lat: 17.07, lng: -96.72, tz: "America/Mexico_City" },
  { name: "Puerto Vallarta",  emoji: "🌊", lat: 20.65, lng: -105.25, tz: "America/Mexico_City" },
  { name: "Monterrey",        emoji: "🏙️", lat: 25.67, lng: -100.31, tz: "America/Mexico_City" },
  { name: "Guadalajara",      emoji: "🌺", lat: 20.66, lng: -103.35, tz: "America/Mexico_City" },
];
