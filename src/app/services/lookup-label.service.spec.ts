import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { LookupLabelService } from './lookup-label.service';

/**
 * Lookup label cache — only missing ids are resolved, in one request; the key is
 * target table + display column.
 */
describe('LookupLabelService', () => {
  const url = `${environment.apiBaseUrl}/PublishedModel/lookupOptions`;
  let service: LookupLabelService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(LookupLabelService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function respond(items: { id: number; label: string }[]): void {
    httpMock.expectOne(r => r.url === url).flush({
      success: true, message: '', data: { items, total: items.length, page: 1, pageSize: items.length }
    });
  }

  it('resolves unique, valid ids in one request and sends no request when cached', () => {
    service.ensure('Musteri', 'Ad', [3, 3, 0, -1, 5]).subscribe();
    const request = httpMock.expectOne(r => r.url === url);
    expect(request.request.params.get('ids')).toBe('3,5');
    expect(request.request.params.get('displayColumn')).toBe('Ad');
    request.flush({ success: true, message: '', data: { items: [{ id: 3, label: 'Ayşe' }, { id: 5, label: 'Ali' }], total: 2, page: 1, pageSize: 2 } });

    expect(service.label('Musteri', 'Ad', 3)).toBe('Ayşe');

    service.ensure('Musteri', 'Ad', [3, 5]).subscribe();
    httpMock.expectNone(r => r.url === url);
  });

  it('a different display column is a separate cache', () => {
    service.ensure('Musteri', 'Ad', [3]).subscribe();
    respond([{ id: 3, label: 'Ayşe' }]);

    expect(service.label('Musteri', 'Eposta', 3)).toBeNull();
    service.ensure('Musteri', 'Eposta', [3]).subscribe();
    respond([{ id: 3, label: 'ayse@acme.test' }]);
    expect(service.label('Musteri', 'Eposta', 3)).toBe('ayse@acme.test');
    expect(service.label('Musteri', 'Ad', 3)).toBe('Ayşe');
  });

  it('invalidate drops only that table\'s labels', () => {
    service.ensure('Musteri', null, [1]).subscribe();
    respond([{ id: 1, label: 'A' }]);
    service.ensure('Urun', null, [1]).subscribe();
    respond([{ id: 1, label: 'U' }]);

    service.invalidate('Musteri');
    expect(service.label('Musteri', null, 1)).toBeNull();
    expect(service.label('Urun', null, 1)).toBe('U');
  });

  it('if the request fails the stream completes without error, the label stays unresolved', () => {
    let completed = false;
    service.ensure('Musteri', null, [9]).subscribe({ complete: () => (completed = true) });
    httpMock.expectOne(r => r.url === url).flush(null, { status: 500, statusText: 'err' });

    expect(completed).toBeTrue();
    expect(service.label('Musteri', null, 9)).toBeNull();
  });
});
