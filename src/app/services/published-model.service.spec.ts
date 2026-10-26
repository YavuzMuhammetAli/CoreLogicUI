import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { PublishedModelService } from './published-model.service';

/**
 * Model listesi önbelleği. Korunan davranışlar: aynı oturumda tek istek (sayfa açılışı eskiden
 * 2-3 kez istiyordu), şema değişince ve başka kullanıcıyla girişte yeniden istek, başarısız
 * yanıtın önbellekte kalmaması.
 */
describe('PublishedModelService.getModels', () => {
  const url = `${environment.apiBaseUrl}/PublishedModel/models`;
  let service: PublishedModelService;
  let httpMock: HttpTestingController;
  let savedToken: string | null;

  beforeEach(() => {
    savedToken = localStorage.getItem('access_token');
    localStorage.setItem('access_token', 'token-a');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PublishedModelService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    if (savedToken === null) localStorage.removeItem('access_token');
    else localStorage.setItem('access_token', savedToken);
  });

  const ok = { success: true, message: '', data: [{ typeName: 'Urun', columns: [] }] };

  it('aynı oturumda tek istek atar', () => {
    service.getModels().subscribe();
    service.getModels().subscribe();
    httpMock.expectOne(url).flush(ok);

    let typeName = '';
    service.getModels().subscribe(res => typeName = res.data[0].typeName);
    expect(typeName).toBe('Urun');
  });

  it('geçersiz kılınınca yeniden ister ve olayı yayınlar', () => {
    let invalidated = 0;
    service.modelsInvalidated$.subscribe(() => invalidated++);

    service.getModels().subscribe();
    httpMock.expectOne(url).flush(ok);
    service.invalidateModels();
    service.getModels().subscribe();
    httpMock.expectOne(url).flush(ok);

    expect(invalidated).toBe(1);
  });

  it('başka kullanıcıyla girişte (token değişince) yeniden ister', () => {
    service.getModels().subscribe();
    httpMock.expectOne(url).flush(ok);

    localStorage.setItem('access_token', 'token-b');
    service.getModels().subscribe();
    httpMock.expectOne(url).flush(ok);
  });

  it('başarısız yanıt önbellekte kalmaz', () => {
    service.getModels().subscribe();
    httpMock.expectOne(url).flush({ success: false, message: 'Assembly yüklenmedi', data: [] });

    service.getModels().subscribe();
    httpMock.expectOne(url).flush(ok);
  });
});
