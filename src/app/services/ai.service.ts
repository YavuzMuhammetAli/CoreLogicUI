import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { DataResponseModel } from '../models/dataResponseModel';
import { ListResponseModel } from '../models/responseModelList';
import { ResponseModel } from '../models/responseModel';
import {
  AiChatRequest,
  AiConversationDetail,
  AiConversationListItem,
  AiProposalStatusUpdate,
  AiStreamEvent,
  AiUsage
} from '../models/ai.model';

/**
 * Yapay Zeka modülü (G4) — sohbet, öneri durumu ve kota.
 *
 * Tenant istemciden GÖNDERİLMEZ: tüm uçlar çağıran admin'in JWT'sindeki ambient
 * tenant'ında çalışır.
 */
@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/Ai`;

  // ── Sohbetler ────────────────────────────────────────────────────────────

  getConversations(): Observable<ListResponseModel<AiConversationListItem>> {
    return this.http.get<ListResponseModel<AiConversationListItem>>(
      `${this.baseUrl}/conversations`
    );
  }

  getConversation(id: number): Observable<DataResponseModel<AiConversationDetail>> {
    return this.http.get<DataResponseModel<AiConversationDetail>>(
      `${this.baseUrl}/conversations/${id}`
    );
  }

  deleteConversation(id: number): Observable<ResponseModel> {
    return this.http.delete<ResponseModel>(`${this.baseUrl}/conversations/${id}`);
  }

  // ── Kota ─────────────────────────────────────────────────────────────────

  getUsage(): Observable<DataResponseModel<AiUsage>> {
    return this.http.get<DataResponseModel<AiUsage>>(`${this.baseUrl}/usage`);
  }

  // ── Öneri durumu ─────────────────────────────────────────────────────────

  /** İçeri aktarma/yayınlama sonucunu backend'e geri yazar. */
  updateProposalStatus(id: number, body: AiProposalStatusUpdate): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/proposals/${id}/status`, body);
  }

  // ── Sohbet akışı (SSE) ───────────────────────────────────────────────────

  /**
   * Yanıtı Server-Sent Events olarak akıtır.
   *
   * HttpClient yerine `fetch` kullanılır: `EventSource` POST yapamaz ve header
   * ekleyemez, HttpClient ise yanıtı akıtmaz (tamamlanmasını bekler). Bunun
   * bedeli, isteğin interceptor zincirini BAYPAS etmesidir — bu yüzden
   * Authorization ve Accept-Language başlıkları burada elle eklenir
   * (auth.interceptor.ts / language.interceptor.ts ile aynı anahtarlar).
   *
   * Abonelik sonlandırıldığında istek iptal edilir (AbortController), böylece
   * kullanıcı sayfadan ayrılınca sunucu tarafı akış da kapanır.
   */
  streamChat(request: AiChatRequest): Observable<AiStreamEvent> {
    return new Observable<AiStreamEvent>(subscriber => {
      const controller = new AbortController();

      void (async () => {
        try {
          const response = await fetch(`${this.baseUrl}/chat`, {
            method: 'POST',
            headers: this.streamHeaders(),
            body: JSON.stringify(request),
            signal: controller.signal
          });

          if (!response.ok) {
            // Kota/doğrulama hatası akış başlamadan döner: gövde normal
            // ResponseModel'dir, SSE değil.
            const failure = await this.readErrorMessage(response);
            subscriber.next({ type: 'error', message: failure });
            subscriber.complete();
            return;
          }

          if (!response.body) {
            subscriber.next({ type: 'error', message: 'stream-unsupported' });
            subscriber.complete();
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // SSE çerçeveleri boş satırla ayrılır. Son parça yarım kalmış
            // olabileceğinden tampona geri konur.
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';

            for (const frame of frames) {
              const parsed = this.parseFrame(frame);
              if (parsed) subscriber.next(parsed);
            }
          }

          subscriber.complete();
        } catch (error) {
          // Abort, aboneliğin sonlandırılmasıdır — hata değil.
          if (controller.signal.aborted) {
            subscriber.complete();
            return;
          }
          subscriber.next({
            type: 'error',
            message: error instanceof Error ? error.message : 'network-error'
          });
          subscriber.complete();
        }
      })();

      return () => controller.abort();
    });
  }

  private streamHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    };

    if (typeof localStorage !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      headers['Accept-Language'] = localStorage.getItem('lang') === 'en' ? 'en' : 'tr';
    }

    return headers;
  }

  /** Akış başlamadan dönen hata gövdesinden kullanıcıya gösterilecek mesajı çıkarır. */
  private async readErrorMessage(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as ResponseModel;
      return body?.message || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }

  /** Tek bir SSE çerçevesini (`event: X` + `data: {...}`) olaya çevirir. */
  private parseFrame(frame: string): AiStreamEvent | null {
    let eventName = '';
    let data = '';

    for (const line of frame.split('\n')) {
      if (line.startsWith('event: ')) eventName = line.slice(7).trim();
      else if (line.startsWith('data: ')) data = line.slice(6);
    }

    if (!eventName) return null;

    let payload: Record<string, unknown> = {};
    try {
      payload = data ? JSON.parse(data) : {};
    } catch {
      return null;
    }

    switch (eventName) {
      case 'meta':
        return { type: 'meta', conversationId: Number(payload['conversationId']) };
      case 'text':
        return { type: 'text', text: String(payload['text'] ?? '') };
      case 'thinking':
        return { type: 'thinking', text: String(payload['text'] ?? '') };
      case 'tool': {
        const subject = payload['subject'];
        return typeof subject === 'string' && subject
          ? { type: 'tool', name: String(payload['name'] ?? ''), subject }
          : { type: 'tool', name: String(payload['name'] ?? '') };
      }
      case 'status':
        return { type: 'status', message: String(payload['message'] ?? '') };
      case 'usage':
        return {
          type: 'usage',
          inputTokens: Number(payload['inputTokens'] ?? 0),
          outputTokens: Number(payload['outputTokens'] ?? 0)
        };
      case 'refusal':
        return { type: 'refusal' };
      case 'quota':
        return { type: 'quota', message: String(payload['message'] ?? '') };
      case 'error':
        return { type: 'error', message: String(payload['message'] ?? '') };
      case 'done':
        return { type: 'done' };
      default:
        return null;
    }
  }
}
