import { NewsSection, Province } from "@prisma/client";

export const SECTION_OPTIONS: Array<{ value: NewsSection; label: string }> = [
  { value: NewsSection.NACION, label: "Nacion" },
  { value: NewsSection.PROVINCIAS, label: "Provincias" },
  { value: NewsSection.MUNICIPIOS, label: "Municipios" },
  { value: NewsSection.OPINION, label: "Opinion" },
  { value: NewsSection.ENTREVISTAS, label: "Entrevistas" },
  { value: NewsSection.PUBLINOTAS, label: "Publinotas" },
  { value: NewsSection.RADAR_ELECTORAL, label: "Radar Electoral" },
  { value: NewsSection.ECONOMIA, label: "Economia" },
  { value: NewsSection.INTERNACIONALES, label: "Internacionales" },
  { value: NewsSection.DISTRITOS, label: "Distritos" },
];

export const PROVINCE_OPTIONS: Array<{ value: Province; label: string }> = [
  { value: Province.CABA, label: "CABA" },
  { value: Province.BUENOS_AIRES, label: "Buenos Aires" },
  { value: Province.CATAMARCA, label: "Catamarca" },
  { value: Province.CHACO, label: "Chaco" },
  { value: Province.CHUBUT, label: "Chubut" },
  { value: Province.CORDOBA, label: "Cordoba" },
  { value: Province.CORRIENTES, label: "Corrientes" },
  { value: Province.ENTRE_RIOS, label: "Entre Rios" },
  { value: Province.FORMOSA, label: "Formosa" },
  { value: Province.JUJUY, label: "Jujuy" },
  { value: Province.LA_PAMPA, label: "La Pampa" },
  { value: Province.LA_RIOJA, label: "La Rioja" },
  { value: Province.MENDOZA, label: "Mendoza" },
  { value: Province.MISIONES, label: "Misiones" },
  { value: Province.NEUQUEN, label: "Neuquen" },
  { value: Province.RIO_NEGRO, label: "Rio Negro" },
  { value: Province.SALTA, label: "Salta" },
  { value: Province.SAN_JUAN, label: "San Juan" },
  { value: Province.SAN_LUIS, label: "San Luis" },
  { value: Province.SANTA_CRUZ, label: "Santa Cruz" },
  { value: Province.SANTA_FE, label: "Santa Fe" },
  { value: Province.SANTIAGO_DEL_ESTERO, label: "Santiago del Estero" },
  { value: Province.TIERRA_DEL_FUEGO, label: "Tierra del Fuego" },
  { value: Province.TUCUMAN, label: "Tucuman" },
];

export const SECTION_LABELS: Record<NewsSection, string> = SECTION_OPTIONS.reduce(
  (labels, item) => ({ ...labels, [item.value]: item.label }),
  {} as Record<NewsSection, string>,
);

export const PROVINCE_LABELS: Record<Province, string> = PROVINCE_OPTIONS.reduce(
  (labels, item) => ({ ...labels, [item.value]: item.label }),
  {} as Record<Province, string>,
);

export function sectionLabel(section: NewsSection): string {
  return SECTION_LABELS[section] ?? section;
}

export function provinceLabel(province: Province | null): string | null {
  if (!province) {
    return null;
  }
  return PROVINCE_LABELS[province] ?? province;
}
