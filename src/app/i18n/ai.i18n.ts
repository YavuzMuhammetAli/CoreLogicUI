import { Translations } from './translations.model';

/**
 * Yapay Zeka asistanı (G4) — sohbet ekranı, öneri kartları ve aktarma akışı.
 */
export const AI_I18N: Translations = {
  // ── Sayfa kabuğu ─────────────────────────────────────────────────────────
  'ai.title': { tr: 'Yapay Zeka', en: 'AI Assistant' },
  'ai.quota': { tr: 'Token', en: 'Tokens' },
  'ai.quotaAria': { tr: 'Aylık token kullanımı', en: 'Monthly token usage' },
  'ai.newChat': { tr: 'Yeni Sohbet', en: 'New Chat' },
  'ai.quotaExhaustedMidStream': {
    tr: 'Yapay Zeka kotanız bu yanıt sırasında doldu; yanıt yarıda kesildi. Kota ayın başında yenilenir.',
    en: 'Your AI quota ran out during this response, so it was cut short. It resets at the start of the month.'
  },
  'ai.quotaExhausted': {
    tr: 'Bu ayki Yapay Zeka kotanız yeni bir istek için yetersiz. Kota ayın başında yenilenir.',
    en: 'Your AI quota for this month is not enough for a new request. It resets at the start of the month.'
  },
  'ai.notEntitled': {
    tr: 'Aboneliğiniz Yapay Zeka özelliğini içermiyor. Planınızı yükselterek kullanabilirsiniz.',
    en: 'Your subscription does not include the AI feature. Upgrade your plan to use it.'
  },

  // ── Sohbet listesi ───────────────────────────────────────────────────────
  'ai.conversations': { tr: 'Sohbetler', en: 'Conversations' },
  'ai.conversationsAria': { tr: 'Sohbet listesi', en: 'Conversation list' },
  'ai.noConversations': { tr: 'Henüz sohbet yok.', en: 'No conversations yet.' },
  'ai.deleteChat': { tr: 'Sohbeti sil', en: 'Delete conversation' },

  // ── Mesaj akışı ──────────────────────────────────────────────────────────
  'ai.chatAria': { tr: 'Sohbet', en: 'Chat' },
  'ai.emptyTitle': { tr: 'Ne yapmak istersiniz?', en: 'What would you like to build?' },
  'ai.emptyBody': {
    tr: 'İşinizi anlatın; size uygun modelleri, raporları ve dashboard\'ları önereyim.',
    en: 'Describe your business and I will propose models, reports and dashboards for it.'
  },
  'ai.you': { tr: 'Siz', en: 'You' },
  'ai.assistant': { tr: 'Asistan', en: 'Assistant' },
  'ai.thinking': { tr: 'Düşünüyor', en: 'Thinking' },
  'ai.working': { tr: 'Çalışıyor…', en: 'Working…' },
  'ai.inputLabel': { tr: 'Mesajınız', en: 'Your message' },
  'ai.placeholder': {
    tr: 'Örn: Müşterilerimi ve siparişlerini takip etmek, aylık ciroyu grafikte görmek istiyorum.',
    en: 'e.g. I want to track customers and their orders, and see monthly revenue on a chart.'
  },
  'ai.send': { tr: 'Gönder', en: 'Send' },

  // ── Öneriler ─────────────────────────────────────────────────────────────
  'ai.proposals': { tr: 'Öneriler', en: 'Proposals' },
  'ai.proposalsAria': { tr: 'Yapay zeka önerileri', en: 'AI proposals' },
  'ai.noProposals': {
    tr: 'Henüz öneri yok. İsteğinizi yazın.',
    en: 'No proposals yet. Describe what you need.'
  },
  'ai.import': { tr: 'İçeri Aktar', en: 'Import' },
  'ai.publishAll': { tr: 'Hepsini Yayınla', en: 'Publish All' },

  'ai.kind.model': { tr: 'Model', en: 'Model' },
  'ai.kind.report': { tr: 'Rapor', en: 'Report' },
  'ai.kind.dashboard': { tr: 'Dashboard', en: 'Dashboard' },

  'ai.status.proposed': { tr: 'Önerildi', en: 'Proposed' },
  'ai.status.imported': { tr: 'Taslak', en: 'Draft' },
  'ai.status.published': { tr: 'Yayında', en: 'Published' },
  'ai.status.failed': { tr: 'Hata', en: 'Failed' },
  'ai.status.running': { tr: 'İşleniyor', en: 'Working' },

  'ai.summary.model': { tr: '{n} kolon', en: '{n} columns' },
  'ai.summary.modelWithSub': {
    tr: '{n} kolon · {s} alt model',
    en: '{n} columns · {s} sub-models'
  },
  'ai.summary.report': { tr: '{model} · {chart}', en: '{model} · {chart}' },
  'ai.summary.dashboard': { tr: '{n} widget', en: '{n} widgets' },

  // ── Onay diyalogları ─────────────────────────────────────────────────────
  'ai.publishConfirmTitle': { tr: 'Hepsini yayınla', en: 'Publish everything' },
  'ai.publishConfirmMessage': {
    tr: 'Aktarılan modeller derlenip veritabanı tabloları oluşturulacak, ardından raporlar ve dashboard\'lar tanımlanacak. Bu işlem geri alınamaz.',
    en: 'Imported models will be compiled and their database tables created, then reports and dashboards will be defined. This cannot be undone.'
  },
  'ai.deleteConfirmTitle': { tr: 'Sohbeti sil', en: 'Delete conversation' },
  'ai.deleteConfirmMessage': {
    tr: 'Sohbet ve içindeki öneriler silinecek. Aktarılmış modeller etkilenmez.',
    en: 'The conversation and its proposals will be deleted. Already imported models are not affected.'
  },

  // ── Hatalar ──────────────────────────────────────────────────────────────
  'ai.loadFailed': { tr: 'Sohbet yüklenemedi.', en: 'Could not load the conversation.' },
  'ai.deleteFailed': { tr: 'Sohbet silinemedi.', en: 'Could not delete the conversation.' },
  'ai.streamFailed': { tr: 'Yanıt alınamadı.', en: 'Could not get a response.' },
  'ai.importFailed': { tr: 'İçeri aktarma tamamlanamadı.', en: 'The import could not be completed.' },
  'ai.publishFailed': { tr: 'Yayınlama tamamlanamadı.', en: 'Publishing could not be completed.' },
  'ai.refused': {
    tr: 'Bu istek güvenlik denetimine takıldı. Talebinizi farklı ifade etmeyi deneyin.',
    en: 'This request was blocked by a safety check. Try rephrasing your request.'
  }
};
