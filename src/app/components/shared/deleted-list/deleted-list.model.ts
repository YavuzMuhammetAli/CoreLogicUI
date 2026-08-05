import { Observable } from 'rxjs';
import { ResponseModel } from '../../../models/responseModel';

/**
 * Silinen kayıt listelerinin ortak öğe şekli.
 *
 * Dört ekran (model / taslak / rapor / dashboard) aynı kartı çiziyordu; farkları
 * yalnızca gösterilen rozetler ve geri yükleme anahtarıydı. Bu tip o farkları
 * veriye indirger, böylece görünüm ve durum yönetimi tek yerde kalır.
 */
export interface DeletedItem {
  /** Listede benzersiz anahtar (@for track). */
  id: number;
  /** Kartın başlığı — model/tablo/rapor/dashboard adı. */
  title: string;
  /** Başlığın altında gösterilen açıklama (varsa). */
  description?: string | null;
  /**
   * Başlığın yanında gösterilen ek meta rozetleri
   * (ör. rapor için model adı, dashboard için "3 widget").
   */
  badges?: string[];
  /**
   * Geri yükleme çağrısına verilecek anahtar. Modeller/taslaklar tablo ADIYLA,
   * raporlar/dashboardlar ID ile geri yüklenir; bu alan farkı kapsüller.
   */
  restoreKey: string | number;
}

/**
 * Bir "silinenler" ekranının veri kaynağı ve metin ön eki.
 * Ekranlar bunu sağlar; listeleme/hata/geri yükleme akışını
 * <c>DeletedListComponent</c> yürütür.
 */
export interface DeletedListSource {
  /**
   * Çeviri anahtarı ön eki (ör. 'deleted.models'). Ekrana özel metinler
   * `{prefix}.title`, `{prefix}.empty`, `{prefix}.restoreConfirm` gibi
   * anahtarlardan okunur; ortak metinler `deleted.*` altındadır.
   */
  i18nPrefix: string;

  /** "Geri" bağlantısının hedefi. */
  backLink: string;

  /** Silinmiş kayıtları getirir ve ortak öğe şekline eşler. */
  load(): Observable<{ success: boolean; message: string; items: DeletedItem[] }>;

  /** Kaydı yeniden aktif eder. */
  restore(item: DeletedItem): Observable<ResponseModel>;
}
