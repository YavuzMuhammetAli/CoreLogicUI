import { Translations } from './translations.model';

/**
 * İş akışı modülü çevirileri.
 *
 * Kapsanan bileşenler:
 *   components/workflow-list      → workflow.list.*
 *   components/workflow-build     → workflow.build.*
 *   components/my-tasks           → task.list.*
 *   components/task-detail        → task.detail.*
 *   shared/task-decision-form     → task.detail.* (karar formu, görev + kayıt detayı)
 *   model-detail (form tabanlı)   → workflow.record.* (başlat / adım butonları, kilit)
 *   shared/task-action-dialog     → task.detail.* + workflow.record.*
 *   ortak sözlükler               → workflow.status.*, workflow.trigger.*,
 *                                   workflow.assign.*, workflow.timeout.*,
 *                                   workflow.event.*
 *   silinenler ekranı             → deleted.workflows.*
 */
export const WORKFLOW_I18N: Translations = {
  // ── workflow-list ─────────────────────────────────────────────────────────
  'workflow.list.title': { tr: 'İş Akışları', en: 'Workflows' },
  'workflow.list.new': { tr: 'Yeni Akış', en: 'New Workflow' },
  'workflow.list.deleted': { tr: 'Silinenler', en: 'Deleted' },
  'workflow.list.colName': { tr: 'Ad', en: 'Name' },
  'workflow.list.colCode': { tr: 'Kod', en: 'Code' },
  'workflow.list.colModel': { tr: 'Model', en: 'Model' },
  'workflow.list.colTrigger': { tr: 'Tetikleyici', en: 'Trigger' },
  'workflow.list.colStatus': { tr: 'Durum', en: 'Status' },
  'workflow.list.colVersion': { tr: 'Sürüm', en: 'Version' },
  'workflow.list.colRunning': { tr: 'Çalışan', en: 'Running' },
  'workflow.list.emptyTitle': { tr: 'Henüz iş akışı tanımlanmadı', en: 'No workflows defined yet' },
  'workflow.list.emptyHint': {
    tr: 'Bir modeli onay sürecine bağlamak için yeni bir akış oluşturun.',
    en: 'Create a workflow to attach an approval process to a model.'
  },
  'workflow.list.loadFailed': { tr: 'İş akışları yüklenemedi.', en: 'Workflows could not be loaded.' },
  'workflow.list.serverError': { tr: 'Sunucuya ulaşılamadı.', en: 'Could not reach the server.' },
  'workflow.list.publish': { tr: 'Yayınla', en: 'Publish' },
  'workflow.list.publishSuccess': { tr: 'Akış yayınlandı.', en: 'Workflow published.' },
  'workflow.list.deleteConfirmTitle': { tr: 'Akışı sil', en: 'Delete workflow' },
  'workflow.list.deleteConfirm': {
    tr: '{name} akışı pasife alınacak. Çalışan süreçler kendi sürümleriyle devam eder.',
    en: 'The workflow {name} will be deactivated. Running processes continue on their own versions.'
  },
  'workflow.list.disabledBadge': { tr: 'Kapalı', en: 'Disabled' },
  'workflow.list.newVersion': { tr: 'Yeni Sürüm', en: 'New Version' },
  'workflow.list.draftVersion': { tr: 'v{n} taslak', en: 'v{n} draft' },

  // ── workflow-build ────────────────────────────────────────────────────────
  'workflow.build.titleNew': { tr: 'Yeni İş Akışı', en: 'New Workflow' },
  'workflow.build.titleEdit': { tr: 'Akışı Düzenle', en: 'Edit Workflow' },
  'workflow.build.titleView': { tr: 'Akışı Görüntüle', en: 'View Workflow' },
  'workflow.build.newVersion': { tr: 'Yeni Sürüm Oluştur', en: 'Create New Version' },
  'workflow.build.draftOfVersion': { tr: 'v{n} taslağı', en: 'v{n} draft' },
  'workflow.build.publishedReadonlyHint': {
    tr: 'Bu sürüm (v{n}) yayınlandı ve değiştirilemez. Düzenlemek için yeni sürüm oluşturun; yayınladığınızda sonraki sürüm olur, çalışan süreçler kendi sürümleriyle devam eder.',
    en: 'This version (v{n}) is published and cannot be changed. Create a new version to edit it; once published it becomes the next version, and running processes continue on their own versions.'
  },
  'workflow.build.stepDialogNew': { tr: 'Yeni Adım', en: 'New Step' },
  'workflow.build.stepDialogEdit': { tr: 'Adımı Düzenle', en: 'Edit Step' },
  'workflow.build.stepDialogView': { tr: 'Adım Ayrıntısı', en: 'Step Details' },
  'workflow.build.sectionGeneral': { tr: 'Genel', en: 'General' },
  'workflow.build.sectionTransitions': { tr: 'Geçişler', en: 'Transitions' },
  'workflow.build.sectionSla': { tr: 'Süre (SLA)', en: 'Deadline (SLA)' },
  'workflow.build.stepKeyHelp': {
    tr: 'Harfle başlamalı; harf, rakam ve alt çizgi içerebilir.',
    en: 'Must start with a letter; may contain letters, digits and underscores.'
  },
  'workflow.build.stepKeyDuplicate': {
    tr: 'Bu anahtar başka bir adımda kullanılıyor.',
    en: 'This key is already used by another step.'
  },
  'workflow.build.noFields': {
    tr: 'Bu adımda onaycıdan ek bilgi istenmiyor.',
    en: 'This step does not ask the approver for extra input.'
  },
  'workflow.build.stepsHint': {
    tr: 'Düzenlemek için bir adıma tıklayın.',
    en: 'Click a step to edit it.'
  },
  'workflow.build.stepInvalid': {
    tr: 'Kırmızı işaretli alanları doldurun.',
    en: 'Fill in the fields marked in red.'
  },
  'workflow.build.stepsHintReadonly': {
    tr: 'Ayrıntılarını görmek için bir adıma tıklayın.',
    en: 'Click a step to see its details.'
  },
  'workflow.build.colAssignment': { tr: 'Atanan', en: 'Assignee' },
  'workflow.build.branchCount': { tr: '{n} dal', en: '{n} branches' },
  'workflow.build.startBadge': { tr: 'Başlangıç', en: 'Start' },
  'workflow.build.tabSteps': { tr: 'Adımlar', en: 'Steps' },
  'workflow.build.tabCanvas': { tr: 'Tasarım', en: 'Design' },
  'workflow.build.tabTrigger': { tr: 'Tetikleyici', en: 'Trigger' },
  'workflow.canvas.hint': {
    tr: 'Paletten adım sürükleyin · Alttaki noktadan hedefe sürükleyerek bağlayın · Boş çıkıştaki + bağlı adım ekler · Çift tık: tüm ayarlar.',
    en: 'Drag steps from the palette · Drag from a bottom dot onto a step to connect · The + on a free exit adds a connected step · Double-click: all settings.'
  },
  'workflow.canvas.shortcutsLabel': { tr: 'Kısayollar', en: 'Shortcuts' },
  'workflow.canvas.shortcuts': {
    tr: 'Tıkla: seç · Shift/Ctrl + tıkla: seçime ekle · Shift + sürükle: çerçeveyle seç · Sürükle: taşı (Alt: ızgarasız) · Oklar: it (Shift: ızgara adımı) · Delete: sil · Ctrl+Z / Ctrl+Y: geri al / yinele · Ctrl+C / V / D: kopyala / yapıştır / çoğalt · Ctrl+A: tümünü seç · Enter: ayarlar · F: sığdır · + / −: yakınlaştır · Sağ tık: menü · Ctrl + tekerlek: yakınlaştır, tekerlek: kaydır.',
    en: 'Click: select · Shift/Ctrl + click: add to selection · Shift + drag: box select · Drag: move (Alt: no grid) · Arrows: nudge (Shift: grid step) · Delete: remove · Ctrl+Z / Ctrl+Y: undo / redo · Ctrl+C / V / D: copy / paste / duplicate · Ctrl+A: select all · Enter: settings · F: fit · + / −: zoom · Right-click: menu · Ctrl + wheel: zoom, wheel: scroll.'
  },
  'workflow.canvas.start': { tr: 'Başlangıç', en: 'Start' },
  'workflow.canvas.empty': {
    tr: 'Henüz adım yok. Soldaki paletten bir adımı buraya sürükleyin ya da tıklayın.',
    en: 'No steps yet. Drag a step here from the palette on the left, or click it.'
  },

  // ── Doğrulama sorunları (workflow.issue.{kod} = backend WorkflowValidator kodları) ──
  'workflow.issues.title': { tr: 'Sorunlar', en: 'Issues' },
  'workflow.issues.none': { tr: 'Sorun yok — akış yayınlanabilir.', en: 'No issues — the workflow can be published.' },
  'workflow.issues.errors': { tr: '{n} hata', en: '{n} error(s)' },
  'workflow.issues.warnings': { tr: '{n} uyarı', en: '{n} warning(s)' },
  'workflow.issues.validating': { tr: 'Denetleniyor…', en: 'Checking…' },
  'workflow.issues.error': { tr: 'Hata', en: 'Error' },
  'workflow.issues.warning': { tr: 'Uyarı', en: 'Warning' },
  'workflow.issues.more': { tr: '(+{n} sorun daha)', en: '(+{n} more)' },
  'workflow.issues.rowBadge': { tr: '{n} sorun', en: '{n} issue(s)' },
  'workflow.issues.publishBlocked': {
    tr: 'Taslak hatalarıyla da kaydedilir; yayınlamak için hataları giderin. Uyarılar yayını engellemez.',
    en: 'The draft is saved even with errors; fix them to publish. Warnings do not block publishing.'
  },
  'workflow.issues.chipNone': { tr: '✓ Sorun yok', en: '✓ No issues' },
  'workflow.issues.chipErrors': { tr: '! {n} hata', en: '! {n} error(s)' },
  'workflow.issues.chipWarnings': { tr: '{n} uyarı', en: '{n} warning(s)' },
  'workflow.issue.definition.invalidJson': {
    tr: 'Akış tanımı okunamadı (bozuk veri).',
    en: 'The workflow definition could not be read (corrupt data).'
  },
  'workflow.issue.steps.empty': {
    tr: 'Akışta hiç adım yok — paletten bir adım ekleyin.',
    en: 'The workflow has no steps — add one from the palette.'
  },
  'workflow.issue.steps.tooMany': {
    tr: 'Bir akışta en fazla {max} adım olabilir.',
    en: 'A workflow can have at most {max} steps.'
  },
  'workflow.issue.step.keyEmpty': {
    tr: 'Bir adımın anahtarı boş.',
    en: 'A step has an empty key.'
  },
  'workflow.issue.step.keyInvalid': {
    tr: 'Anahtar geçersiz: "{key}". Harf ile başlamalı; yalnız İngilizce harf, rakam ve alt çizgi.',
    en: 'Invalid key "{key}". It must start with a letter; only English letters, digits and underscores.'
  },
  'workflow.issue.key.nonAscii': {
    tr: '"{key}" anahtarında Türkçe ya da İngilizce dışı harf var; veritabanında başka bir anahtarla karışabilir.',
    en: 'The key "{key}" contains non-English letters; it may be confused with another key in the database.'
  },
  'workflow.issue.step.keyDuplicate': {
    tr: '"{key}" anahtarı birden çok adımda kullanılıyor.',
    en: 'The key "{key}" is used by more than one step.'
  },
  'workflow.issue.step.nameEmpty': {
    tr: 'Adımın adı boş.',
    en: 'The step has no name.'
  },
  'workflow.issue.step.typeUnsupported': {
    tr: 'Adım türü desteklenmiyor: "{type}".',
    en: 'Unsupported step type: "{type}".'
  },
  'workflow.issue.step.rejectTargetWhileDisabled': {
    tr: 'Reddetme kapalı ama red hedefi tanımlı; hedefi kaldırın ya da reddetmeyi açın.',
    en: 'Rejection is off but a reject target is set; remove the target or allow rejection.'
  },
  'workflow.issue.step.branchesNotAllowed': {
    tr: 'Tekil adım dal tanımlayamaz.',
    en: 'A single step cannot have branches.'
  },
  'workflow.issue.parallel.tooFewBranches': {
    tr: 'Paralel adımda en az iki dal olmalı.',
    en: 'A parallel step needs at least two branches.'
  },
  'workflow.issue.parallel.modeInvalid': {
    tr: 'İlerleme kuralı geçersiz: "{mode}".',
    en: 'Invalid completion rule: "{mode}".'
  },
  'workflow.issue.branch.keyEmpty': {
    tr: 'Bir dalın anahtarı boş.',
    en: 'A branch has an empty key.'
  },
  'workflow.issue.branch.keyInvalid': {
    tr: 'Dal anahtarı geçersiz: "{branch}".',
    en: 'Invalid branch key: "{branch}".'
  },
  'workflow.issue.branch.keyDuplicate': {
    tr: '"{branch}" dal anahtarı yineleniyor.',
    en: 'The branch key "{branch}" is duplicated.'
  },
  'workflow.issue.branch.nameEmpty': {
    tr: 'Dalın adı boş.',
    en: 'The branch has no name.'
  },
  'workflow.issue.branch.columnShared': {
    tr: '"{column}" kolonu birden çok dalda düzenleniyor; aynı anda açık iki dal birbirinin değerini ezerdi.',
    en: 'The column "{column}" is edited in more than one branch; two open branches would overwrite each other.'
  },
  'workflow.issue.parallel.noBranchCanReject': {
    tr: 'Hiçbir dal reddedemiyor ama red hedefi tanımlı.',
    en: 'No branch can reject, yet a reject target is set.'
  },
  'workflow.issue.parallel.assignmentOnStep': {
    tr: 'Paralel adımda atama dallara verilir, adımın kendisine değil.',
    en: 'In a parallel step, assignees are set on the branches, not on the step.'
  },
  'workflow.issue.assignment.missing': {
    tr: 'Kime atanacağı seçilmemiş.',
    en: 'No assignee is selected.'
  },
  'workflow.issue.assignment.modeInvalid': {
    tr: 'Atama türü geçersiz: "{mode}".',
    en: 'Invalid assignment type: "{mode}".'
  },
  'workflow.issue.assignment.userRequired': {
    tr: 'Kullanıcı seçilmemiş.',
    en: 'No user is selected.'
  },
  'workflow.issue.assignment.roleRequired': {
    tr: 'Rol seçilmemiş.',
    en: 'No role is selected.'
  },
  'workflow.issue.sla.dueHoursInvalid': {
    tr: 'Süre sınırı sıfırdan büyük olmalı.',
    en: 'The time limit must be greater than zero.'
  },
  'workflow.issue.sla.escalateHoursInvalid': {
    tr: 'Yükseltme süresi sıfırdan büyük olmalı.',
    en: 'The escalation time must be greater than zero.'
  },
  'workflow.issue.sla.timeoutPolicyInvalid': {
    tr: 'Zaman aşımı davranışı geçersiz: "{policy}".',
    en: 'Invalid timeout behaviour: "{policy}".'
  },
  'workflow.issue.sla.escalateBeforeDue': {
    tr: 'Yükseltme süresi, süre sınırından kısa olamaz.',
    en: 'The escalation time cannot be shorter than the time limit.'
  },
  'workflow.issue.sla.escalationOnly': {
    tr: 'Süre sınırı yok; yalnız yükseltme süresi olduğu için yükseltme hiç tetiklenmez.',
    en: 'There is no time limit; with only an escalation time, escalation never fires.'
  },
  'workflow.issue.form.fieldNameEmpty': {
    tr: 'Bir karar alanının adı boş.',
    en: 'A decision field has no name.'
  },
  'workflow.issue.form.fieldDuplicate': {
    tr: '"{field}" karar alanı yineleniyor.',
    en: 'The decision field "{field}" is duplicated.'
  },
  'workflow.issue.form.fieldTypeInvalid': {
    tr: '"{field}" alanının tipi geçersiz: "{type}".',
    en: 'The field "{field}" has an invalid type: "{type}".'
  },
  'workflow.issue.form.enumValuesEmpty': {
    tr: '"{field}" alanının seçenek listesi boş.',
    en: 'The field "{field}" has no options.'
  },
  'workflow.issue.form.maxLengthInvalid': {
    tr: '"{field}" alanında en fazla uzunluk sıfırdan büyük olmalı.',
    en: 'The maximum length of "{field}" must be greater than zero.'
  },
  'workflow.issue.recordField.columnEmpty': {
    tr: 'Bir kayıt alanında kolon seçilmemiş.',
    en: 'A record field has no column selected.'
  },
  'workflow.issue.recordField.duplicate': {
    tr: '"{column}" kayıt alanı yineleniyor.',
    en: 'The record field "{column}" is duplicated.'
  },
  'workflow.issue.recordField.columnMissing': {
    tr: '"{column}" kolonu modelde yok.',
    en: 'The column "{column}" does not exist in the model.'
  },
  'workflow.issue.buttons.approveLabelTooLong': {
    tr: 'Onay düğmesi metni en fazla {max} karakter olabilir.',
    en: 'The approve button text can be at most {max} characters.'
  },
  'workflow.issue.buttons.rejectLabelTooLong': {
    tr: 'Red düğmesi metni en fazla {max} karakter olabilir.',
    en: 'The reject button text can be at most {max} characters.'
  },
  'workflow.issue.sla.autoRejectWhileRejectDisabled': {
    tr: 'Reddetme kapalıyken zaman aşımında otomatik red seçilemez.',
    en: 'Auto-reject on timeout cannot be chosen while rejection is off.'
  },
  'workflow.issue.sla.autoApproveWithRequiredFields': {
    tr: 'Zorunlu kayıt alanı varken zaman aşımında otomatik onay seçilemez.',
    en: 'Auto-approve on timeout cannot be chosen while there are required record fields.'
  },
  'workflow.issue.start.missing': {
    tr: 'Başlangıç adımı seçilmemiş.',
    en: 'No start step is selected.'
  },
  'workflow.issue.start.notFound': {
    tr: 'Başlangıç adımı bulunamadı: "{start}".',
    en: 'The start step was not found: "{start}".'
  },
  'workflow.issue.transition.targetNotFound': {
    tr: '"{port}" çıkışının hedefi bulunamadı: "{target}".',
    en: 'The target of the "{port}" exit was not found: "{target}".'
  },
  'workflow.issue.step.unreachable': {
    tr: 'Başlangıçtan bu adıma ulaşılamıyor — önceki bir adımın çıkışını buna bağlayın.',
    en: 'This step cannot be reached from the start — connect an exit of an earlier step to it.'
  },
  'workflow.issue.trigger.jsonInvalid': {
    tr: 'Tetikleme koşulları okunamadı (bozuk veri).',
    en: 'The trigger conditions could not be read (corrupt data).'
  },
  'workflow.issue.trigger.fieldEmpty': {
    tr: 'Bir tetikleme koşulunda alan seçilmemiş.',
    en: 'A trigger condition has no field selected.'
  },
  'workflow.issue.trigger.operatorInvalid': {
    tr: 'Tetikleme koşulunda operatör geçersiz: "{operator}".',
    en: 'Invalid operator in a trigger condition: "{operator}".'
  },
  'workflow.issue.trigger.fieldMissing': {
    tr: 'Tetikleme koşulundaki "{field}" alanı modelde yok.',
    en: 'The trigger condition field "{field}" does not exist in the model.'
  },

  // ── Koşul / Bitiş / Simülasyon (Faz 8b) ──────────────────────────────────
  'workflow.canvas.edgeDefault': { tr: 'Diğer', en: 'Otherwise' },
  'workflow.canvas.portCase': { tr: '"{label}" yolu — hedefe sürükleyerek bağlayın', en: '"{label}" path — drag onto a step to connect' },
  'workflow.node.condition': { tr: 'Koşul', en: 'Condition' },
  'workflow.node.conditionHelp': { tr: 'Kaydın değerlerine göre yol seçer: sıralı durumlardan ilk eşleşen, hiçbiri değilse varsayılan yol.', en: 'Chooses a path from the record values: the first matching case, otherwise the default path.' },
  'workflow.node.conditionName': { tr: 'Yeni koşul', en: 'New condition' },
  'workflow.node.end': { tr: 'Bitiş', en: 'End' },
  'workflow.node.endHelp': { tr: 'Süreci tamamlandı ya da reddedildi olarak bitirir; kaydın durumunu yazar.', en: 'Ends the process as completed or rejected and writes the record status.' },
  'workflow.node.endName': { tr: 'Bitti', en: 'Done' },
  'workflow.node.endCompleted': { tr: 'Tamamlanır', en: 'Completes' },
  'workflow.node.endRejected': { tr: 'Reddedilir', en: 'Rejects' },
  'workflow.node.caseCount': { tr: '{n} durum', en: '{n} case(s)' },
  'workflow.node.automatic': { tr: 'Otomatik', en: 'Automatic' },
  'workflow.palette.human': { tr: 'Kişiler', en: 'People' },
  'workflow.palette.flow': { tr: 'Akış', en: 'Flow' },
  'workflow.inspector.exit.default': { tr: 'Hiçbiri eşleşmezse', en: 'If none matches' },
  'workflow.inspector.exit.case': { tr: '"{label}" ise', en: 'If "{label}"' },
  'workflow.case.title': { tr: 'Durumlar', en: 'Cases' },
  'workflow.case.orderHelp': { tr: 'Sırayla denenir — ilk eşleşen durumun yolu izlenir.', en: 'Tried in order — the first matching case wins.' },
  'workflow.case.firstLabel': { tr: 'Evet', en: 'Yes' },
  'workflow.case.newLabel': { tr: 'Durum {n}', en: 'Case {n}' },
  'workflow.case.label': { tr: 'Durum adı (kenarda görünür)', en: 'Case name (shown on the edge)' },
  'workflow.case.add': { tr: 'Durum ekle', en: 'Add case' },
  'workflow.case.moveUp': { tr: 'Yukarı taşı', en: 'Move up' },
  'workflow.case.moveDown': { tr: 'Aşağı taşı', en: 'Move down' },
  'workflow.case.mode': { tr: 'Koşul yazımı', en: 'Condition style' },
  'workflow.case.modeRows': { tr: 'Satırlar', en: 'Rows' },
  'workflow.case.modeFormula': { tr: 'Formül', en: 'Formula' },
  'workflow.case.match': { tr: 'Satırların birleşimi', en: 'Row combination' },
  'workflow.case.matchAll': { tr: 'Tüm satırlar sağlanırsa', en: 'If all rows match' },
  'workflow.case.matchAny': { tr: 'Herhangi bir satır sağlanırsa', en: 'If any row matches' },
  'workflow.case.field': { tr: 'Alan', en: 'Field' },
  'workflow.case.operator': { tr: 'Operatör', en: 'Operator' },
  'workflow.case.value': { tr: 'Değer', en: 'Value' },
  'workflow.case.addRow': { tr: 'Satır ekle', en: 'Add row' },
  'workflow.case.noRows': { tr: 'Bu durumda henüz satır yok; satır eklenmeden hiç eşleşmez.', en: 'This case has no rows yet; it never matches until one is added.' },
  'workflow.case.formula': { tr: 'Formül (sonucu doğru/yanlış)', en: 'Formula (true/false result)' },
  'workflow.case.formulaPlaceholder': { tr: '[Tutar] >= 10000 AND [Birim] = \'IT\'', en: '[Amount] >= 10000 AND [Unit] = \'IT\'' },
  'workflow.case.formulaHelp': { tr: 'Alanlar [Kolon], önceki adımın karar alanları [adim.alan]; otomatik değer fonksiyonları kullanılabilir (SEQ hariç).', en: 'Fields as [Column], earlier step decision fields as [step.field]; auto-value functions are available (except SEQ).' },
  'workflow.case.formulaError': { tr: 'Formül okunamadı ({code}).', en: 'The formula could not be read ({code}).' },
  'workflow.case.formulaSequence': { tr: 'Koşulda SEQ kullanılamaz.', en: 'SEQ cannot be used in a condition.' },
  'workflow.case.formulaUnknown': { tr: 'Bilinmeyen alan: {fields}', en: 'Unknown field: {fields}' },
  'workflow.case.target': { tr: 'Eşleşirse gidilecek adım', en: 'Go to step when matched' },
  'workflow.case.default': { tr: 'Hiçbir durum eşleşmezse', en: 'If no case matches' },
  'workflow.case.defaultHelp': { tr: 'Zorunlu — kayıt hiçbir duruma uymazsa izlenecek yol.', en: 'Required — the path taken when the record matches no case.' },
  'workflow.case.inspectorHelp': { tr: 'Durumları ve satırlarını "Tüm ayarlar" penceresinde düzenleyin; yolları aşağıdan bağlayabilirsiniz.', en: 'Edit cases and their rows in "All settings"; connect the paths below.' },
  'workflow.case.summaryRows': { tr: '{n} satır', en: '{n} row(s)' },
  'workflow.case.summaryFormula': { tr: 'Formül', en: 'Formula' },
  'workflow.case.operator.isempty': { tr: 'boş', en: 'is empty' },
  'workflow.case.operator.notempty': { tr: 'dolu', en: 'is not empty' },
  'workflow.end.outcome': { tr: 'Sonuç', en: 'Outcome' },
  'workflow.end.completed': { tr: 'Süreç tamamlanır', en: 'Process completes' },
  'workflow.end.rejected': { tr: 'Süreç reddedilir', en: 'Process is rejected' },
  'workflow.end.statusHelp': { tr: 'Süreç bitince kayıtta görünen durum; boşsa düğümün adı yazılır.', en: 'The status shown on the record when the process ends; the node name if empty.' },
  'workflow.simulate.open': { tr: 'Simüle et', en: 'Simulate' },
  'workflow.simulate.title': { tr: 'Simülasyon', en: 'Simulation' },
  'workflow.simulate.intro': { tr: 'Akışı bir örnek kayıt ve kararlarla dener; hiçbir şey kaydedilmez. Kaydedilmemiş değişiklikler de denenir.', en: 'Tries the workflow with a sample record and decisions; nothing is saved. Unsaved changes are included.' },
  'workflow.simulate.record': { tr: 'Kayıt', en: 'Record' },
  'workflow.simulate.sample': { tr: 'Örnek değerler', en: 'Sample values' },
  'workflow.simulate.existing': { tr: 'Var olan kayıt', en: 'Existing record' },
  'workflow.simulate.recordId': { tr: 'Kayıt numarası (ID)', en: 'Record number (ID)' },
  'workflow.simulate.noModel': { tr: 'Örnek değer girmek için önce hedef modeli seçin.', en: 'Select the target model first to enter sample values.' },
  'workflow.simulate.decisions': { tr: 'Kararlar', en: 'Decisions' },
  'workflow.simulate.approve': { tr: 'Onaylar', en: 'Approves' },
  'workflow.simulate.reject': { tr: 'Reddeder', en: 'Rejects' },
  'workflow.simulate.run': { tr: 'Çalıştır', en: 'Run' },
  'workflow.simulate.clear': { tr: 'Temizle', en: 'Clear' },
  'workflow.simulate.result': { tr: 'Sonuç', en: 'Result' },
  'workflow.simulate.failed': { tr: 'Simülasyon çalıştırılamadı.', en: 'The simulation could not be run.' },
  'workflow.simulate.outcome.completed': { tr: 'Tamamlanır', en: 'Completes' },
  'workflow.simulate.outcome.rejected': { tr: 'Reddedilir', en: 'Is rejected' },
  'workflow.simulate.outcome.waiting': { tr: 'Karar bekliyor', en: 'Waiting for a decision' },
  'workflow.simulate.outcome.incident': { tr: 'Hataya düşer', en: 'Fails at a step' },
  'workflow.simulate.outcome.failed': { tr: 'Tanım bozuk', en: 'Definition is broken' },
  'workflow.simulate.outcome.limit': { tr: 'Döngü — sınırda durdu', en: 'Loop — stopped at the limit' },
  'workflow.event.ConditionEvaluated': { tr: 'Koşul değerlendirildi', en: 'Condition evaluated' },
  'workflow.event.StepFailed': { tr: 'Adım hata verdi', en: 'Step failed' },
  'workflow.event.StepSkipped': { tr: 'Adım atlandı', en: 'Step skipped' },
  'workflow.issue.condition.noCases': { tr: 'Koşulda hiç durum yok; her zaman varsayılan yol izlenir.', en: 'The condition has no cases; the default path is always taken.' },
  'workflow.issue.condition.defaultMissing': { tr: 'Hiçbir durum eşleşmezse izlenecek yol seçilmemiş.', en: 'No path is selected for when no case matches.' },
  'workflow.issue.case.keyEmpty': { tr: 'Bir durumun anahtarı boş.', en: 'A case has an empty key.' },
  'workflow.issue.case.keyInvalid': { tr: 'Durum anahtarı geçersiz: "{key}".', en: 'Invalid case key: "{key}".' },
  'workflow.issue.case.keyDuplicate': { tr: '"{key}" durum anahtarı yineleniyor.', en: 'The case key "{key}" is duplicated.' },
  'workflow.issue.case.empty': { tr: '{case} durumunda koşul satırı ya da formül yok.', en: 'The {case} case has no rows or formula.' },
  'workflow.issue.case.fieldEmpty': { tr: 'Bir koşul satırında alan seçilmemiş.', en: 'A condition row has no field selected.' },
  'workflow.issue.case.operatorInvalid': { tr: 'Koşulda geçersiz operatör: "{operator}".', en: 'Invalid operator in the condition: "{operator}".' },
  'workflow.issue.case.fieldMissing': { tr: 'Koşuldaki "{field}" alanı modelde yok.', en: 'The condition field "{field}" does not exist in the model.' },
  'workflow.issue.case.stepFieldUnknown': { tr: '"{field}" alanının adımı bulunamadı.', en: 'The step of the field "{field}" was not found.' },
  'workflow.issue.case.expressionInvalid': { tr: '{case} durumunun formülü okunamadı ({detail}).', en: 'The formula of the {case} case could not be read ({detail}).' },
  'workflow.issue.case.expressionSequence': { tr: '{case} durumunun formülünde SEQ kullanılamaz.', en: 'SEQ cannot be used in the formula of the {case} case.' },
  'workflow.issue.case.targetMissing': { tr: '{case} durumunun gideceği adım seçilmemiş.', en: 'No target step is selected for the {case} case.' },
  'workflow.issue.end.outcomeInvalid': { tr: 'Bitişin sonucu geçersiz: "{outcome}".', en: 'Invalid end outcome: "{outcome}".' },
  'workflow.issue.cycle.automatic': { tr: 'Bu adım yalnız otomatik adımlardan oluşan bir döngüde; süreç sonsuza dek dönerdi.', en: 'This step is in a loop of automatic steps only; the process would spin forever.' },

  // ── Alan güncelle ve Bildirim düğümleri (Faz 10a) ─────────────────────────
  'workflow.node.action': { tr: 'Alan güncelle', en: 'Update fields' },
  'workflow.node.actionHelp': { tr: 'Kayda sabit değer ya da formül sonucu yazar veya alanı temizler; sonra sıradaki adıma geçer.', en: 'Writes a fixed value or a formula result to the record, or clears a field; then moves to the next step.' },
  'workflow.node.actionName': { tr: 'Alanları güncelle', en: 'Update fields' },
  'workflow.node.notify': { tr: 'Bildirim gönder', en: 'Send notification' },
  'workflow.node.notifyHelp': { tr: 'Seçilen kişilere zil ve e-posta bildirimi gönderir; sonra sıradaki adıma geçer.', en: 'Sends a bell and email notification to the selected people; then moves to the next step.' },
  'workflow.node.notifyName': { tr: 'Bildirim gönder', en: 'Send notification' },
  'workflow.node.fieldCount': { tr: '{n} alan', en: '{n} field(s)' },
  'workflow.palette.automation': { tr: 'Otomasyon', en: 'Automation' },
  'workflow.canvas.portNext': { tr: 'Sonraki adım — hedefe sürükleyerek bağlayın', en: 'Next step — drag onto a step to connect' },
  'workflow.inspector.exit.next': { tr: 'Sonra', en: 'Then' },

  'workflow.action.fields': { tr: 'Yazılacak alanlar', en: 'Fields to write' },
  'workflow.action.fieldsHelp': { tr: 'Satırlar sırayla yazılır; formül kaydın güncel değerlerini kullanır.', en: 'Rows are written in order; formulas use the current record values.' },
  'workflow.action.field': { tr: 'Alan', en: 'Field' },
  'workflow.action.mode': { tr: 'Değer kaynağı', en: 'Value source' },
  'workflow.action.modeValue': { tr: 'Sabit değer', en: 'Fixed value' },
  'workflow.action.modeFormula': { tr: 'Formül', en: 'Formula' },
  'workflow.action.modeClear': { tr: 'Temizle', en: 'Clear' },
  'workflow.action.value': { tr: 'Değer', en: 'Value' },
  'workflow.action.valuePlaceholder': { tr: 'ör. Onaylandı', en: 'e.g. Approved' },
  'workflow.action.formula': { tr: 'Formül', en: 'Formula' },
  'workflow.action.formulaPlaceholder': { tr: 'ör. TODAY() ya da [Tutar] * 1.2', en: 'e.g. TODAY() or [Amount] * 1.2' },
  'workflow.action.formulaHelp': { tr: 'Otomatik değer dili: [Alan], TODAY(), IF(…). Hesaplanamazsa süreç bu adımda durur ve yöneticiye gösterilir.', en: 'Auto-value language: [Field], TODAY(), IF(…). If it cannot be computed, the process stops at this step and is shown to the administrator.' },
  'workflow.action.clearHelp': { tr: 'Alan boşaltılır.', en: 'The field is emptied.' },
  'workflow.action.duplicate': { tr: '"{field}" alanı birden çok satırda yazılıyor.', en: 'The field "{field}" is written in more than one row.' },
  'workflow.action.noFields': { tr: 'Henüz yazılacak alan yok.', en: 'No fields to write yet.' },
  'workflow.action.add': { tr: 'Alan ekle', en: 'Add field' },
  'workflow.action.next': { tr: 'Sonraki adım', en: 'Next step' },
  'workflow.action.inspectorHelp': { tr: 'Değerleri ve formülleri "Tüm ayarlar…" içinden düzenleyin.', en: 'Edit values and formulas under "All settings…".' },
  'workflow.action.summaryClear': { tr: '{field} temizlenir', en: '{field} is cleared' },
  'workflow.action.summaryFormula': { tr: '{field} = formül', en: '{field} = formula' },

  'workflow.recipient.creator': { tr: 'Kaydı oluşturan', en: 'Record creator' },
  'workflow.recipient.starter': { tr: 'Süreci başlatan', en: 'Process starter' },
  'workflow.recipient.role': { tr: 'Rol', en: 'Role' },
  'workflow.recipient.user': { tr: 'Kişi', en: 'Person' },
  'workflow.recipient.stepAssignees': { tr: 'Bir adımın görevlileri', en: 'Assignees of a step' },
  'workflow.recipient.stepAssigneesOf': { tr: '{step} görevlileri', en: 'Assignees of {step}' },
  'workflow.recipient.creatorHelp': { tr: 'Kaydı oluşturan kişiye gider.', en: 'Goes to the person who created the record.' },
  'workflow.recipient.starterHelp': { tr: 'Süreci başlatana; otomatik başladıysa kaydı oluşturana.', en: 'Goes to the starter; to the record creator if it started automatically.' },
  'workflow.recipient.roleHelp': { tr: 'Rolün aktif üyelerine gider.', en: 'Goes to the active members of the role.' },
  'workflow.recipient.userHelp': { tr: 'Seçilen kişiye gider.', en: 'Goes to the selected person.' },
  'workflow.recipient.stepAssigneesHelp': { tr: 'Adımda kararı verene, yoksa atanana gider.', en: 'Goes to whoever decided the step, otherwise to its assignee.' },

  'workflow.notify.recipients': { tr: 'Alıcılar', en: 'Recipients' },
  'workflow.notify.noRecipients': { tr: 'En az bir alıcı ekleyin.', en: 'Add at least one recipient.' },
  'workflow.notify.recipientKind': { tr: 'Alıcı türü', en: 'Recipient type' },
  'workflow.notify.step': { tr: 'Adım', en: 'Step' },
  'workflow.notify.addRecipient': { tr: 'Alıcı ekle', en: 'Add recipient' },
  'workflow.notify.removeRecipient': { tr: '{name} alıcısını kaldır', en: 'Remove recipient {name}' },
  'workflow.notify.channels': { tr: 'Kanallar', en: 'Channels' },
  'workflow.notify.channel.inapp': { tr: 'Uygulama içi (zil)', en: 'In-app (bell)' },
  'workflow.notify.channel.email': { tr: 'E-posta', en: 'Email' },
  'workflow.notify.channelsHelp': { tr: 'E-posta yalnız şirketin e-posta ayarları açıksa ve alıcının adresi varsa gider.', en: 'Email is sent only if the company email settings are enabled and the recipient has an address.' },
  'workflow.notify.message': { tr: 'Mesaj', en: 'Message' },
  'workflow.notify.subject': { tr: 'Konu', en: 'Subject' },
  'workflow.notify.body': { tr: 'Metin', en: 'Text' },
  'workflow.notify.bodyPlaceholder': { tr: 'ör. {{record.Baslik}} talebiniz onaylandı.', en: 'e.g. Your request {{record.Baslik}} was approved.' },
  'workflow.notify.placeholdersHelp': { tr: 'Alan eklemek için tıklayın — imlecin olduğu yere yazılır:', en: 'Click to insert a field at the cursor:' },
  'workflow.notify.unknownPlaceholders': { tr: 'Tanınmayan yer tutucu: {names}', en: 'Unknown placeholder: {names}' },
  'workflow.notify.defaultSubject': { tr: 'Talebiniz hakkında bilgilendirme', en: 'An update about your request' },
  'workflow.notify.inspectorHelp': { tr: 'Alıcıları, kanalları ve metni "Tüm ayarlar…" içinden düzenleyin.', en: 'Edit recipients, channels and text under "All settings…".' },

  'workflow.event.FieldsUpdated': { tr: 'Alanlar güncellendi', en: 'Fields updated' },
  'workflow.event.NotificationQueued': { tr: 'Bildirim gönderildi', en: 'Notification sent' },

  'workflow.issue.step.nextMissing': { tr: 'Bu adımdan sonra gidilecek adım seçilmemiş.', en: 'No next step is selected after this step.' },
  'workflow.issue.action.noFields': { tr: 'Yazılacak alan yok.', en: 'There are no fields to write.' },
  'workflow.issue.action.fieldEmpty': { tr: 'Alanı seçilmemiş bir satır var.', en: 'A row has no field selected.' },
  'workflow.issue.action.fieldDuplicate': { tr: '"{field}" alanı birden çok kez yazılıyor.', en: 'The field "{field}" is written more than once.' },
  'workflow.issue.action.fieldMissing': { tr: '"{field}" alanı modelde yok.', en: 'The field "{field}" does not exist in the model.' },
  'workflow.issue.action.fieldProtected': { tr: '"{field}" alanına yazılamaz: değerini otomatik değer kuralı belirliyor.', en: 'Cannot write to "{field}": its value is set by an auto-value rule.' },
  'workflow.issue.action.fieldType': { tr: '{type} tipindeki "{field}" alanına yazılamaz.', en: 'Cannot write to the {type} field "{field}".' },
  'workflow.issue.action.valueInvalid': { tr: '"{field}" alanının değeri kolon tipine ({type}) uymuyor: "{value}".', en: 'The value of "{field}" does not match the column type ({type}): "{value}".' },
  'workflow.issue.action.formulaEmpty': { tr: '"{field}" alanının formülü boş.', en: 'The formula of "{field}" is empty.' },
  'workflow.issue.action.formulaInvalid': { tr: '"{field}" formülü okunamadı ({detail}).', en: 'The formula of "{field}" could not be read ({detail}).' },
  'workflow.issue.action.formulaSequence': { tr: '"{field}" formülünde SEQ kullanılamaz.', en: 'SEQ cannot be used in the formula of "{field}".' },
  'workflow.issue.action.formulaFieldMissing': { tr: 'Formüldeki "{field}" alanı bulunamadı.', en: 'The field "{field}" in the formula was not found.' },
  'workflow.issue.action.modeInvalid': { tr: '"{field}" için geçersiz değer kaynağı: "{mode}".', en: 'Invalid value source for "{field}": "{mode}".' },
  'workflow.issue.notify.noRecipients': { tr: 'Bildirimde en az bir alıcı seçilmeli.', en: 'The notification needs at least one recipient.' },
  'workflow.issue.notify.recipientInvalid': { tr: 'Geçersiz alıcı türü: "{kind}".', en: 'Invalid recipient type: "{kind}".' },
  'workflow.issue.notify.recipientIncomplete': { tr: 'Rolü ya da kişisi seçilmemiş bir alıcı var.', en: 'A recipient has no role or person selected.' },
  'workflow.issue.notify.recipientStepUnknown': { tr: 'Görevlileri alınacak adım bulunamadı: "{step}".', en: 'The step to take assignees from was not found: "{step}".' },
  'workflow.issue.notify.channelInvalid': { tr: 'Geçersiz kanal: "{channel}".', en: 'Invalid channel: "{channel}".' },
  'workflow.issue.notify.subjectEmpty': { tr: 'Bildirimin konusu boş.', en: 'The notification subject is empty.' },
  'workflow.issue.notify.subjectTooLong': { tr: 'Konu en fazla {max} karakter olabilir.', en: 'The subject can be at most {max} characters.' },
  'workflow.issue.notify.bodyTooLong': { tr: 'Metin en fazla {max} karakter olabilir.', en: 'The text can be at most {max} characters.' },
  'workflow.issue.notify.placeholderUnknown': { tr: 'Bilinmeyen yer tutucu: "{name}".', en: 'Unknown placeholder: "{name}".' },

  // ── Bekleme düğümü (Faz 10b) ──────────────────────────────────────────────
  'workflow.node.timer': { tr: 'Bekleme', en: 'Wait' },
  'workflow.node.timerHelp': { tr: 'Belirli bir süre ya da kayıttaki bir tarihe kadar bekler; sonra sıradaki adıma geçer.', en: 'Waits for a period or until a date on the record; then moves to the next step.' },
  'workflow.node.timerName': { tr: 'Bekle', en: 'Wait' },
  'workflow.palette.unavailable': { tr: 'Bu şirkette kullanılamıyor: veritabanı güncellemesi (migrasyon 022) gerekli.', en: 'Not available for this company: a database upgrade (migration 022) is required.' },

  'workflow.timer.title': { tr: 'Bekleme', en: 'Wait' },
  'workflow.timer.mode': { tr: 'Bekleme türü', en: 'Wait type' },
  'workflow.timer.modeDuration': { tr: 'Belirli bir süre', en: 'For a period' },
  'workflow.timer.modeUntilField': { tr: 'Kayıttaki bir tarihe kadar', en: 'Until a date on the record' },
  'workflow.timer.amount': { tr: 'Süre', en: 'Duration' },
  'workflow.timer.unit': { tr: 'Birim', en: 'Unit' },
  'workflow.timer.unitName.minutes': { tr: 'Dakika', en: 'Minutes' },
  'workflow.timer.unitName.hours': { tr: 'Saat', en: 'Hours' },
  'workflow.timer.unitName.days': { tr: 'Gün', en: 'Days' },
  'workflow.timer.unit.minutes': { tr: '{n} dk', en: '{n} min' },
  'workflow.timer.unit.hours': { tr: '{n} saat', en: '{n} h' },
  'workflow.timer.unit.days': { tr: '{n} gün', en: '{n} day(s)' },
  'workflow.timer.durationHelp': { tr: 'Süre, sürecin bu adıma girdiği andan itibaren sayılır.', en: 'The duration is counted from when the process enters this step.' },
  'workflow.timer.durationInvalid': { tr: 'Süre sıfırdan büyük olmalı.', en: 'The duration must be greater than zero.' },
  'workflow.timer.durationTooLong': { tr: 'Bekleme en fazla {max} gün sürebilir.', en: 'A wait can last at most {max} days.' },
  'workflow.timer.field': { tr: 'Tarih alanı', en: 'Date field' },
  'workflow.timer.offset': { tr: 'Kaydırma (saat)', en: 'Offset (hours)' },
  'workflow.timer.offsetHelp': { tr: 'İstanbul saatiyle; yalnız tarih alanı gece yarısı sayılır. Negatif değer tarihten önce demektir (ör. -24 = bir gün önce).', en: 'Istanbul time; a date-only field counts as midnight. A negative value means before the date (e.g. -24 = one day before).' },
  'workflow.timer.noDateColumns': { tr: 'Modelde tarih alanı yok.', en: 'The model has no date fields.' },
  'workflow.timer.onMissing': { tr: 'Tarih boşsa', en: 'If the date is empty' },
  'workflow.timer.onMissingContinue': { tr: 'Beklemeden devam et', en: 'Continue without waiting' },
  'workflow.timer.onMissingIncident': { tr: 'Süreci durdur (hata)', en: 'Stop the process (error)' },
  'workflow.timer.lockNote': { tr: 'Bekleme boyunca süreç bu adımda durur; kayıt alanlı adımların kilidi sürer.', en: 'The process stays at this step while waiting; locks from record-field steps remain.' },
  'workflow.timer.inspectorHelp': { tr: 'Süreyi ya da tarih alanını "Tüm ayarlar…" içinden düzenleyin.', en: 'Edit the duration or date field under "All settings…".' },
  'workflow.timer.summaryUntil': { tr: '{field} tarihine kadar', en: 'Until {field}' },
  'workflow.timer.summaryBefore': { tr: '{field} − {n} sa', en: '{field} − {n} h' },
  'workflow.timer.summaryAfter': { tr: '{field} + {n} sa', en: '{field} + {n} h' },

  'workflow.runtime.waitingUntil': { tr: '{date} tarihine kadar bekliyor', en: 'Waiting until {date}' },
  'workflow.event.TimerScheduled': { tr: 'Bekleme başladı', en: 'Wait started' },
  'workflow.event.TimerFired': { tr: 'Bekleme bitti', en: 'Wait finished' },

  'workflow.issue.timer.missing': { tr: 'Bekleme ayarı yok.', en: 'The wait has no settings.' },
  'workflow.issue.timer.modeInvalid': { tr: 'Bekleme türü geçersiz: "{mode}".', en: 'Invalid wait type: "{mode}".' },
  'workflow.issue.timer.unitInvalid': { tr: 'Süre birimi geçersiz: "{unit}".', en: 'Invalid duration unit: "{unit}".' },
  'workflow.issue.timer.durationInvalid': { tr: 'Bekleme süresi sıfırdan büyük olmalı.', en: 'The wait duration must be greater than zero.' },
  'workflow.issue.timer.durationTooLong': { tr: 'Bekleme en fazla {max} gün sürebilir.', en: 'A wait can last at most {max} days.' },
  'workflow.issue.timer.fieldEmpty': { tr: 'Beklenecek tarih alanı seçilmemiş.', en: 'No date field is selected to wait for.' },
  'workflow.issue.timer.fieldMissing': { tr: '"{field}" tarih alanı modelde yok.', en: 'The date field "{field}" does not exist in the model.' },
  'workflow.issue.timer.fieldNotDate': { tr: '"{field}" bir tarih alanı değil.', en: '"{field}" is not a date field.' },
  'workflow.issue.timer.onMissingInvalid': { tr: 'Tarih boşsa seçeneği geçersiz: "{value}".', en: 'Invalid "if the date is empty" option: "{value}".' },
  'workflow.issue.timer.unavailable': { tr: 'Bekleme bu şirkette kullanılamıyor: veritabanı güncellemesi (migrasyon 022) gerekli.', en: 'Wait is not available for this company: a database upgrade (migration 022) is required.' },

  // ── Olgunlaştırma (Faz 11): paket, şablon, sürüm farkı, durdur, kota ───────
  'workflow.package.export': { tr: 'Dışa aktar', en: 'Export' },
  'workflow.package.exportHint': { tr: 'Ekrandaki tasarımı (kaydedilmemiş değişiklikler dahil) dosya olarak indirir.', en: 'Downloads the design on screen (including unsaved changes) as a file.' },
  'workflow.package.import': { tr: 'İçe aktar', en: 'Import' },
  'workflow.package.imported': { tr: 'Akış "{code}" koduyla taslak olarak eklendi. Atamaları ve alanları kontrol edin.', en: 'The workflow was added as a draft with code "{code}". Check its assignments and fields.' },
  'workflow.package.error.json': { tr: 'Dosya okunamadı: geçerli bir JSON değil.', en: 'The file could not be read: not valid JSON.' },
  'workflow.package.error.format': { tr: 'Bu dosya bir iş akışı paketi değil.', en: 'This file is not a workflow package.' },
  'workflow.package.error.version': { tr: 'Paket daha yeni bir sürümle oluşturulmuş; içe aktarılamıyor.', en: 'The package was created by a newer version and cannot be imported.' },
  'workflow.package.error.fields': { tr: 'Pakette ad, kod, model ya da tetik eksik.', en: 'The package is missing its name, code, model or trigger.' },
  'workflow.package.error.definition': { tr: 'Paketteki akış şeması bozuk.', en: 'The workflow diagram in the package is corrupted.' },

  'workflow.template.title': { tr: 'Şablondan başlayın', en: 'Start from a template' },
  'workflow.template.purchase.name': { tr: 'Satın alma onayı', en: 'Purchase approval' },
  'workflow.template.purchase.description': { tr: 'Müdür onayı, yüksek tutarda finans onayı, talep sahibine bildirim.', en: 'Manager approval, finance approval for high amounts, requester notification.' },
  'workflow.template.purchase.manager': { tr: 'Müdür onayı', en: 'Manager approval' },
  'workflow.template.purchase.amountCheck': { tr: 'Tutar yüksek mi?', en: 'Is the amount high?' },
  'workflow.template.purchase.highAmount': { tr: 'Yüksek tutar', en: 'High amount' },
  'workflow.template.purchase.finance': { tr: 'Finans onayı', en: 'Finance approval' },
  'workflow.template.leave.name': { tr: 'İzin talebi', en: 'Leave request' },
  'workflow.template.leave.description': { tr: 'Yönetici onayı, İK kaydı, çalışana bildirim.', en: 'Manager approval, HR record, employee notification.' },
  'workflow.template.leave.manager': { tr: 'Yönetici onayı', en: 'Manager approval' },
  'workflow.template.leave.hr': { tr: 'İK kaydı', en: 'HR record' },
  'workflow.template.expense.name': { tr: 'Masraf onayı', en: 'Expense approval' },
  'workflow.template.expense.description': { tr: 'Yönetici onayı, muhasebede ödeme görevi.', en: 'Manager approval, payment task in accounting.' },
  'workflow.template.expense.manager': { tr: 'Yönetici onayı', en: 'Manager approval' },
  'workflow.template.expense.accounting': { tr: 'Ödemeyi yap', en: 'Make the payment' },
  'workflow.template.notifyRequester': { tr: 'Talep sahibine bildir', en: 'Notify the requester' },
  'workflow.template.approvedSubject': { tr: 'Talebiniz onaylandı', en: 'Your request was approved' },
  'workflow.template.approved': { tr: 'Onaylandı', en: 'Approved' },
  'workflow.template.rejected': { tr: 'Reddedildi', en: 'Rejected' },
  'workflow.template.paid': { tr: 'Ödendi', en: 'Paid' },

  'workflow.diff.compare': { tr: 'Öncekiyle karşılaştır', en: 'Compare with previous' },
  'workflow.diff.title': { tr: '{from} → {to} farkı', en: 'Changes {from} → {to}' },
  'workflow.diff.none': { tr: 'İki sürüm arasında akış farkı yok (yalnız yerleşim değişmiş olabilir).', en: 'There is no workflow difference between the versions (only the layout may have changed).' },
  'workflow.diff.added': { tr: 'Eklenen', en: 'Added' },
  'workflow.diff.changed': { tr: 'Değişen', en: 'Changed' },
  'workflow.diff.removed': { tr: 'Kaldırılan', en: 'Removed' },
  'workflow.diff.startChanged': { tr: 'Başlangıç adımı değişti.', en: 'The start step changed.' },
  'workflow.diff.hint': { tr: 'Yeni sürümün şeması: eklenen adımlar yeşil, değişenler sarı kesik çizgili; yeni ya da yön değiştiren oklar vurgulu.', en: 'The new version\u2019s diagram: added steps are green, changed ones are dashed amber; new or redirected arrows are highlighted.' },

  'workflow.list.pause': { tr: 'Durdur', en: 'Pause' },
  'workflow.list.resume': { tr: 'Sürdür', en: 'Resume' },
  'workflow.usage.definitions': { tr: 'Yayındaki akış', en: 'Published workflows' },
  'workflow.usage.runs': { tr: 'Bu dönem başlatılan süreç', en: 'Processes started this period' },
  'workflow.usage.notEntitled': { tr: 'Mevcut planınız iş akışı modülünü kapsamıyor.', en: 'Your current plan does not include the workflow module.' },

  // ── Özellik paneli ────────────────────────────────────────────────────────
  'workflow.inspector.aria': { tr: 'Seçimin özellikleri', en: 'Selection properties' },
  'workflow.inspector.title': { tr: 'Özellikler', en: 'Properties' },
  'workflow.inspector.empty': {
    tr: 'Ayarlarını görmek için bir adıma ya da bağlantıya tıklayın. Paletten yeni adım ekleyebilirsiniz.',
    en: 'Click a step or connection to see its settings. Add new steps from the palette.'
  },
  'workflow.inspector.emptyReadonly': {
    tr: 'Ayrıntılarını görmek için bir adıma tıklayın.',
    en: 'Click a step to see its details.'
  },
  'workflow.inspector.keyHelp': {
    tr: 'Değiştirince bağlantılar da güncellenir (alandan çıkınca uygulanır).',
    en: 'Connections follow the change (applied when you leave the field).'
  },
  'workflow.inspector.key.empty': { tr: 'Anahtar boş olamaz.', en: 'The key cannot be empty.' },
  'workflow.inspector.key.invalid': {
    tr: 'Harf ile başlamalı; yalnız İngilizce harf, rakam ve alt çizgi içerebilir.',
    en: 'Must start with a letter; only English letters, digits and underscores.'
  },
  'workflow.inspector.key.duplicate': { tr: 'Bu anahtar başka bir adımda kullanılıyor.', en: 'Another step already uses this key.' },
  'workflow.inspector.assignee': { tr: 'Kime atanır', en: 'Assigned to' },
  'workflow.inspector.choose': { tr: '— Seçin —', en: '— Select —' },
  'workflow.inspector.noDue': { tr: 'Süre sınırı yok', en: 'No time limit' },
  'workflow.inspector.statusLabelPlaceholder': { tr: 'Ör. Müdür onayında', en: 'e.g. Awaiting manager' },
  'workflow.inspector.joinMode': { tr: 'İlerleme kuralı', en: 'Completion rule' },
  'workflow.inspector.branches': { tr: 'Dallar', en: 'Branches' },
  'workflow.inspector.branchesHelp': {
    tr: 'Dalları ve atamalarını "Tüm ayarlar" penceresinde düzenleyin.',
    en: 'Edit branches and their assignees in "All settings".'
  },
  'workflow.inspector.exits': { tr: 'Sonra', en: 'Then' },
  'workflow.inspector.exit.approve': { tr: 'Onaylanınca', en: 'When approved' },
  'workflow.inspector.exit.reject': { tr: 'Reddedilince', en: 'When rejected' },
  'workflow.inspector.exit.done': { tr: 'Tamamlanınca', en: 'When completed' },
  'workflow.inspector.exit.complete': { tr: 'Dallar tamamlanınca', en: 'When branches complete' },
  'workflow.inspector.exit.anyReject': { tr: 'Bir dal reddedince', en: 'When a branch rejects' },
  'workflow.inspector.allSettings': { tr: 'Tüm ayarlar…', en: 'All settings…' },
  'workflow.inspector.details': { tr: 'Ayrıntılar…', en: 'Details…' },
  'workflow.inspector.edge': { tr: 'Bağlantı', en: 'Connection' },
  'workflow.inspector.target': { tr: 'Hedef adım', en: 'Target step' },
  'workflow.inspector.multi': { tr: '{n} adım seçili', en: '{n} steps selected' },
  'workflow.inspector.multiHelp': {
    tr: 'Birlikte taşıyabilir, çoğaltabilir ya da silebilirsiniz. Tek bir adımın ayarları için yalnız ona tıklayın.',
    en: 'You can move, duplicate or delete them together. Click a single step to see its settings.'
  },

  // ── Düğüm türleri ve palet ────────────────────────────────────────────────
  'workflow.build.typeApproval': { tr: 'Tekil onay', en: 'Single approval' },
  'workflow.build.typeParallel': { tr: 'Paralel onay', en: 'Parallel approval' },
  'workflow.node.approval': { tr: 'Onay', en: 'Approval' },
  'workflow.node.approvalHelp': {
    tr: 'Atanan kişi kaydı onaylar ya da reddeder.',
    en: 'The assignee approves or rejects the record.'
  },
  'workflow.node.approvalName': { tr: 'Yeni onay', en: 'New approval' },
  'workflow.node.task': { tr: 'Görev', en: 'Task' },
  'workflow.node.taskHelp': {
    tr: 'Atanan kişi işi yapar ve tamamlar; reddetme yoktur.',
    en: 'The assignee does the work and completes it; there is no rejection.'
  },
  'workflow.node.taskName': { tr: 'Yeni görev', en: 'New task' },
  'workflow.node.taskComplete': { tr: 'Tamamla', en: 'Complete' },
  'workflow.node.parallel': { tr: 'Paralel onay', en: 'Parallel approval' },
  'workflow.node.parallelHelp': {
    tr: 'Birden çok kişi aynı anda onaylar; hepsinin ya da birinin onayıyla ilerler.',
    en: 'Several people approve at the same time; proceeds when all or any of them approve.'
  },
  'workflow.node.parallelName': { tr: 'Paralel onay', en: 'Parallel approval' },
  'workflow.node.branchName': { tr: 'Dal {n}', en: 'Branch {n}' },
  'workflow.node.hours': { tr: '{n} sa', en: '{n} h' },
  'workflow.palette.title': { tr: 'Ekle', en: 'Add' },
  'workflow.palette.aria': { tr: 'Adım türleri', en: 'Step types' },
  'workflow.palette.help': {
    tr: 'Tuvale sürükleyin ya da tıklayın — tıklanan adım, seçili adımın boş çıkışına bağlanır.',
    en: 'Drag onto the canvas or click — a clicked step is connected to the free exit of the selected step.'
  },
  'workflow.canvas.aria': {
    tr: 'Akış şeması. Ok tuşları seçili adımları iter, Delete siler, Enter ayrıntıyı açar.',
    en: 'Workflow diagram. Arrow keys nudge the selected steps, Delete removes, Enter opens details.'
  },
  'workflow.canvas.menu.edit': { tr: 'Düzenle', en: 'Edit' },
  'workflow.canvas.menu.details': { tr: 'Ayrıntılar', en: 'Details' },
  'workflow.canvas.menu.setStart': { tr: 'Başlangıç adımı yap', en: 'Make start step' },
  'workflow.canvas.menu.duplicate': { tr: 'Çoğalt', en: 'Duplicate' },
  'workflow.canvas.menu.delete': { tr: 'Sil', en: 'Delete' },
  'workflow.canvas.menu.deleteEdge': { tr: 'Bağlantıyı kaldır', en: 'Remove connection' },
  'workflow.canvas.menu.addKind': { tr: '{kind} ekle', en: 'Add {kind}' },
  'workflow.canvas.quickAdd': { tr: 'Bu çıkışa adım ekle', en: 'Add a step to this exit' },
  'workflow.canvas.menu.selectAll': { tr: 'Tümünü seç', en: 'Select all' },
  'workflow.build.undo': { tr: 'Geri al (Ctrl+Z)', en: 'Undo (Ctrl+Z)' },
  'workflow.build.redo': { tr: 'Yinele (Ctrl+Y)', en: 'Redo (Ctrl+Y)' },
  'workflow.build.unsaved': { tr: 'Kaydedilmemiş değişiklik var', en: 'Unsaved changes' },
  'workflow.build.stepsDeleted': {
    tr: '{n} adım silindi. Geri almak için Ctrl+Z.',
    en: '{n} step(s) deleted. Press Ctrl+Z to undo.'
  },
  'workflow.build.edgeRemoved': {
    tr: 'Bağlantı kaldırıldı; bu çıkışta süreç artık biter. Geri almak için Ctrl+Z.',
    en: 'Connection removed; the process now ends at this exit. Press Ctrl+Z to undo.'
  },
  'workflow.build.pasted': { tr: '{n} adım yapıştırıldı.', en: '{n} step(s) pasted.' },
  'workflow.canvas.portApprove': { tr: 'Onay bağlantısı çiz', en: 'Draw approve connection' },
  'workflow.canvas.portReject': { tr: 'Red bağlantısı çiz', en: 'Draw reject connection' },
  'workflow.canvas.hintReadonly': {
    tr: 'Bu akış yayınlandı; şema salt-okunur. Ayrıntıları görmek için adıma çift tıklayın. Yakınlaşmak için Ctrl + tekerlek, kaydırmak için boş zemini sürükleyin.',
    en: 'This workflow is published; the diagram is read-only. Double-click a step to see its details. Ctrl + wheel to zoom, drag the empty background to pan.'
  },
  'workflow.canvas.edgeApprove': { tr: 'onay', en: 'approve' },
  'workflow.canvas.edgeReject': { tr: 'red', en: 'reject' },
  'workflow.canvas.zoomIn': { tr: 'Yakınlaştır', en: 'Zoom in' },
  'workflow.canvas.zoomOut': { tr: 'Uzaklaştır', en: 'Zoom out' },
  'workflow.canvas.zoomReset': { tr: 'Yakınlaştırmayı sıfırla', en: 'Reset zoom' },
  'workflow.canvas.fit': { tr: 'Ekrana sığdır', en: 'Fit to screen' },
  'workflow.canvas.autoLayout': { tr: 'Otomatik düzenle', en: 'Auto arrange' },
  'workflow.canvas.autoLayoutHint': {
    tr: 'Elle verilen konumları sıfırlar; onay yolu dikey, red dalı sağda olacak şekilde yeniden dizer.',
    en: 'Resets manual positions and re-arranges the steps with the approve path vertical and reject branches to the right.'
  },
  'workflow.build.tablistAria': { tr: 'Akış tasarım sekmeleri', en: 'Workflow design tabs' },
  'workflow.build.name': { tr: 'Akış adı', en: 'Workflow name' },
  'workflow.build.code': { tr: 'Kod', en: 'Code' },
  'workflow.build.codeHelp': {
    tr: 'Sürümler arası sabit kimlik. Harf ile başlar; harf, rakam ve alt çizgi içerebilir.',
    en: 'Stable identity across versions. Starts with a letter; may contain letters, digits and underscores.'
  },
  'workflow.build.model': { tr: 'Hedef model', en: 'Target model' },
  'workflow.build.selectModel': { tr: 'Model seçin', en: 'Select a model' },
  'workflow.build.isEnabled': { tr: 'Akış etkin', en: 'Workflow enabled' },
  'workflow.build.isEnabledHelp': {
    tr: 'Kapatılırsa yeni süreç başlamaz; çalışanlar etkilenmez.',
    en: 'When disabled, no new processes start; running ones are unaffected.'
  },
  'workflow.build.startStep': { tr: 'Başlangıç adımı', en: 'Start step' },
  'workflow.build.addStep': { tr: 'Adım Ekle', en: 'Add Step' },
  'workflow.build.canvasMobileNotice': { tr: 'Tuval geniş ekranda daha rahat kullanılır. Telefonda adımları "Adımlar" sekmesinden ekleyip düzenleyebilir, bağlantıları adım penceresindeki onay/red seçimleriyle kurabilirsiniz.', en: 'The canvas works best on a wider screen. On a phone you can add and edit steps from the "Steps" tab and set connections with the approve/reject choices in the step dialog.' },
  'workflow.build.removeStep': { tr: 'Adımı kaldır', en: 'Remove step' },
  'workflow.build.stepKey': { tr: 'Anahtar', en: 'Key' },
  'workflow.build.stepName': { tr: 'Adım adı', en: 'Step name' },
  'workflow.build.stepType': { tr: 'Adım tipi', en: 'Step type' },
  'workflow.build.joinMode': { tr: 'İlerleme kuralı', en: 'Join rule' },
  'workflow.build.joinModeHelp': {
    tr: 'Reddetme her zaman önceliklidir: bir dal reddederse kalanlar iptal edilir.',
    en: 'Rejection always wins: if one branch rejects, the rest are cancelled.'
  },
  'workflow.build.branches': { tr: 'Dallar', en: 'Branches' },
  'workflow.build.addBranch': { tr: 'Dal Ekle', en: 'Add Branch' },
  'workflow.build.branchesHelp': {
    tr: 'Dalların hepsi aynı anda açılır. Her dalın kendi ataması ve süresi olabilir (en az iki dal gerekir).',
    en: 'All branches open at the same time. Each branch can have its own assignee and deadline (at least two are required).'
  },
  'workflow.build.branchKey': { tr: 'Dal anahtarı', en: 'Branch key' },
  'workflow.build.branchName': { tr: 'Dal adı', en: 'Branch name' },
  'workflow.build.assignMode': { tr: 'Atama', en: 'Assignment' },
  'workflow.build.assignRole': { tr: 'Rol', en: 'Role' },
  'workflow.build.assignUser': { tr: 'Kullanıcı', en: 'User' },
  'workflow.build.selectRole': { tr: 'Rol seçin', en: 'Select a role' },
  'workflow.build.selectUser': { tr: 'Kullanıcı seçin', en: 'Select a user' },
  'workflow.build.dueHours': { tr: 'Süre (saat)', en: 'Due (hours)' },
  'workflow.build.escalateHours': { tr: 'Yükseltme (saat)', en: 'Escalate (hours)' },
  'workflow.build.onTimeout': { tr: 'Süre dolunca', en: 'On timeout' },
  'workflow.build.onApprove': { tr: 'Onaylanırsa', en: 'If approved' },
  'workflow.build.onReject': { tr: 'Reddedilirse', en: 'If rejected' },
  'workflow.build.terminalCompleted': { tr: '→ Süreci tamamla', en: '→ Complete process' },
  'workflow.build.terminalRejected': { tr: '→ Süreci reddet', en: '→ Reject process' },
  'workflow.build.statusLabel': { tr: 'Kayıt durumu metni', en: 'Record status text' },
  'workflow.build.statusLabelHelp': {
    tr: 'Bu adım açıkken iş kaydının listede görünecek durumu.',
    en: 'The status shown on the record in lists while this step is open.'
  },
  'workflow.build.recordFields': { tr: 'Kayıt alanları', en: 'Record fields' },
  'workflow.build.recordFieldsHelp': {
    tr: 'Bu adımın görevlisinin formda dolduracağı alanlar. Süreç sürerken kayıt kilitlenir; görevli yalnız bu alanları düzenleyebilir.',
    en: 'Fields the assignee of this step fills on the form. While the process runs the record is locked; the assignee can edit only these fields.'
  },
  'workflow.build.recordFieldsNoModel': {
    tr: 'Kayıt alanı seçmek için önce akışın modelini seçin.',
    en: 'Select the workflow model first to choose record fields.'
  },
  'workflow.build.noRecordFields': {
    tr: 'Kayıt alanı yok — görevli kayıtta hiçbir alanı değiştiremez, yalnızca ilerletir.',
    en: 'No record fields — the assignee cannot change any field on the record, only advance it.'
  },
  'workflow.build.addRecordField': { tr: 'Kayıt Alanı Ekle', en: 'Add Record Field' },
  'workflow.build.recordFieldColumn': { tr: 'Kolon', en: 'Column' },
  'workflow.build.selectColumn': { tr: 'Kolon seçin', en: 'Select a column' },
  'workflow.build.sectionButtons': { tr: 'Kayıt ekranındaki butonlar', en: 'Buttons on the record screen' },
  'workflow.build.buttonsHelp': {
    tr: 'Görevli bu butonları kaydın Kaydet butonunun yanında görür. Boş bırakılırsa adım adı kullanılır.',
    en: 'The assignee sees these buttons next to the record\'s Save button. If left empty, the step name is used.'
  },
  'workflow.build.approveLabel': { tr: 'İlerletme butonu', en: 'Advance button' },
  'workflow.build.rejectLabel': { tr: 'Red butonu', en: 'Reject button' },
  'workflow.build.allowReject': { tr: 'Bu adımda reddetmeye izin ver', en: 'Allow rejecting at this step' },
  'workflow.build.rejectDisabled': {
    tr: 'Bu adımda reddetme kapalı.',
    en: 'Rejecting is disabled at this step.'
  },
  'workflow.build.formFields': { tr: 'Ek karar alanları', en: 'Extra decision fields' },
  'workflow.build.addField': { tr: 'Alan Ekle', en: 'Add Field' },
  'workflow.build.fieldName': { tr: 'Alan adı', en: 'Field name' },
  'workflow.build.fieldType': { tr: 'Tip', en: 'Type' },
  'workflow.build.fieldLabel': { tr: 'Etiket', en: 'Label' },
  'workflow.build.fieldRequired': { tr: 'Zorunlu', en: 'Required' },
  'workflow.build.fieldEnumValues': { tr: 'Seçenekler (| ile ayır)', en: 'Options (separate with |)' },
  'workflow.build.fieldMaxLength': { tr: 'En fazla karakter (isteğe bağlı)', en: 'Max characters (optional)' },
  'workflow.build.noSteps': { tr: 'Henüz adım eklenmedi.', en: 'No steps added yet.' },
  'workflow.build.triggerEvent': { tr: 'Ne zaman tetiklensin', en: 'When to trigger' },
  'workflow.build.conditions': { tr: 'Koşullar', en: 'Conditions' },
  'workflow.build.conditionsHelp': {
    tr: 'Tüm koşullar sağlanırsa süreç başlar. Boş bırakılırsa koşulsuz tetiklenir.',
    en: 'The process starts when all conditions are met. Leave empty to trigger unconditionally.'
  },
  'workflow.build.addCondition': { tr: 'Koşul Ekle', en: 'Add Condition' },
  'workflow.build.conditionField': { tr: 'Alan', en: 'Field' },
  'workflow.build.conditionOperator': { tr: 'Operatör', en: 'Operator' },
  'workflow.build.conditionValue': { tr: 'Değer', en: 'Value' },
  'workflow.build.noConditions': { tr: 'Koşul yok — her kayıtta tetiklenir.', en: 'No conditions — triggers on every record.' },
  'workflow.build.save': { tr: 'Kaydet', en: 'Save' },
  'workflow.build.saveAndPublish': { tr: 'Kaydet ve Yayınla', en: 'Save and Publish' },
  'workflow.build.saveFailed': { tr: 'Akış kaydedilemedi.', en: 'Workflow could not be saved.' },
  'workflow.build.loadFailed': { tr: 'Akış yüklenemedi.', en: 'Workflow could not be loaded.' },
  'workflow.build.serverError': { tr: 'Sunucuya ulaşılamadı.', en: 'Could not reach the server.' },
  'workflow.build.leaveTitle': { tr: 'Kaydedilmemiş değişiklikler', en: 'Unsaved changes' },
  'workflow.build.leaveMessage': {
    tr: 'Akışta kaydetmediğiniz değişiklikler var. Kaydetmeden ayrılırsanız bu değişiklikler kaybolur.',
    en: 'This workflow has changes you have not saved. If you leave without saving, they will be lost.'
  },
  'workflow.build.leaveConfirm': { tr: 'Kaydetmeden ayrıl', en: 'Leave without saving' },

  // ── my-tasks ──────────────────────────────────────────────────────────────
  'task.list.title': { tr: 'Görevlerim', en: 'My Tasks' },
  'task.list.colTask': { tr: 'Görev', en: 'Task' },
  'task.list.colWorkflow': { tr: 'Akış', en: 'Workflow' },
  'task.list.colRecord': { tr: 'Kayıt', en: 'Record' },
  'task.list.colAssigned': { tr: 'Atanan', en: 'Assigned to' },
  'task.list.colDue': { tr: 'Süre', en: 'Due' },
  'task.list.noDue': { tr: 'Süresiz', en: 'No deadline' },
  'task.list.overdue': { tr: 'Gecikmiş', en: 'Overdue' },
  'task.list.open': { tr: 'Aç', en: 'Open' },
  'task.list.emptyTitle': { tr: 'Bekleyen göreviniz yok', en: 'You have no pending tasks' },
  'task.list.emptyHint': {
    tr: 'Size veya rolünüze bir onay düştüğünde burada görünecek.',
    en: 'Approvals assigned to you or your role will appear here.'
  },
  'task.list.loadFailed': { tr: 'Görevler yüklenemedi.', en: 'Tasks could not be loaded.' },
  'task.list.serverError': { tr: 'Sunucuya ulaşılamadı.', en: 'Could not reach the server.' },
  'task.list.refresh': { tr: 'Yenile', en: 'Refresh' },

  // ── task-detail ───────────────────────────────────────────────────────────
  'task.detail.title': { tr: 'Görev', en: 'Task' },
  'task.detail.back': { tr: 'Görevlerime dön', en: 'Back to my tasks' },
  'task.detail.record': { tr: 'İlgili kayıt', en: 'Related record' },
  'task.detail.openRecord': { tr: 'Kaydı aç', en: 'Open record' },
  'task.detail.process': { tr: 'Süreç', en: 'Process' },
  'task.detail.viewProcess': { tr: 'Süreci görüntüle', en: 'View process' },
  'task.detail.form': { tr: 'Onay formu', en: 'Approval form' },
  'task.detail.comment': { tr: 'Açıklama', en: 'Comment' },
  'task.detail.approve': { tr: 'Onayla', en: 'Approve' },
  'task.detail.reject': { tr: 'Reddet', en: 'Reject' },
  'task.detail.timeline': { tr: 'Süreç geçmişi', en: 'Process history' },
  'task.detail.alreadyClosed': { tr: 'Bu görev sonuçlandırılmış.', en: 'This task has been resolved.' },
  'task.detail.decision': { tr: 'Karar', en: 'Decision' },
  'task.detail.loadFailed': { tr: 'Görev yüklenemedi.', en: 'Task could not be loaded.' },
  'task.detail.serverError': { tr: 'Sunucuya ulaşılamadı.', en: 'Could not reach the server.' },
  'task.detail.submitFailed': { tr: 'Görev sonuçlandırılamadı.', en: 'The task could not be resolved.' },
  'task.detail.tooLong': { tr: 'En fazla {max} karakter.', en: 'At most {max} characters.' },
  'task.detail.adminActions': { tr: 'Yönetici İşlemleri', en: 'Administrator Actions' },
  'task.detail.adminActionsHelp': {
    tr: 'Atlama ve yeniden atama denetim kaydına ayrı olarak işlenir.',
    en: 'Skipping and reassignment are recorded separately in the audit log.'
  },
  'task.detail.reassign': { tr: 'Yeniden Ata', en: 'Reassign' },
  'task.detail.reassignSelect': { tr: 'Devredilecek rolü seçin', en: 'Select a role to hand over to' },
  'task.detail.skip': { tr: 'Adımı Atla', en: 'Skip Step' },
  'task.detail.skipConfirmTitle': { tr: 'Adımı atla', en: 'Skip step' },
  'task.detail.skipConfirm': {
    tr: '{name} adımı atlanacak ve süreç bir sonraki adıma geçecek. Bu bir onay DEĞİLDİR ve denetim kaydında ayrıca görünür.',
    en: 'The step {name} will be skipped and the process moves on. This is NOT an approval and appears separately in the audit log.'
  },
  'task.detail.selectOption': { tr: 'Seçiniz', en: 'Select' },
  'task.detail.completeOnRecord': {
    tr: 'Bu adım kayıttaki alanların doldurulmasını istiyor; ilerletme kaydın ekranından yapılır.',
    en: 'This step requires fields on the record to be filled; advance it from the record screen.'
  },

  // ── Kayıt ekranı: form tabanlı akış (başlat, adım butonları, kilit) ───────
  'workflow.record.startNamed': { tr: '{name} Başlat', en: 'Start {name}' },
  'workflow.record.inProcess': { tr: 'Onay sürecinde', en: 'In approval' },
  'workflow.record.currentStep': { tr: '{workflow} · Adım: {step}', en: '{workflow} · Step: {step}' },
  'workflow.record.locked': {
    tr: 'Kayıt kilitli — sırası gelen kişi kendi alanlarını doldurup ilerletecek.',
    en: 'The record is locked — the current assignee will fill in their fields and advance it.'
  },
  'workflow.record.yourTurn': {
    tr: 'Sıra sizde — vurgulu alanları doldurup adım butonuyla ilerletin.',
    en: 'Your turn — fill in the highlighted fields and advance with the step button.'
  },
  'workflow.record.adminBypass': {
    tr: 'Yönetici olarak kilitli kaydı düzenliyorsunuz.',
    en: 'You are editing a locked record as an administrator.'
  },
  'workflow.record.savedButStartFailed': {
    tr: 'Kayıt kaydedildi ancak süreç başlatılamadı: {message}',
    en: 'The record was saved but the process could not be started: {message}'
  },
  'workflow.record.requiredForStep': {
    tr: 'Bu adımı ilerletmek için şu alanlar doldurulmalı: {fields}',
    en: 'These fields must be filled to advance this step: {fields}'
  },
  'workflow.record.stepDone': { tr: 'Adım tamamlandı.', en: 'Step completed.' },
  'workflow.record.unsavedDiscarded': {
    tr: 'Formdaki kaydedilmemiş değişiklikler bu işlemle kaydedilmez.',
    en: 'Unsaved changes on the form are not saved by this action.'
  },

  // ── workflow-instance (süreç detayı) ──────────────────────────────────────
  'workflow.instance.title': { tr: 'Süreç Detayı', en: 'Process Detail' },
  'workflow.instance.back': { tr: 'İş akışlarına dön', en: 'Back to workflows' },
  'workflow.instance.status': { tr: 'Durum', en: 'Status' },
  'workflow.instance.currentStep': { tr: 'Açık adım', en: 'Current step' },
  'workflow.instance.startedAt': { tr: 'Başlangıç', en: 'Started' },
  'workflow.instance.completedAt': { tr: 'Bitiş', en: 'Completed' },
  'workflow.instance.steps': { tr: 'Adımlar ve görevler', en: 'Steps and tasks' },
  'workflow.instance.parallel': { tr: 'Paralel', en: 'Parallel' },
  'workflow.instance.bySystem': { tr: 'Sistem', en: 'System' },
  'workflow.instance.verifyChain': { tr: 'Zinciri Doğrula', en: 'Verify Chain' },
  'workflow.instance.chainValid': {
    tr: 'Olay günlüğü bütünlüğü doğrulandı ({count} kayıt).',
    en: 'Event log integrity verified ({count} entries).'
  },
  'workflow.instance.chainBroken': {
    tr: 'Olay günlüğü zinciri {id} numaralı kayıtta bozuk.',
    en: 'The event log chain is broken at entry {id}.'
  },
  'workflow.instance.rollback': { tr: 'Geri Alma', en: 'Rollback' },
  'workflow.instance.rollbackHelp': {
    tr: 'Süreci daha önceki bir adıma döndürür; açık görevler iptal edilir.',
    en: 'Returns the process to an earlier step; open tasks are cancelled.'
  },
  'workflow.instance.rollbackSelect': { tr: 'Hedef adım seçin', en: 'Select target step' },
  'workflow.instance.rollbackAction': { tr: 'Geri Al', en: 'Roll Back' },
  'workflow.instance.rollbackConfirmTitle': { tr: 'Süreci geri al', en: 'Roll back process' },
  'workflow.instance.rollbackConfirm': {
    tr: 'Süreç {step} adımına geri alınacak ve açık görevler iptal edilecek.',
    en: 'The process will be rolled back to step {step} and open tasks will be cancelled.'
  },
  'workflow.instance.rollbackDataWarning': {
    tr: 'Dikkat: yalnızca akış konumu geri alınır. Sonraki adımların kayda yazdığı veriler KORUNUR.',
    en: 'Note: only the flow position is reverted. Data written to the record by later steps is PRESERVED.'
  },
  'workflow.instance.loadFailed': { tr: 'Süreç yüklenemedi.', en: 'Process could not be loaded.' },
  'workflow.instance.serverError': { tr: 'Sunucuya ulaşılamadı.', en: 'Could not reach the server.' },

  // ── Süreç şeması (çalışan süreç katmanı) ──────────────────────────────────
  'workflow.runtime.diagram': { tr: 'Süreç şeması', en: 'Process diagram' },
  'workflow.runtime.legend': { tr: 'Şema renkleri', en: 'Diagram colors' },
  'workflow.runtime.hint': {
    tr: 'Şema sürecin başladığı sürümden çizilir; renkler izlenen yolu gösterir. Yakınlaşmak için Ctrl + tekerlek, kaydırmak için boş zemini sürükleyin.',
    en: 'The diagram is drawn from the version the process started on; colors show the path taken. Ctrl + wheel to zoom, drag the empty background to pan.'
  },
  'workflow.runtime.passed': { tr: 'Geçildi', en: 'Passed' },
  'workflow.runtime.waiting': { tr: 'Bekliyor', en: 'Waiting' },
  'workflow.runtime.waitingFor': { tr: 'Bekliyor: {who}', en: 'Waiting: {who}' },
  'workflow.runtime.failed': { tr: 'Hata', en: 'Error' },
  'workflow.runtime.ended': { tr: 'Sonlandı', en: 'Ended' },
  'workflow.runtime.notReached': { tr: 'Ulaşılmadı', en: 'Not reached' },
  'workflow.runtime.takenPath': { tr: 'İzlenen yol', en: 'Path taken' },

  // ── Olay (incident) bandı ─────────────────────────────────────────────────
  'workflow.incident.title': {
    tr: '"{step}" adımı hata verdi — süreç bekliyor',
    en: 'Step "{step}" failed — the process is waiting'
  },
  'workflow.incident.adminOnly': {
    tr: 'Yöneticiniz hatayı giderip süreci sürdürebilir.',
    en: 'An administrator can fix the error and resume the process.'
  },
  'workflow.incident.retry': { tr: 'Yeniden dene', en: 'Retry' },
  'workflow.incident.skip': { tr: 'Adımı atla', en: 'Skip step' },
  'workflow.incident.retried': { tr: 'Adım yeniden çalıştırıldı.', en: 'The step was run again.' },
  'workflow.incident.skipped': { tr: 'Adım atlandı, süreç devam ediyor.', en: 'Step skipped, the process continues.' },
  'workflow.incident.skipConfirmTitle': { tr: 'Adımı atla', en: 'Skip step' },
  'workflow.incident.skipConfirm': {
    tr: '"{step}" adımı çalıştırılmadan atlanacak ve süreç sonraki yolundan (koşulda varsayılan yoldan) devam edecek.',
    en: 'Step "{step}" will be skipped without running and the process will continue on its next path (the default path for a condition).'
  },

  // ── Süreç listesi (admin) ─────────────────────────────────────────────────
  'workflow.instances.title': { tr: 'Süreçler', en: 'Processes' },
  'workflow.instances.all': { tr: 'Tümü', en: 'All' },
  'workflow.instances.workflow': { tr: 'Akış', en: 'Workflow' },
  'workflow.instances.model': { tr: 'Model', en: 'Model' },
  'workflow.instances.incidentOnly': { tr: 'Yalnız hata bekleyenler', en: 'Only processes with errors' },
  'workflow.instances.incident': { tr: 'Hata', en: 'Error' },
  'workflow.instances.empty': { tr: 'Bu filtreye uyan süreç yok.', en: 'No processes match this filter.' },
  'workflow.instances.count': { tr: 'Toplam {total} süreç', en: '{total} processes in total' },

  // ── workflow-versions (sürüm geçmişi) ─────────────────────────────────────
  'workflow.versions.title': { tr: 'Sürüm Geçmişi', en: 'Version History' },
  'workflow.versions.colVersion': { tr: 'Sürüm', en: 'Version' },
  'workflow.versions.colStatus': { tr: 'Durum', en: 'Status' },
  'workflow.versions.colCreated': { tr: 'Oluşturma', en: 'Created' },
  'workflow.versions.view': { tr: 'Görüntüle', en: 'View' },
  'workflow.versions.empty': { tr: 'Bu akışın sürüm geçmişi yok.', en: 'This workflow has no version history.' },
  'workflow.versions.hint': {
    tr: 'Yayınlanan her sürüm değişmezdir; çalışan süreçler başladıkları sürümde devam eder.',
    en: 'Every published version is immutable; running processes continue on the version they started with.'
  },
  'workflow.versions.loadFailed': { tr: 'Sürümler yüklenemedi.', en: 'Versions could not be loaded.' },

  // ── Ortak sözlükler ───────────────────────────────────────────────────────
  'workflow.status.Draft': { tr: 'Taslak', en: 'Draft' },
  'workflow.status.Published': { tr: 'Yayında', en: 'Published' },
  'workflow.status.Archived': { tr: 'Arşiv', en: 'Archived' },

  'workflow.instance.Running': { tr: 'Devam ediyor', en: 'Running' },
  'workflow.instance.Completed': { tr: 'Tamamlandı', en: 'Completed' },
  'workflow.instance.Rejected': { tr: 'Reddedildi', en: 'Rejected' },
  'workflow.instance.Cancelled': { tr: 'İptal edildi', en: 'Cancelled' },
  'workflow.instance.Failed': { tr: 'Hata', en: 'Failed' },

  'workflow.task.Pending': { tr: 'Bekliyor', en: 'Pending' },
  'workflow.task.Completed': { tr: 'Onaylandı', en: 'Approved' },
  'workflow.task.Rejected': { tr: 'Reddedildi', en: 'Rejected' },
  'workflow.task.Skipped': { tr: 'Atlandı', en: 'Skipped' },
  'workflow.task.Expired': { tr: 'Süresi doldu', en: 'Expired' },
  'workflow.task.Cancelled': { tr: 'İptal edildi', en: 'Cancelled' },

  'workflow.trigger.onCreate': { tr: 'Kayıt oluşturulunca', en: 'When a record is created' },
  'workflow.trigger.onUpdate': { tr: 'Kayıt güncellenince', en: 'When a record is updated' },
  'workflow.trigger.manual': { tr: 'Elle başlatılınca', en: 'When started manually' },

  'workflow.assign.role': { tr: 'Role', en: 'To a role' },
  'workflow.assign.user': { tr: 'Kullanıcıya', en: 'To a user' },
  'workflow.assign.creator': { tr: 'Kaydı oluşturana', en: 'To the record creator' },

  'workflow.join.all': { tr: 'Tüm dallar onaylamalı', en: 'All branches must approve' },
  'workflow.join.any': { tr: 'Herhangi bir dal yeter', en: 'Any single branch suffices' },

  'workflow.timeout.escalate': { tr: 'Üst amire bildir', en: 'Notify the supervisor' },
  'workflow.timeout.autoApprove': { tr: 'Otomatik onayla', en: 'Auto-approve' },
  'workflow.timeout.autoReject': { tr: 'Otomatik reddet', en: 'Auto-reject' },

  'workflow.event.InstanceStarted': { tr: 'Süreç başladı', en: 'Process started' },
  'workflow.event.StepEntered': { tr: 'Adıma girildi', en: 'Entered step' },
  'workflow.event.TaskCreated': { tr: 'Görev oluşturuldu', en: 'Task created' },
  'workflow.event.TaskCompleted': { tr: 'Görev onaylandı', en: 'Task approved' },
  'workflow.event.TaskRejected': { tr: 'Görev reddedildi', en: 'Task rejected' },
  'workflow.event.TaskSkipped': { tr: 'Görev atlandı', en: 'Task skipped' },
  'workflow.event.TaskExpired': { tr: 'Görev süresi doldu', en: 'Task expired' },
  'workflow.event.TaskEscalated': { tr: 'Görev yükseltildi', en: 'Task escalated' },
  'workflow.event.TaskReassigned': { tr: 'Görev yeniden atandı', en: 'Task reassigned' },
  'workflow.event.InstanceCompleted': { tr: 'Süreç tamamlandı', en: 'Process completed' },
  'workflow.event.InstanceRejected': { tr: 'Süreç reddedildi', en: 'Process rejected' },
  'workflow.event.InstanceCancelled': { tr: 'Süreç iptal edildi', en: 'Process cancelled' },
  'workflow.event.InstanceFailed': { tr: 'Süreç hataya düştü', en: 'Process failed' },
  'workflow.event.RolledBack': { tr: 'Geri alındı', en: 'Rolled back' },

  // ── Kayıt detayındaki Süreç paneli ────────────────────────────────────────
  'workflow.panel.title': { tr: 'Süreç', en: 'Process' },
  'workflow.panel.start': { tr: 'Süreci Başlat', en: 'Start Process' },
  'workflow.panel.startSuccess': { tr: 'Süreç başlatıldı.', en: 'Process started.' },
  'workflow.panel.none': { tr: 'Bu kayıt için süreç yok.', en: 'No process for this record.' },
  'workflow.panel.cancel': { tr: 'Süreci İptal Et', en: 'Cancel Process' },
  'workflow.panel.cancelConfirmTitle': { tr: 'Süreci iptal et', en: 'Cancel process' },
  'workflow.panel.cancelConfirm': {
    tr: 'Süreç iptal edilecek ve açık görevler kapatılacak.',
    en: 'The process will be cancelled and open tasks closed.'
  },

  // ── Silinenler ekranı (deleted-list ile paylaşılan sözleşme) ──────────────
  'deleted.workflows.backLink': { tr: 'İş akışlarına dön', en: 'Back to workflows' },
  'deleted.workflows.title': { tr: 'Silinmiş İş Akışları', en: 'Deleted Workflows' },
  'deleted.workflows.refresh': { tr: 'Yenile', en: 'Refresh' },
  'deleted.workflows.loadingAria': { tr: 'Silinmiş akışlar yükleniyor', en: 'Loading deleted workflows' },
  'deleted.workflows.loading': { tr: 'Yükleniyor…', en: 'Loading…' },
  'deleted.workflows.empty': { tr: 'Silinmiş iş akışı yok', en: 'No deleted workflows' },
  'deleted.workflows.emptyHint': {
    tr: 'Silinen akışlar burada listelenir ve geri yüklenebilir.',
    en: 'Deleted workflows are listed here and can be restored.'
  },
  'deleted.workflows.countSuffix': { tr: 'akış', en: 'workflows' },
  'deleted.workflows.loadFailed': { tr: 'Silinmiş akışlar yüklenemedi.', en: 'Deleted workflows could not be loaded.' },
  'deleted.workflows.restoreConfirm': {
    tr: '{name} akışı geri yüklenecek.',
    en: 'The workflow {name} will be restored.'
  },
  'deleted.workflows.restoreConfirmTitle': { tr: 'Akışı geri yükle', en: 'Restore workflow' },
  'deleted.workflows.restoreSuccess': { tr: 'Akış geri yüklendi.', en: 'Workflow restored.' }
};
