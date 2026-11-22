/** TR/EN text pair of a single translation key. */
export interface TranslationEntry {
  tr: string;
  en: string;
}

/** Key → TR/EN text pair dictionary. Every feature file produces this shape. */
export type Translations = Record<string, TranslationEntry>;
