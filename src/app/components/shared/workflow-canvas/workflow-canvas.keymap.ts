/**
 * Tasarımcı klavye kısayolları — SAF eşleme, DOM yok.
 *
 * Kısayol bir yazı alanında (input, textarea, select, contenteditable) basıldıysa
 * HİÇBİR komut çalışmaz: orada Ctrl+Z tarayıcının metin geri alması, Delete ve
 * oklar metin düzenlemesidir.
 */
export type DesignerCommand =
  | 'undo' | 'redo'
  | 'delete' | 'copy' | 'paste' | 'duplicate' | 'selectAll'
  | 'escape' | 'open'
  | 'fit' | 'zoomIn' | 'zoomOut'
  | 'nudgeLeft' | 'nudgeRight' | 'nudgeUp' | 'nudgeDown';

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface KeyCommand {
  command: DesignerCommand;
  /** Ok tuşlarında Shift: ızgara adımı kadar it. */
  large: boolean;
}

/** Tuş birleşimini komuta çevirir; tanınmayan birleşimde null. */
export function commandFor(event: KeyInput): KeyCommand | null {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const of = (command: DesignerCommand): KeyCommand => ({ command, large: event.shiftKey });

  if (mod && !event.altKey) {
    switch (key) {
      case 'z': return of(event.shiftKey ? 'redo' : 'undo');
      case 'y': return of('redo');
      case 'c': return of('copy');
      case 'v': return of('paste');
      case 'd': return of('duplicate');
      case 'a': return of('selectAll');
      default:  return null;
    }
  }

  if (mod || event.altKey) return null;

  switch (key) {
    case 'Delete':
    case 'Backspace':  return of('delete');
    case 'Escape':     return of('escape');
    case 'Enter':      return of('open');
    case 'f':          return of('fit');
    case '+':
    case '=':          return of('zoomIn');
    case '-':          return of('zoomOut');
    case 'ArrowLeft':  return of('nudgeLeft');
    case 'ArrowRight': return of('nudgeRight');
    case 'ArrowUp':    return of('nudgeUp');
    case 'ArrowDown':  return of('nudgeDown');
    default:           return null;
  }
}

/**
 * Olay, Enter'ı kendisi kullanan bir öğeden mi geliyor (düğme, bağlantı, menü
 * öğesi)? Odak "Sığdır" düğmesindeyken Enter hem düğmeye basıp hem seçili
 * adımın pop-up'ını açmasın.
 */
export function isActivationTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== 'string') return false;

  const element = target as HTMLElement;
  const tag = element.tagName.toLowerCase();
  if (tag === 'button' || tag === 'summary' || (tag === 'a' && element.hasAttribute('href'))) return true;

  const role = element.getAttribute('role');
  return role === 'button' || role === 'menuitem' || role === 'link' || role === 'tab';
}

/** Olay bir yazı alanından mı geliyor? (Kısayollar orada devre dışı.) */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== 'string') return false;

  const element = target as HTMLElement;
  const tag = element.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    // Onay kutusu ve düğme benzeri girdiler yazı alanı değildir.
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  return element.isContentEditable === true;
}
