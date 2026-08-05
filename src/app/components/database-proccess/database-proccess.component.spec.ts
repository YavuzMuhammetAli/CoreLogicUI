import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { DatabaseProccessComponent } from './database-proccess.component';

describe('DatabaseProccessComponent', () => {
  let component: DatabaseProccessComponent;
  let fixture: ComponentFixture<DatabaseProccessComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatabaseProccessComponent],
      // Bilesenler servisleri uzerinden HttpClient'a baglidir; app.config.ts'teki
      // provideHttpClient TestBed'de otomatik gelmez.
      providers: [provideHttpClient(), provideHttpClientTesting()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DatabaseProccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
