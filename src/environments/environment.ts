export const environment = {
  production: false,
  // Üretimle aynı yol: oturum çerezi Path=/api ve SameSite=Strict, ayrı origin'de çalışmaz.
  // ng serve bunu proxy.conf.json ile backend'e iletir.
  apiBaseUrl: '/api'
};
