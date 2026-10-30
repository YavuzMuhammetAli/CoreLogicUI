import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom, toArray } from 'rxjs';
import { AiService } from './ai.service';
import { AiStreamEvent } from '../models/ai.model';

/**
 * Yapay Zeka SSE akışının ayrıştırılması.
 *
 * Akış HttpClient'tan değil fetch'ten geçer (EventSource POST yapamaz); bu yüzden çerçeveleme,
 * başlıklar ve akış öncesi hata gövdesi elle işlenir — ve interceptor'lar baypas edildiği için
 * Accept-Language servis tarafından eklenmek zorunda. Kimlik çerezle kendiliğinden gider.
 */
describe('AiService.streamChat', () => {
  let service: AiService;
  let fetchSpy: jasmine.Spy;

  /** Verilen parçaları sırayla akıtan bir SSE yanıtı. */
  function sse(...chunks: string[]): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      }
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  function collect(): Promise<AiStreamEvent[]> {
    return firstValueFrom(service.streamChat({ conversationId: 7, message: 'merhaba' }).pipe(toArray()));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AiService);
    fetchSpy = spyOn(window, 'fetch');
  });

  afterEach(() => {
    localStorage.removeItem('lang');
  });

  it('parçalara bölünmüş çerçeveleri birleştirip sırayla olay üretir', async () => {
    fetchSpy.and.resolveTo(sse(
      'event: meta\ndata: {"conversationId":7}\n\nevent: te',
      'xt\ndata: {"text":"Mer"}\n\nevent: text\ndata: {"text":"haba"}\n\n',
      'event: done\ndata: {}\n\n'
    ));

    expect(await collect()).toEqual([
      { type: 'meta', conversationId: 7 },
      { type: 'text', text: 'Mer' },
      { type: 'text', text: 'haba' },
      { type: 'done' }
    ]);
  });

  it('akış ortasında biten kota "quota" olayı olarak gelir', async () => {
    fetchSpy.and.resolveTo(sse(
      'event: quota\ndata: {"message":"Kota doldu"}\n\n',
      'event: usage\ndata: {"inputTokens":10,"outputTokens":5}\n\n'
    ));

    expect(await collect()).toEqual([
      { type: 'quota', message: 'Kota doldu' },
      { type: 'usage', inputTokens: 10, outputTokens: 5 }
    ]);
  });

  it('tool olayı konuyu, status olayı yeniden deneme metnini taşır', async () => {
    fetchSpy.and.resolveTo(sse(
      'event: tool\ndata: {"name":"propose_model","subject":"Musteri"}\n\n',
      'event: tool\ndata: {"name":"list_published_models","subject":null}\n\n',
      'event: status\ndata: {"message":"Yapay zeka şu an yoğun, yeniden deneniyor (2/3)…"}\n\n'
    ));

    expect(await collect()).toEqual([
      { type: 'tool', name: 'propose_model', subject: 'Musteri' },
      { type: 'tool', name: 'list_published_models' },
      { type: 'status', message: 'Yapay zeka şu an yoğun, yeniden deneniyor (2/3)…' }
    ]);
  });

  it('tanınmayan olay ve bozuk JSON sessizce atlanır', async () => {
    fetchSpy.and.resolveTo(sse(
      'event: gelecekte-eklenecek\ndata: {}\n\n',
      'event: text\ndata: {bozuk\n\n',
      'event: refusal\ndata: {}\n\n'
    ));

    expect(await collect()).toEqual([{ type: 'refusal' }]);
  });

  it('akış başlamadan dönen hata gövdesinin mesajını tek hata olayı yapar', async () => {
    fetchSpy.and.resolveTo(new Response(
      JSON.stringify({ success: false, message: 'Aylık kota doldu.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    ));

    expect(await collect()).toEqual([{ type: 'error', message: 'Aylık kota doldu.' }]);
  });

  it('interceptor baypas edildiği için dil başlığını kendisi ekler, token taşımaz', async () => {
    localStorage.setItem('lang', 'en');
    fetchSpy.and.resolveTo(sse('event: done\ndata: {}\n\n'));

    await collect();

    const init = fetchSpy.calls.mostRecent().args[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['Accept-Language']).toBe('en');
    expect(JSON.parse(init.body as string)).toEqual({ conversationId: 7, message: 'merhaba' });
  });
});
