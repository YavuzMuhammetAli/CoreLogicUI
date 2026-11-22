export const environment = {
  production: false,
  // Same path as production: the session cookie is Path=/api and SameSite=Strict, it does not work on a separate origin.
  // ng serve forwards this to the backend via proxy.conf.json.
  apiBaseUrl: '/api'
};
