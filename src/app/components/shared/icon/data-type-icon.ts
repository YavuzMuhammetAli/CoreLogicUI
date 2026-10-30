import type { IconName } from './icons.generated';

/** Kolon veri tipinin ikonu (ekran tasarımcısı paleti vb.). Bilinmeyen tip → metin. */
export function dataTypeIcon(dataType: string | null | undefined): IconName {
  switch ((dataType ?? '').toLowerCase()) {
    case 'int': case 'long': case 'short': case 'byte':
    case 'decimal': case 'double': case 'float':
      return '123';
    case 'boolean': return 'toggle_on';
    case 'datetime': case 'dateonly': return 'calendar_today';
    case 'timeonly': return 'schedule';
    case 'guid': return 'key';
    case 'lookup': return 'link';
    case 'enum': return 'list';
    case 'image': return 'image';
    case 'file': return 'attach_file';
    case 'text': return 'notes';
    default: return 'text_fields';
  }
}
