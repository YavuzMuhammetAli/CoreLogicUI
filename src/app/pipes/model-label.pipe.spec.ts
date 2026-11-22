import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import { PublishedModel } from '../services/published-model.service';
import { RecordMetadataService } from '../services/record-metadata.service';
import { ModelLabelPipe } from './model-label.pipe';

@Component({
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
  it('shows the label; falls back to the table name for a model without a label, and to empty for empty input', () => {
    // of(): returns SYNCHRONOUSLY, as when the cache is filled — a signal write inside the template must not blow up.
    const fixture = setup(of(MODELS));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toBe('Satınalma Talebi|Etiketsiz|');
  });

  it('an OnPush component also refreshes when the labels arrive late', () => {
    const models$ = new Subject<PublishedModel[]>();
    const fixture = setup(models$);
    expect(fixture.nativeElement.textContent).toBe('SatinalmaTalebi|Etiketsiz|');

    models$.next(MODELS);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toBe('Satınalma Talebi|Etiketsiz|');
  });
});
