import { NavLayout } from './nav-layout.model';
import { NavResolveContext, ResolvedNavFolder, ResolvedNavLink, UNPLACED_FOLDER_ID, resolveNav } from './nav-layout.resolve';
import { seedNavLayout } from './nav-layout.seed';
import { validateNavLayout } from './nav-layout.validate';

const ctx: NavResolveContext = {
  models: [
    { typeName: 'Personel', label: 'Personel Kartı', icon: 'badge' },
    { typeName: 'Izin', label: null, icon: null },
    { typeName: 'Arac', label: 'Araç' }
  ],
  pageLabel: page => `#${page}`,
  otherModelsLabel: 'Diğer modeller'
};

describe('nav-layout.resolve', () => {
  it('bağlantıları rota, etiket ve ikona çevirir', () => {
    const doc: NavLayout = {
      schemaVersion: 1, appendUnplaced: false, items: [
        { kind: 'page', id: 'p1', page: 'tasks' },
        { kind: 'page', id: 'p2', page: 'dashboards', label: 'Panolar' },
        { kind: 'model', id: 'm1', typeName: 'Personel' },
        { kind: 'model', id: 'm2', typeName: 'Izin', label: 'İzinler' },
        { kind: 'dashboard', id: 'd1', dashboardId: 4, label: 'Satış' },
        { kind: 'report', id: 'r1', reportId: 9, label: 'Aylık' },
        { kind: 'url', id: 'u1', url: 'https://destek.ornek.com', label: 'Destek' }
      ]
    };
    const [tasks, dashboards, personel, izin, dash, report, url] = resolveNav(doc, ctx) as ResolvedNavLink[];
    expect(tasks).toEqual(jasmine.objectContaining({ label: '#tasks', route: ['/tasks'], isTasks: true }));
    expect(dashboards).toEqual(jasmine.objectContaining({ label: 'Panolar', route: ['/dashboard'], exact: true }));
    expect(personel).toEqual(jasmine.objectContaining({ label: 'Personel Kartı', route: ['/models', 'Personel'], icon: { kind: 'model', name: 'badge' } }));
    expect(izin.label).toBe('İzinler');
    expect(dash.route).toEqual(['/dashboard', 4]);
    expect(report.route).toEqual(['/reports', 9]);
    expect(url).toEqual(jasmine.objectContaining({ route: null, href: 'https://destek.ornek.com', icon: { kind: 'app', name: 'open_in_new' } }));
  });

  it('görünmeyen modeli atar, boş klasörü gizler', () => {
    const doc: NavLayout = {
      schemaVersion: 1, appendUnplaced: false, items: [
        { kind: 'folder', id: 'f1', label: 'Gizli', children: [{ kind: 'model', id: 'm1', typeName: 'Maas' }] },
        { kind: 'folder', id: 'f2', label: 'İK', icon: 'badge', collapsed: true, children: [
          { kind: 'model', id: 'm2', typeName: 'Maas' },
          { kind: 'model', id: 'm3', typeName: 'Personel' }
        ] }
      ]
    };
    const out = resolveNav(doc, ctx);
    expect(out.length).toBe(1);
    const folder = out[0] as ResolvedNavFolder;
    expect(folder).toEqual(jasmine.objectContaining({ id: 'f2', icon: 'badge', collapsed: true }));
    expect(folder.children.map(c => c.id)).toEqual(['m3']);
  });

  it('yerleştirilmemiş modeller sona "Diğer modeller" klasöründe', () => {
    const doc: NavLayout = {
      schemaVersion: 1, appendUnplaced: true, items: [
        { kind: 'folder', id: 'f1', label: 'İK', children: [{ kind: 'model', id: 'm1', typeName: 'Personel' }] }
      ]
    };
    const out = resolveNav(doc, ctx);
    const other = out[1] as ResolvedNavFolder;
    expect(other.id).toBe(UNPLACED_FOLDER_ID);
    expect(other.label).toBe('Diğer modeller');
    expect(other.children.map(c => c.label)).toEqual(['Izin', 'Araç']);
  });

  it('hepsi yerleşmişse "Diğer" klasörü çıkmaz', () => {
    const doc = seedNavLayout({ models: ctx.models, navDashboards: [] });
    expect(resolveNav(doc, ctx).some(n => n.id === UNPLACED_FOLDER_ID)).toBeFalse();
  });
});

describe('nav-layout.seed', () => {
  it('bugünkü menüyü geçerli bir belgeye çevirir', () => {
    const doc = seedNavLayout({
      models: [{ typeName: 'Personel' }, { typeName: 'Izin' }],
      navDashboards: [{ id: 3, name: 'Yönetim Paneli' }]
    });
    expect(doc.items.map(n => n.kind)).toEqual(['page', 'model', 'model', 'page', 'page', 'dashboard']);
    expect(validateNavLayout(doc, null, 'publish')).toEqual([]);
  });

  it('uzun dashboard adı etiket sınırına kırpılır', () => {
    const doc = seedNavLayout({ models: [], navDashboards: [{ id: 1, name: 'x'.repeat(80) }] });
    expect(validateNavLayout(doc, null, 'publish')).toEqual([]);
  });
});
