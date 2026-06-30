/** Tek bir çeviri anahtarının TR/EN metin çifti. */
export interface TranslationEntry {
  tr: string;
  en: string;
}

/** Anahtar → TR/EN metin çifti sözlüğü. Her özellik dosyası bu şekli üretir. */
export type Translations = Record<string, TranslationEntry>;
