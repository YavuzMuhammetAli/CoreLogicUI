import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

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
        path: 'models/:typeName/:id',
        loadComponent: () =>
          import('./components/model-detail/model-detail.component').then(m => m.ModelDetailComponent)
      },
      {
        path: 'build',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/form-build/form-build.component').then(m => m.FormBuildComponent)
      },
      {
        path: 'drafts',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/draft-models/draft-models.component').then(m => m.DraftModelsComponent)
      },
      {
        path: 'database',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/database-proccess/database-proccess.component').then(m => m.DatabaseProccessComponent)
      },
      {
        path: 'permissions',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/user-permissions/user-permissions.component').then(m => m.UserPermissionsComponent)
      }
    ]
  },

  // Bilinmeyen yollar login'e yönlendirsin
  { path: '**', redirectTo: 'login' }
];
