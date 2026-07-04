export type MangaCategoryPreset =
  | "saved"
  | "updates"
  | "popular"
  | "new"
  | "completed";

export interface MangaCategory {
  id: string;
  label: string;
  subtitle?: string;
  preset?: MangaCategoryPreset;
  tagId?: string;
}

/** Righe homepage manga — ordine di visualizzazione. */
export const MANGA_HOME_CATEGORIES: MangaCategory[] = [
  {
    id: "saved",
    label: "La tua lista",
    subtitle: "Manga salvati con il tasto +",
    preset: "saved",
  },
  {
    id: "updates",
    label: "Novità",
    subtitle: "Ultimi aggiornamenti su MangaDex",
    preset: "updates",
  },
  {
    id: "popular",
    label: "Più seguiti",
    subtitle: "I manga più popolari",
    preset: "popular",
  },
  {
    id: "new",
    label: "Appena aggiunti",
    subtitle: "Nuovi titoli nel catalogo",
    preset: "new",
  },
  {
    id: "completed",
    label: "Completati",
    subtitle: "Storie finite, pronte da leggere",
    preset: "completed",
  },
  {
    id: "action",
    label: "Azione",
    tagId: "391b0423-d847-456f-aff0-8b0cfc03066b",
  },
  {
    id: "romance",
    label: "Romance",
    tagId: "423e2eae-a7a2-4a8b-ac03-a8351462d71d",
  },
  {
    id: "comedy",
    label: "Commedia",
    tagId: "4d32cc48-9f00-4cca-9b5a-a839f0764984",
  },
  {
    id: "slice-of-life",
    label: "Slice of Life",
    tagId: "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
  },
  {
    id: "isekai",
    label: "Isekai",
    tagId: "ace04997-f6bd-436e-b261-779182193d3d",
  },
  {
    id: "horror",
    label: "Horror",
    tagId: "cdad7e68-1419-41dd-bdce-27753074a640",
  },
  {
    id: "sci-fi",
    label: "Sci-Fi",
    tagId: "256c8bd9-4904-4360-bf4f-508a76d67183",
  },
  {
    id: "thriller",
    label: "Thriller",
    tagId: "07251805-a27e-4d59-b488-f0bfbec15168",
  },
  {
    id: "psychological",
    label: "Psicologico",
    tagId: "3b60b75c-a2d7-4860-ab56-05f391bb889c",
  },
];

export function getMangaCategory(id: string): MangaCategory | undefined {
  return MANGA_HOME_CATEGORIES.find((cat) => cat.id === id);
}

export function isMangaGenreCategory(category: MangaCategory): boolean {
  return Boolean(category.tagId);
}
