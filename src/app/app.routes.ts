import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { modelPermissionGuard } from './guards/model-permission.guard';

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
      // "deleted" sabit segmenti ":typeName" param'ından önce gelmeli — aksi halde "deleted" stringi tip adı olarak yakalanır
      {
        path: 'models/deleted',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/deleted-models/deleted-models.component').then(m => m.DeletedModelsComponent)
      },
      {
        path: 'models/:typeName',
        canActivate: [modelPermissionGuard('read')],
        loadComponent: () =>
          import('./components/model-data/model-data.component').then(m => m.ModelDataComponent)
      },
      // "new" sabit segmenti ":id" param'ından önce gelmeli — aksi halde Angular "new" stringini ID olarak yakalar
      {
        path: 'models/:typeName/new',
        canActivate: [modelPermissionGuard('create')],
        data: { mode: 'new' },
        loadComponent: () =>
          import('./components/model-detail/model-detail.component').then(m => m.ModelDetailComponent)
      },
      {
        path: 'models/:typeName/:id',
        canActivate: [modelPermissionGuard('read')],
        loadComponent: () =>
          import('./components/model-detail/model-detail.component').then(m => m.ModelDetailComponent)
      },
      {
        path: 'build',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/form-build/form-build.component').then(m => m.FormBuildComponent)
      },
      // ":typeName" mevcut bir modeli/taslağı düzenleme modunda açar (form-build aynı component'i kullanır)
      {
        path: 'build/:typeName',
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
      // Hiç yayınlanmamış olup pasiflenmiş (silinmiş) taslakların listesi + geri yükleme
      {
        path: 'drafts/deleted',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/deleted-drafts/deleted-drafts.component').then(m => m.DeletedDraftsComponent)
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
          import('./components/user-permission-list/user-permission-list.component').then(m => m.UserPermissionListComponent)
      },
      {
        path: 'permissions/:id',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/user-permission-detail/user-permission-detail.component').then(m => m.UserPermissionDetailComponent)
      },
      {
        path: 'roles',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/role-list/role-list.component').then(m => m.RoleListComponent)
      },
      // "new" sabit segmenti ":id" param'ından önce gelmeli — aksi halde "new" stringi ID olarak yakalanır
      {
        path: 'roles/new',
        canActivate: [adminGuard],
        data: { mode: 'new' },
        loadComponent: () =>
          import('./components/role-detail/role-detail.component').then(m => m.RoleDetailComponent)
      },
      {
        path: 'roles/:id',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/role-detail/role-detail.component').then(m => m.RoleDetailComponent)
      },
      {
        // Kullanıcının kendi profil sayfası — authGuard layout'tan miras alınır
        path: 'profile',
        loadComponent: () =>
          import('./components/user-profile/user-profile.component').then(m => m.UserProfileComponent)
      },

      // Metadata-driven raporlama — yetki kontrolü backend'de (model üzerinde Read);
      // authGuard yeterli, ayrıca adminGuard gerekmiyor.
      {
        path: 'reports',
        loadComponent: () =>
          import('./components/report-list/report-list.component').then(m => m.ReportListComponent)
      },
      // "new" sabit segmenti ":id" param'ından önce gelmeli — aksi halde "new" stringi ID olarak yakalanır
      {
        path: 'reports/new',
        loadComponent: () =>
          import('./components/report-build/report-build.component').then(m => m.ReportBuildComponent)
      },
      {
        path: 'reports/:id/edit',
        loadComponent: () =>
          import('./components/report-build/report-build.component').then(m => m.ReportBuildComponent)
      },
      // "deleted" sabit segmenti ":id" param'ından önce gelmeli — aksi halde "deleted" stringi ID olarak yakalanır
      {
        path: 'reports/deleted',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/deleted-reports/deleted-reports.component').then(m => m.DeletedReportsComponent)
      },
      {
        path: 'reports/:id',
        loadComponent: () =>
          import('./components/report-viewer/report-viewer.component').then(m => m.ReportViewerComponent)
      },

      // Dashboard — birden çok raporu widget olarak bir araya getirir.
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./components/dashboard-list/dashboard-list.component').then(m => m.DashboardListComponent)
      },
      // "new" sabit segmenti ":id" param'ından önce gelmeli — aksi halde "new" stringi ID olarak yakalanır
      {
        path: 'dashboard/new',
        loadComponent: () =>
          import('./components/dashboard-build/dashboard-build.component').then(m => m.DashboardBuildComponent)
      },
      // "deleted" sabit segmenti ":id" param'ından önce gelmeli — aksi halde "deleted" stringi ID olarak yakalanır
      {
        path: 'dashboard/deleted',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/deleted-dashboards/deleted-dashboards.component').then(m => m.DeletedDashboardsComponent)
      },
      {
        path: 'dashboard/:id',
        loadComponent: () =>
          import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent)
      }
    ]
  },

  // Bilinmeyen yollar login'e yönlendirsin
  { path: '**', redirectTo: 'login' }
];
