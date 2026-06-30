/** Categorie salvate nel campo `tag` del media. */

export const CATEGORY_DAD = "Consigliato dal papà";
export const CATEGORY_MOM = "Consigliato dalla mamma";

export const MEDIA_CATEGORIES = [
  CATEGORY_DAD,
  CATEGORY_MOM,
  "Classico",
  "Avventura",
  "Commedia",
  "Fantasy",
  "Fantascienza",
  "Animazione",
  "Musical",
  "Famiglia",
  "Educativo",
  "Documentario",
  "Biografico",
  "Sport",
  "Supereroi",
  "Amicizia",
  "Natura",
  "Natale",
  "Halloween",
] as const;

export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export const CATEGORY_GROUPS = [
  {
    label: "Consigli della famiglia",
    options: [CATEGORY_DAD, CATEGORY_MOM],
  },
  {
    label: "Generi e temi",
    options: MEDIA_CATEGORIES.filter(
      (c) => c !== CATEGORY_DAD && c !== CATEGORY_MOM,
    ),
  },
] as const;
