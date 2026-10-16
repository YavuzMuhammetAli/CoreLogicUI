export const environment = {
  production: true,
  // Göreli: arayüz ve API aynı origin'den sunulur, nginx /api önekini soyup backend'e
  // iletir (backend reposu deploy/nginx/corelogic.conf). Yerel `ng serve` environment.ts'i kullanır.
  apiBaseUrl: '/api'
};
