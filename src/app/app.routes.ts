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

  // Yeni şirket kayıt sihirbazı (korumasız — henüz hesap yokken kullanılır)
  {
    path: 'register-company',
    loadComponent: () =>
      import('./components/register-company/register-company.component').then(m => m.RegisterCompanyComponent)
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
      // "new" sabit segmenti ":typeName" param'ından önce gelmeli — aksi halde Angular "new" stringini tip adı olarak yakalar
      {
        path: 'build/new',
        canActivate: [adminGuard],
        data: { mode: 'new' },
        loadComponent: () =>
          import('./components/table-detail/table-detail.component').then(m => m.TableDetailComponent)
      },
      // ":typeName" mevcut bir modeli/taslağı düzenleme modunda açar
      {
        path: 'build/:typeName',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/table-detail/table-detail.component').then(m => m.TableDetailComponent)
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
      // Şirket içi kullanıcı yönetimi — kullanıcı yalnızca buradan eklenir
      {
        path: 'users',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/user-list/user-list.component').then(m => m.UserListComponent)
      },
      // "new" sabit segmenti ":id" param'ından önce gelmeli
      {
        path: 'users/new',
        canActivate: [adminGuard],
        data: { mode: 'new' },
        loadComponent: () =>
          import('./components/user-detail/user-detail.component').then(m => m.UserDetailComponent)
      },
      {
        path: 'users/:id',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/user-detail/user-detail.component').then(m => m.UserDetailComponent)
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
        path: 'audit-logs',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/audit-log/audit-log.component').then(m => m.AuditLogComponent)
      },
      {
        // G3: Tenant parametreleri — yedekleme zamanlaması, sistem e-postası, abonelik
        path: 'parameters',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/parameters/parameters.component').then(m => m.ParametersComponent)
      },
      {
        // G4: Yapay Zeka asistanı — model/rapor/dashboard önerir, kullanıcı onayıyla aktarır.
        // adminGuard: ürettiği modelleri yayınlamak zaten admin işi (/build ile aynı seviye).
        path: 'ai',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/ai-chat/ai-chat.component').then(m => m.AiChatComponent)
      },
      {
        // Kullanıcının kendi profil sayfası — authGuard layout'tan miras alınır
        path: 'profile',
        loadComponent: () =>
          import('./components/user-profile/user-profile.component').then(m => m.UserProfileComponent)
      },

      // H: Görevlerim — adminGuard YOK. Yetkilendirme atamayla yapılır (görevi
      // yalnızca atanan kullanıcı ya da atanan rolün üyesi kapatabilir, kontrol
      // backend'de). Bu ekran aynı zamanda görev gelen kutusudur.
      {
        path: 'tasks',
        loadComponent: () =>
          import('./components/my-tasks/my-tasks.component').then(m => m.MyTasksComponent)
      },
      {
        path: 'tasks/:id',
        loadComponent: () =>
          import('./components/task-detail/task-detail.component').then(m => m.TaskDetailComponent)
      },

      // H: İş akışı tasarımı — tamamı adminGuard (projede adlandırılmış yetki yok,
      // tasarım/yayın /build ve /ai gibi admin'e bağlı).
      {
        path: 'workflows',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/workflow-list/workflow-list.component').then(m => m.WorkflowListComponent)
      },
      // "new" ve "deleted" sabit segmentleri ":id" param'ından ÖNCE gelmeli —
      // aksi halde Angular bu string'leri ID olarak yakalar.
      {
        path: 'workflows/new',
        canActivate: [adminGuard],
        data: { mode: 'new' },
        loadComponent: () =>
          import('./components/workflow-build/workflow-build.component').then(m => m.WorkflowBuildComponent)
      },
      {
        path: 'workflows/deleted',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/deleted-workflows/deleted-workflows.component').then(m => m.DeletedWorkflowsComponent)
      },
      // "instances" ve "versions" da sabit segment — ":id"'den ÖNCE gelmeli.
      {
        path: 'workflows/instances/:id',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/workflow-instance/workflow-instance.component').then(m => m.WorkflowInstanceComponent)
      },
      {
        path: 'workflows/versions/:code',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/workflow-versions/workflow-versions.component').then(m => m.WorkflowVersionsComponent)
      },
      {
        path: 'workflows/:id/edit',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/workflow-build/workflow-build.component').then(m => m.WorkflowBuildComponent)
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
