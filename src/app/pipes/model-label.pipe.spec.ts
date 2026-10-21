import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import { PublishedModel } from '../services/published-model.service';
import { RecordMetadataService } from '../services/record-metadata.service';
import { ModelLabelPipe } from './model-label.pipe';

@Component({
  standalone: true,
  imports: [ModelLabelPipe],
  template: `<span>{{ 'SatinalmaTalebi' | modelLabel }}</span>|<span>{{ 'Etiketsiz' | modelLabel }}</span>|<span>{{ '' | modelLabel }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
class OnPushHostComponent {}

const MODELS: PublishedModel[] = [
  { typeName: 'SatinalmaTalebi', label: ' Satınalma Talebi ', columns: [] },
  { typeName: 'Etiketsiz', label: null, columns: [] }
];

function setup(models$: Observable<PublishedModel[]>) {
  TestBed.configureTestingModule({
    imports: [OnPushHostComponent],
    providers: [{ provide: RecordMetadataService, useValue: { models$: () => models$ } }]
  });
  const fixture = TestBed.createComponent(OnPushHostComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ModelLabelPipe', () => {
  it('etiketi gösterir; etiketsiz modelde tablo adına, boş girdide boşa düşer', () => {
    // of(): önbellek doluyken olduğu gibi SENKRON döner — şablon içinde sinyal yazımı patlamamalı.
    const fixture = setup(of(MODELS));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toBe('Satınalma Talebi|Etiketsiz|');
  });

  it('etiketler geç gelince OnPush bileşen de tazelenir', () => {
    const models$ = new Subject<PublishedModel[]>();
    const fixture = setup(models$);
    expect(fixture.nativeElement.textContent).toBe('SatinalmaTalebi|Etiketsiz|');

    models$.next(MODELS);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toBe('Satınalma Talebi|Etiketsiz|');
  });
});
