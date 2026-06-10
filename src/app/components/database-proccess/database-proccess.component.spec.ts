import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DatabaseProccessComponent } from './database-proccess.component';

describe('DatabaseProccessComponent', () => {
  let component: DatabaseProccessComponent;
  let fixture: ComponentFixture<DatabaseProccessComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatabaseProccessComponent]
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
