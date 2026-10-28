import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable, Subject, shareReplay, tap } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import { environment } from '../../environments/environment';
import { SKIP_FORBIDDEN_REDIRECT } from '../interceptors/error.interceptor';
import type { PublishedTableSchema } from './published-table.service';

/** Kolon meta verisi — backend PublishedColumnInfo ile eşleşir */
export interface PublishedColumn {
  columnName: string;
  // UI tip anahtarları: string / int / long / short / byte / decimal / double / float / boolean /
  // datetime / dateonly / timeonly / guid / enum / lookup / image / file
  dataType: string;
  isNullable: boolean;
  // Yeni tip metadata'sı: enum / lookup (şemadan — reflection'dan değil)
  enumValues?: string | null;
  lookupTargetTable?: string | null;
  lookupDisplayColumn?: string | null;
  /** string'te karakter sınırı; image/file'da dosya boyutu sınırı (KB) — bkz. utils/file-size.ts */
  maxLength?: number | null;
  // UI metadata: kullanıcı dostu gösterim (şemadan — reflection'dan değil)
  label?: string | null;
  description?: string | null;
}

/** Model meta verisi — backend PublishedModelInfo ile eşleşir */
export interface PublishedModel {
  typeName: string;
  /** Kullanıcı dostu model adı (PublishedTable.Label). Boşsa typeName gösterilir. */
  label?: string | null;
  /** Model ikonu (PublishedTable.Icon, Material Symbols adı) — `<app-model-icon>` çizer. */
  icon?: string | null;
  columns: PublishedColumn[];
}

/**
 * Lookup kolonu için bir seçenek: FK olarak kaydedilecek ID + gösterilecek etiket.
 * Backend LookupOptionDto ile eşleşir.
 *
 * Burada tanımlıdır (record-metadata.service.ts'te değil) çünkü onu üreten uç bu servistedir;
 * record-metadata bu servisi zaten import ediyor, tersi dairesel bağımlılık olurdu.
 */
export interface LookupOption {
  id: number;
  label: string;
}

/** Sayfalı yanıt verisi — backend PagedResult ile eşleşir */
export interface PagedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Sayfalı getAll yanıtı */
export interface PagedResponseModel<T> extends ResponseModel {
  data: PagedData<T>;
}

/**
 * Kaydedilecek bir kayıt ve tüm alt ağacı — POST /PublishedModel/addTree gövdesi.
 *
 * FK alanları BURADA GÖNDERİLMEZ: sunucu her düğümü kaydettikten sonra EF'in
 * döndürdüğü gerçek ID'yi çocuğun `{ÜstTip}Id` kolonuna kendisi yazar. Böylece
 * istemcinin ID tahmin etmesi (liste çekip max(ID) alması) gerekmez — eşzamanlı
 * kullanıcılarda alt kayıtların yabancı bir üst kayda bağlanması imkânsızdır.
 */
export interface DynamicTreeNodeDto {
  typeName: string;
  /** İstemcinin geçici kimliği; yanıttaki savedIds/errors bu anahtarla döner. */
  clientId: string;
  jsonData: Record<string, unknown>;
  /** Doluysa düğüm EKLENMEZ, yalnızca çocuklarının FK hedefi olur (mevcut kayda ekleme). */
  existingId?: number | null;
  children: DynamicTreeNodeDto[];
}

/** addTree yanıtı. Hata varsa HİÇBİR kayıt oluşmaz ve tüm hatalar birden döner. */
export interface TreeSaveResult {
  /** clientId → veritabanındaki gerçek ID */
  savedIds: Record<string, number>;
  /** clientId → doğrulama hata mesajı */
  errors: Record<string, string>;
}

/**
 * Yardımcı isteklerin bağlamı: 403 kullanıcıyı sayfadan koparmasın. Lookup hedefini ya da
 * alt modeli okuma izni olmayan kullanıcı ham id / kuralsız form görür, /models'e atılmaz.
 */
const AUXILIARY = () => new HttpContext().set(SKIP_FORBIDDEN_REDIRECT, true);

@Injectable({ providedIn: 'root' })
export class PublishedModelService {
  private readonly baseUrl = `${environment.apiBaseUrl}/PublishedModel`;

  /**
   * Model listesi önbelleği süresi. Liste başka bir admin'in yayınıyla değişebilir; bu oturumun
   * kendi şema değişiklikleri `invalidateModels()` ile anında düşer (PublishedTableService çağırır).
   */
  static readonly MODELS_TTL_MS = 5 * 60 * 1000;

  private modelsCache: { at: number; token: string | null; models$: Observable<ListResponseModel<PublishedModel>> } | null = null;

  /** Model listesi geçersiz kılındı — türetilmiş önbellekler (RecordMetadataService) de düşsün. */
  readonly modelsInvalidated$ = new Subject<void>();

  constructor(private http: HttpClient) {}

  /**
   * Assembly'deki tüm model tiplerini ve kolon meta verilerini getirir — ÖNBELLEKLİ.
   *
   * Kabuk, model listesi, kayıt/liste ekranları, şema/rapor/akış tasarımcıları ve izin ekranları
   * bunu ayrı ayrı istiyordu: tek bir sayfa açılışı 2-3 kez, sunucuda da her biri model başına
   * izin + şema sorgusu. Liste kullanıcının izinlerine göre süzüldüğü için önbellek oturum
   * token'ına bağlıdır: çıkış yapıp başka kullanıcıyla girilince yeniden istenir.
   */
  getModels(): Observable<ListResponseModel<PublishedModel>> {
    const now = Date.now();
    const token = this.currentToken();
    const cached = this.modelsCache;
    if (cached && cached.token === token && now - cached.at < PublishedModelService.MODELS_TTL_MS) {
      return cached.models$;
    }

    const models$ = this.http.get<ListResponseModel<PublishedModel>>(`${this.baseUrl}/models`).pipe(
      // Başarısız yanıt ya da hata önbellekte kalmasın: sonraki çağrı yeniden denesin.
      tap({
        next: res => { if (!res.success) this.dropCache(models$); },
        error: () => this.dropCache(models$)
      }),
      shareReplay(1)
    );
    this.modelsCache = { at: now, token, models$ };
    return models$;
  }

  /** Model listesini (ve ondan türetilen önbellekleri) düşürür — şema değiştiğinde çağrılır. */
  invalidateModels(): void {
    this.modelsCache = null;
    this.modelsInvalidated$.next();
  }

  private dropCache(models$: Observable<unknown>): void {
    if (this.modelsCache?.models$ === models$) this.modelsCache = null;
  }

  private currentToken(): string | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem('access_token');
    } catch {
      return null;
    }
  }

  /** Tüm kayıtları getirir. parentColumn + parentId verilirse FK filtrelemesi yapılır. */
  getAll(typeName: string, parentColumn?: string, parentId?: number): Observable<ListResponseModel<Record<string, unknown>>> {
    let params = new HttpParams().set('typeName', typeName);
    if (parentColumn && parentId != null) {
      params = params.set('parentColumn', parentColumn).set('parentId', parentId);
    }
    return this.http.get<ListResponseModel<Record<string, unknown>>>(`${this.baseUrl}/getall`, { params });
  }

  /**
   * Lookup dropdown'u için sayfalı + aranabilir {id, label} listesi.
   *
   * Eski yol hedef tablonun TÜM satırlarını tam entity olarak çekiyordu
   * (Musteri: 12.025 satır / 5 MB / ~3,9 sn). Bu uç yalnız iki kolonu projekte eder
   * ve sayfalar — aynı tablo için 50 kayıt ~2 KB.
   *
   * `search` sunucuda `contains` olarak uygulanır; arama sonucunda da sayfalama sürer.
   */
  lookupOptions(
    typeName: string,
    displayColumn: string | null | undefined,
    opts: { search?: string; page?: number; pageSize?: number } = {}
  ): Observable<PagedResponseModel<LookupOption>> {
    let params = new HttpParams()
      .set('typeName', typeName)
      .set('page', opts.page ?? 1)
      .set('pageSize', opts.pageSize ?? 50);

    if (displayColumn) params = params.set('displayColumn', displayColumn);
    if (opts.search)   params = params.set('search', opts.search);

    return this.http.get<PagedResponseModel<LookupOption>>(`${this.baseUrl}/lookupOptions`, { params, context: AUXILIARY() });
  }

  /**
   * Belirli FK id'lerinin etiketlerini TEK istekte çözer (arama/sayfalama yok sayılır).
   *
   * İki yerde şart:
   *  1) Düzenleme formunda seçili değer ilk 50 seçenek arasında olmayabilir — etiketi
   *     çözülmezse kullanıcı boş bir kutu görür ve kaydettiğinde FK sessizce silinir.
   *  2) Liste/tablo hücrelerinde FK id'lerini etikete çevirmek (sayfa başına tek istek).
   */
  lookupOptionsByIds(
    typeName: string,
    displayColumn: string | null | undefined,
    ids: number[]
  ): Observable<PagedResponseModel<LookupOption>> {
    let params = new HttpParams()
      .set('typeName', typeName)
      .set('ids', ids.join(','));

    if (displayColumn) params = params.set('displayColumn', displayColumn);

    return this.http.get<PagedResponseModel<LookupOption>>(`${this.baseUrl}/lookupOptions`, { params, context: AUXILIARY() });
  }

  /**
   * Sayfalı kayıt listesi getirir. Backend'e page + pageSize gönderilir; yalnız ilgili
   * sayfa döner. Alt-model sekmeleri paramsız getAll kullanmaya devam eder.
   */
  getAllPaged(
    typeName: string,
    page: number,
    pageSize: number,
    parentColumn?: string,
    parentId?: number
  ): Observable<PagedResponseModel<Record<string, unknown>>> {
    let params = new HttpParams()
      .set('typeName', typeName)
      .set('page', page)
      .set('pageSize', pageSize);
    if (parentColumn && parentId != null) {
      params = params.set('parentColumn', parentColumn).set('parentId', parentId);
    }
    return this.http.get<PagedResponseModel<Record<string, unknown>>>(`${this.baseUrl}/getall`, { params });
  }

  /** Belirtilen parent modelin doğrudan alt model adlarını döndürür. */
  getChildModels(parentTypeName: string): Observable<ListResponseModel<string>> {
    const params = new HttpParams().set('parentTypeName', parentTypeName);
    return this.http.get<ListResponseModel<string>>(`${this.baseUrl}/children`, { params });
  }

  /**
   * Kayıt formunun şema kuralları (doğrulama, otomatik değer, salt okunur) — modelde Read
   * izni yeter. Admin'e özel /Published/getTable ile AYNI veriyi döner; kayıt formları bunu,
   * şema tasarım ekranları (admin) getTable'ı kullanır.
   */
  getSchema(typeName: string): Observable<DataResponseModel<PublishedTableSchema>> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.get<DataResponseModel<PublishedTableSchema>>(
      `${this.baseUrl}/schema`, { params, context: AUXILIARY() }
    );
  }

  /** Tek kayıt getirir */
  get(typeName: string, id: number): Observable<DataResponseModel<Record<string, unknown>>> {
    const params = new HttpParams().set('typeName', typeName).set('id', id);
    return this.http.get<DataResponseModel<Record<string, unknown>>>(`${this.baseUrl}/get`, { params });
  }

  /**
   * Yeni kayıt ekler ve OLUŞAN KAYDIN ID'sini döndürür (`data`).
   * ID dönmeseydi çağıran eklediği kaydı bulmak için ayrı bir sorgu atmak zorunda kalırdı;
   * unique kısıt olmadığı için de doğru kaydı bulma garantisi olmazdı.
   */
  add(typeName: string, jsonData: Record<string, unknown>): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/add`, { typeName, jsonData });
  }

  /**
   * Bir kayıt ağacını (ana kayıt + alt kayıtlar + torunlar) TEK istekte gönderir.
   * Sunucu hepsini TEK transaction içinde yazar: bir alan bile geçersizse hiçbir
   * kayıt oluşmaz ve hataların tamamı `errors` içinde birden döner.
   */
  addTree(root: DynamicTreeNodeDto): Observable<DataResponseModel<TreeSaveResult>> {
    return this.http.post<DataResponseModel<TreeSaveResult>>(`${this.baseUrl}/addTree`, root);
  }

  /** Kayıt günceller */
  update(typeName: string, jsonData: Record<string, unknown>): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/update`, { typeName, jsonData });
  }

  /** Kayıt siler */
  delete(typeName: string, id: number): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName).set('id', id);
    return this.http.post<ResponseModel>(`${this.baseUrl}/delete`, null, { params });
  }
}
