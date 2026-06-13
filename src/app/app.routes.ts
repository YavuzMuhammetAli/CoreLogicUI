import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  // Giriş ekranı (korumasız)
  {
    path: 'login',
    loadComponent: () =>
      import('./components/login/login.component').then(m => m.LoginComponent)
  },

  // Korumalı sayfa grubu — app shell içinde
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/layout/layout.component').then(m => m.LayoutComponent),
    children: [
      { path: '', redirectTo: 'models', pathMatch: 'full' },
      {
        path: 'models',
        loadComponent: () =>
          import('./components/model-list/model-list.component').then(m => m.ModelListComponent)
      },
      {
        path: 'models/:typeName',
        loadComponent: () =>
          import('./components/model-data/model-data.component').then(m => m.ModelDataComponent)
      },
      {
        path: 'build',
        loadComponent: () =>
          import('./components/form-build/form-build.component').then(m => m.FormBuildComponent)
      }
    ]
  },

  // Bilinmeyen yollar login'e yönlendirsin
  { path: '**', redirectTo: 'login' }
];
