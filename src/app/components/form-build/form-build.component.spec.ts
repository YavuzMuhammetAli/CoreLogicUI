import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { FormBuildComponent } from './form-build.component';

describe('FormBuildComponent', () => {
  let component: FormBuildComponent;
  let fixture: ComponentFixture<FormBuildComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormBuildComponent],
      // Bilesenler servisleri uzerinden HttpClient'a baglidir; app.config.ts'teki
      // provideHttpClient TestBed'de otomatik gelmez.
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FormBuildComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
