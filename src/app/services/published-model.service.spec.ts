import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { PublishedModelService } from './published-model.service';
import { AuthService } from './auth.service';

/**
 * Model list cache. Behaviours under guard: a single request per session (page load used to
 * request it 2-3 times), a new request when the schema changes and on login as another user, and a
 * failed response is not kept in the cache.
 */
describe('PublishedModelService.getModels', () => {
  const url = `${environment.apiBaseUrl}/PublishedModel/models`;
  let service: PublishedModelService;
  let httpMock: HttpTestingController;
  let sessionKey: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PublishedModelService);
    httpMock = TestBed.inject(HttpTestingController);
    sessionKey = spyOn(TestBed.inject(AuthService), 'sessionKey').and.returnValue('kullanici-a');
  });

  afterEach(() => httpMock.verify());

  const ok = { success: true, message: '', data: [{ typeName: 'Urun', columns: [] }] };

  it('sends a single request per session', () => {
    service.getModels().subscribe();
    service.getModels().subscribe();
    httpMock.expectOne(url).flush(ok);

    let typeName = '';
    service.getModels().subscribe(res => typeName = res.data[0].typeName);
    expect(typeName).toBe('Urun');
  });

  it('requests again when invalidated and publishes the event', () => {
    let invalidated = 0;
    service.modelsInvalidated$.subscribe(() => invalidated++);

    service.getModels().subscribe();
    httpMock.expectOne(url).flush(ok);
    service.invalidateModels();
    service.getModels().subscribe();
    httpMock.expectOne(url).flush(ok);

    expect(invalidated).toBe(1);
  });

  it('requests again on login as another user', () => {
    service.getModels().subscribe();
    httpMock.expectOne(url).flush(ok);

    sessionKey.and.returnValue('kullanici-b');
    service.getModels().subscribe();
    httpMock.expectOne(url).flush(ok);
  });

  it('a failed response is not kept in the cache', () => {
    service.getModels().subscribe();
    httpMock.expectOne(url).flush({ success: false, message: 'Assembly yüklenmedi', data: [] });

    service.getModels().subscribe();
    httpMock.expectOne(url).flush(ok);
  });
});
