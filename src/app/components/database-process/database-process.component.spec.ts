import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { DatabaseProcessComponent } from './database-process.component';

describe('DatabaseProcessComponent', () => {
  let component: DatabaseProcessComponent;
  let fixture: ComponentFixture<DatabaseProcessComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatabaseProcessComponent],
      // Components depend on HttpClient through their services; provideHttpClient from
      // app.config.ts is not provided automatically in TestBed.
      providers: [provideHttpClient(), provideHttpClientTesting()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DatabaseProcessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
