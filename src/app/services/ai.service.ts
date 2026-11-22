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
 * AI module (G4) — chat, proposal state and quota.
 *
 * The tenant is NOT sent by the client: every endpoint runs in the ambient tenant
 * of the calling admin's JWT.
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

  // ── Proposal state ───────────────────────────────────────────────────────

  /** Writes the import/publish result back to the backend. */
  updateProposalStatus(id: number, body: AiProposalStatusUpdate): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/proposals/${id}/status`, body);
  }

  // ── Chat stream (SSE) ────────────────────────────────────────────────────

  /**
   * Streams the response as Server-Sent Events.
   *
   * `fetch` is used instead of HttpClient: `EventSource` cannot POST or add
   * headers, and HttpClient does not stream the response (it waits for completion). The
   * cost is that the request BYPASSES the interceptor chain — so the
   * Authorization and Accept-Language headers are added here by hand
   * (same keys as auth.interceptor.ts / language.interceptor.ts).
   *
   * When the subscription is torn down the request is aborted (AbortController), so
   * the server-side stream also closes when the user leaves the page.
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
            // A quota/validation error returns before the stream starts: the body is a plain
            // ResponseModel, not SSE.
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

            // SSE frames are separated by a blank line. The last chunk may be
            // incomplete, so it is put back into the buffer.
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';

            for (const frame of frames) {
              const parsed = this.parseFrame(frame);
              if (parsed) subscriber.next(parsed);
            }
          }

          subscriber.complete();
        } catch (error) {
          // Abort means the subscription was torn down — not an error.
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
      headers['Accept-Language'] = localStorage.getItem('lang') === 'en' ? 'en' : 'tr';
    }

    return headers;
  }

  /** Extracts the user-facing message from an error body returned before the stream starts. */
  private async readErrorMessage(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as ResponseModel;
      return body?.message || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }

  /** Turns a single SSE frame (`event: X` + `data: {...}`) into an event. */
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
