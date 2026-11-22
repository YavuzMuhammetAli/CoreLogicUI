import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { modelPermissionGuard } from './guards/model-permission.guard';
import { unsavedChangesGuard } from './guards/unsaved-changes.guard';

export const routes: Routes = [
  // Login screen (unprotected)
  {
    path: 'login',
    loadComponent: () =>
      import('./components/login/login.component').then(m => m.LoginComponent)
  },

  // New company sign-up wizard (unprotected — used while there is no account yet)
  {
    path: 'register-company',
    loadComponent: () =>
      import('./components/register-company/register-company.component').then(m => m.RegisterCompanyComponent)
  },

  // Protected page group — inside the app shell
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
      // The fixed "deleted" segment must come before the ":typeName" param — otherwise the "deleted" string is captured as a type name
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
      // The fixed "new" segment must come before the ":id" param — otherwise Angular captures the "new" string as an ID
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
      // The fixed "new" segment must come before the ":typeName" param — otherwise Angular captures the "new" string as a type name
      {
        path: 'build/new',
        canActivate: [adminGuard],
        data: { mode: 'new' },
        loadComponent: () =>
          import('./components/table-detail/table-detail.component').then(m => m.TableDetailComponent)
      },
      // Screen design: form and list layout of a published model (?view=list → list)
      {
        path: 'build/:typeName/screen',
        canActivate: [adminGuard],
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./components/screen-designer/screen-designer.component').then(m => m.ScreenDesignerComponent)
      },
      // ":typeName" opens an existing model/draft in edit mode
      {
        path: 'build/:typeName',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/table-detail/table-detail.component').then(m => m.TableDetailComponent)
      },
      // Design: entry to model screen designs + navigation (sidebar) designs (?tab=nav)
      {
        path: 'design',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/design-hub/design-hub.component').then(m => m.DesignHubComponent)
      },
      {
        path: 'design/navigation/:id',
        canActivate: [adminGuard],
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./components/nav-designer/nav-designer.component').then(m => m.NavDesignerComponent)
      },
      {
        path: 'drafts',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/draft-models/draft-models.component').then(m => m.DraftModelsComponent)
      },
      // List of drafts that were never published and were deactivated (deleted) + restore
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
          import('./components/database-process/database-process.component').then(m => m.DatabaseProcessComponent)
      },
      // In-company user management — users are added only from here
      {
        path: 'users',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/user-list/user-list.component').then(m => m.UserListComponent)
      },
      // The fixed "new" segment must come before the ":id" param
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
      // The fixed "new" segment must come before the ":id" param — otherwise the "new" string is captured as an ID
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
        // G3: Tenant parameters — backup schedule, system email, subscription
        path: 'parameters',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/parameters/parameters.component').then(m => m.ParametersComponent)
      },
      {
        // G4: AI assistant — proposes models/reports/dashboards, imports them with the user's approval.
        // adminGuard: publishing the models it produces is admin work anyway (same level as /build).
        path: 'ai',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/ai-chat/ai-chat.component').then(m => m.AiChatComponent)
      },
      {
        // The user's own profile page — authGuard is inherited from the layout
        path: 'profile',
        loadComponent: () =>
          import('./components/user-profile/user-profile.component').then(m => m.UserProfileComponent)
      },

      // H: My tasks — NO adminGuard. Authorization comes from the assignment (only the assigned
      // user or a member of the assigned role can close the task, checked
      // on the backend). This screen is also the task inbox.
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

      // H: Workflow design — all adminGuard (the project has no named permissions;
      // design/publish is tied to admin, like /build and /ai).
      {
        path: 'workflows',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/workflow-list/workflow-list.component').then(m => m.WorkflowListComponent)
      },
      // The fixed "new" and "deleted" segments must come BEFORE the ":id" param —
      // otherwise Angular captures these strings as an ID.
      {
        path: 'workflows/new',
        canActivate: [adminGuard],
        canDeactivate: [unsavedChangesGuard],
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
      // "instances" and "versions" are fixed segments too — they must come BEFORE ":id".
      // Instance detail has no adminGuard: the starter, the assignee and whoever can read the record
      // also see it (the record's Süreç (Instance) panel and task detail link here). Permission
      // is granted on the backend by IWorkflowAccessPolicy; admin actions are hidden on the screen
      // with isAdmin.
      {
        // Instance list (admin) — fixed segment BEFORE ":id".
        path: 'workflows/instances',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/workflow-instances/workflow-instances.component').then(m => m.WorkflowInstancesComponent)
      },
      {
        path: 'workflows/instances/:id',
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
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./components/workflow-build/workflow-build.component').then(m => m.WorkflowBuildComponent)
      },

      // Metadata-driven reporting — the permission check is on the backend (Read on the model);
      // authGuard is enough, no adminGuard needed.
      {
        path: 'reports',
        loadComponent: () =>
          import('./components/report-list/report-list.component').then(m => m.ReportListComponent)
      },
      // The fixed "new" segment must come before the ":id" param — otherwise the "new" string is captured as an ID
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
      // The fixed "deleted" segment must come before the ":id" param — otherwise the "deleted" string is captured as an ID
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

      // Dashboard — combines several reports as widgets.
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./components/dashboard-list/dashboard-list.component').then(m => m.DashboardListComponent)
      },
      // The fixed "new" segment must come before the ":id" param — otherwise the "new" string is captured as an ID
      {
        path: 'dashboard/new',
        loadComponent: () =>
          import('./components/dashboard-build/dashboard-build.component').then(m => m.DashboardBuildComponent)
      },
      // The fixed "deleted" segment must come before the ":id" param — otherwise the "deleted" string is captured as an ID
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

  // Unknown paths redirect to login
  { path: '**', redirectTo: 'login' }
];
