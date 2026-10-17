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
    tr: 'Ayrıntıları düzenlemek için adıma çift tıklayın. Adımı gövdesinden sürükleyerek taşıyın. Bağlantı için alt kenardaki yeşil (onay) ya da kırmızı (red) noktadan hedef adıma sürükleyin. Yakınlaşmak için Ctrl + tekerlek, kaydırmak için boş zemini sürükleyin.',
    en: 'Double-click a step to edit its details. Drag a step by its body to move it. To connect, drag from the green (approve) or red (reject) dot at the bottom edge onto the target step. Ctrl + wheel to zoom, drag the empty background to pan.'
  },
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
  'workflow.build.tabPreview': { tr: 'Önizleme', en: 'Preview' },
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
  'workflow.build.typeApproval': { tr: 'Tekil onay', en: 'Single approval' },
  'workflow.build.typeParallel': { tr: 'Paralel onay', en: 'Parallel approval' },
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
  'workflow.build.validationTitle': { tr: 'Tanım sorunları', en: 'Definition issues' },
  'workflow.build.validationOk': { tr: 'Tanım geçerli.', en: 'The definition is valid.' },
  'workflow.build.saveFailed': { tr: 'Akış kaydedilemedi.', en: 'Workflow could not be saved.' },
  'workflow.build.loadFailed': { tr: 'Akış yüklenemedi.', en: 'Workflow could not be loaded.' },
  'workflow.build.serverError': { tr: 'Sunucuya ulaşılamadı.', en: 'Could not reach the server.' },
  'workflow.build.previewEmpty': { tr: 'Önizleme için en az bir adım ekleyin.', en: 'Add at least one step to preview.' },
  'workflow.build.previewAria': { tr: 'Akış şeması', en: 'Workflow diagram' },

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
