// Tiny, dependency-free i18n. English is the source of truth (labels live in the
// data files); Spanish is provided here and falls back to English if missing.

export type Lang = "en" | "es";

type Dict = Record<string, string>;

// UI chrome strings (both languages — no data fallback).
const UI: Record<Lang, Dict> = {
  en: {
    searchCountry: "Search a country…",
    searchPlace: "Search a place…",
    data: "Data",
    colorBy: "Color by",
    share: "Share what you want",
    update: "Update what you want",
    options: "Options & data source",
    satellite: "Satellite imagery",
    dataTerrain: "Data ↔ terrain",
    autospin: "Auto-spin",
    tapCountry: "Tap any country to see its values.",
    tapPlace: "Tap any place to see its values.",
    mostWant: "Most want here",
    beFirst: "Be the first to share what people here want.",
    live: "Live & shared",
    demo: "Demo mode — saved on this device.",
    tipTravel: "Tip: tap a faint world in space to travel there.",
    sourcePrefix: "Data:",
    noResponses: "no responses yet",
    voice: "voice",
    voices: "voices",
    bothMid: "here want both",
    bothEnd: "— not one or the other.",
    noDataPre: "No data for ",
    noDataPost: " in this dataset.",
    few: "Few",
    most: "Most",
    selectedPlace: "Selected place",
    formTitleNew: "What do you want?",
    formTitleUpdate: "Update what you want",
    formSubtitle: "Pick everything you believe in — even hopes people say you can’t have together.",
    formFor: "For",
    formPick: "Pick a place first.",
    formClose: "Close & tap the globe",
    formAdd: "Add what I want",
    formUpdate: "Update what I want",
    formSaving: "Saving…",
    formFine: "Only anonymous totals are kept for each place — never individual answers.",
    bothNotePre: "You want ",
    bothNotePost: ". Most “either/or” debates are false choices — this map is here to prove it.",
  },
  es: {
    searchCountry: "Buscar un país…",
    searchPlace: "Buscar un lugar…",
    data: "Datos",
    colorBy: "Colorear por",
    share: "Comparte lo que quieres",
    update: "Actualiza lo que quieres",
    options: "Opciones y fuente de datos",
    satellite: "Imágenes satelitales",
    dataTerrain: "Datos ↔ terreno",
    autospin: "Giro automático",
    tapCountry: "Toca cualquier país para ver sus valores.",
    tapPlace: "Toca cualquier lugar para ver sus valores.",
    mostWant: "Lo que más se quiere aquí",
    beFirst: "Sé el primero en compartir lo que quiere la gente de aquí.",
    live: "En vivo y compartido",
    demo: "Modo demo: guardado en este dispositivo.",
    tipTravel: "Consejo: toca un mundo tenue en el espacio para viajar allí.",
    sourcePrefix: "Fuente:",
    noResponses: "sin respuestas aún",
    voice: "voz",
    voices: "voces",
    bothMid: "aquí quiere a la vez",
    bothEnd: ", no una u otra cosa.",
    noDataPre: "Sin datos de ",
    noDataPost: " en este conjunto.",
    few: "Pocos",
    most: "La mayoría",
    selectedPlace: "Lugar seleccionado",
    formTitleNew: "¿Qué quieres?",
    formTitleUpdate: "Actualiza lo que quieres",
    formSubtitle: "Elige todo en lo que crees, incluso metas que dicen que no se pueden tener a la vez.",
    formFor: "Para",
    formPick: "Primero elige un lugar.",
    formClose: "Cerrar y tocar el globo",
    formAdd: "Añadir lo que quiero",
    formUpdate: "Actualizar lo que quiero",
    formSaving: "Guardando…",
    formFine: "Solo se guardan totales anónimos por lugar, nunca respuestas individuales.",
    bothNotePre: "Quieres ",
    bothNotePost: ". La mayoría de los debates de “esto o lo otro” son falsas disyuntivas, y este mapa lo demuestra.",
  },
};

// Spanish translations for data labels, keyed by id (English comes from the data).
const ES = {
  world: { earth: "Tierra", moon: "Luna", mars: "Marte" } as Dict,
  worldTag: {
    earth: "¿Qué quiere realmente el mundo?",
    moon: "Si nos establecemos aquí, ¿qué debería representar?",
    mars: "Un nuevo comienzo: ¿qué queremos que sea?",
  } as Dict,
  source: {
    community: "Comunidad",
    happiness: "Felicidad mundial",
    hofstede: "Valores culturales",
    hdi: "Desarrollo humano",
  } as Dict,
  metric: {
    ladder: "Felicidad",
    social: "Apoyo social",
    freedom: "Libertad",
    generosity: "Generosidad",
    idv: "Individualismo",
    pdi: "Distancia al poder",
    mas: "Competitividad",
    uai: "Evasión de incertidumbre",
    lto: "Enfoque a largo plazo",
    ivr: "Indulgencia",
    hdi: "IDH",
  } as Dict,
  metricLow: {
    ladder: "Menor",
    social: "Menos",
    freedom: "Menos",
    generosity: "Menos",
    idv: "Colectivista",
    pdi: "Plana",
    mas: "Cooperativa",
    uai: "Relajada",
    lto: "Corto plazo",
    ivr: "Moderación",
    hdi: "Menor",
  } as Dict,
  metricHigh: {
    ladder: "Mayor",
    social: "Más",
    freedom: "Más",
    generosity: "Más",
    idv: "Individualista",
    pdi: "Jerárquica",
    mas: "Competitiva",
    uai: "Evasiva",
    lto: "Largo plazo",
    ivr: "Indulgencia",
    hdi: "Muy alto",
  } as Dict,
  want: {
    nature: "Naturaleza",
    growth: "Crecimiento",
    community: "Comunidad",
    freedom: "Libertad",
    care: "Necesidades básicas",
    safety: "Seguridad",
    progress: "Progreso",
    heritage: "Tradición",
    openness: "Apertura",
    beauty: "Belleza",
    fairness: "Equidad",
    leanGov: "Gobierno eficiente",
    services: "Servicios",
    health: "Salud",
    peace: "Paz",
  } as Dict,
  wantLong: {
    nature: "Un medio ambiente próspero",
    growth: "Una economía próspera e innovadora",
    community: "Comunidad y familia fuertes",
    freedom: "Libertad y derechos personales",
    care: "Necesidades básicas cubiertas para todos",
    safety: "Seguridad y poca delincuencia",
    progress: "Ciencia y tecnología",
    heritage: "Tradición y herencia",
    openness: "Apertura al mundo",
    beauty: "Lugares bellos y bien construidos",
    fairness: "Equidad e igualdad de oportunidades",
    leanGov: "Un gobierno reducido y eficiente",
    services: "Servicios públicos sólidos",
    health: "Buena salud y atención médica",
    peace: "Paz y cooperación",
  } as Dict,
  pair: {
    green_growth: "un medio ambiente próspero y una economía pujante",
    free_together: "libertad personal y una comunidad fuerte",
    roots_open: "tradición y apertura al mundo",
    lean_care: "un gobierno eficiente y servicios públicos sólidos",
  } as Dict,
};

interface MetricLike {
  id: string;
  label: string;
  low: string;
  high: string;
}
interface SourceLike {
  id: string;
  kind: "community" | "reference";
  label: string;
}

export function tUI(lang: Lang, key: string): string {
  return UI[lang][key] ?? UI.en[key] ?? key;
}
export function tWorldName(lang: Lang, id: string, en: string): string {
  return lang === "es" ? ES.world[id] ?? en : en;
}
export function tWorldTag(lang: Lang, id: string, en: string): string {
  return lang === "es" ? ES.worldTag[id] ?? en : en;
}
export function tSource(lang: Lang, source: SourceLike): string {
  return lang === "es" ? ES.source[source.id] ?? source.label : source.label;
}
export function tMetric(lang: Lang, source: SourceLike, metric: MetricLike): string {
  if (lang !== "es") return metric.label;
  return (source.kind === "community" ? ES.want[metric.id] : ES.metric[metric.id]) ?? metric.label;
}
export function tMetricLow(lang: Lang, source: SourceLike, metric: MetricLike): string {
  if (source.kind === "community") return tUI(lang, "few");
  return lang === "es" ? ES.metricLow[metric.id] ?? metric.low : metric.low;
}
export function tMetricHigh(lang: Lang, source: SourceLike, metric: MetricLike): string {
  if (source.kind === "community") return tUI(lang, "most");
  return lang === "es" ? ES.metricHigh[metric.id] ?? metric.high : metric.high;
}
export function tWantShort(lang: Lang, id: string, en: string): string {
  return lang === "es" ? ES.want[id] ?? en : en;
}
export function tWantLong(lang: Lang, id: string, en: string): string {
  return lang === "es" ? ES.wantLong[id] ?? en : en;
}
export function tPair(lang: Lang, id: string, en: string): string {
  return lang === "es" ? ES.pair[id] ?? en : en;
}
