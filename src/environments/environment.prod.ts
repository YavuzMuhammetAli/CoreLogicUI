export const environment = {
  production: true,
  // Relative: the UI and the API are served from the same origin, nginx strips the /api prefix and forwards
  // to the backend (backend repo deploy/nginx/corelogic.conf). Local `ng serve` uses environment.ts.
  apiBaseUrl: '/api'
};
