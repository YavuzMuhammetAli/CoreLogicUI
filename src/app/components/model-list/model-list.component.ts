import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ModelRegistryService, RegisteredModel } from '../../services/model-registry.service';

@Component({
  selector: 'app-model-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './model-list.component.html',
  styleUrls: ['./model-list.component.scss']
})
export class ModelListComponent implements OnInit {
  models: RegisteredModel[] = [];

  constructor(private registry: ModelRegistryService) {}

  ngOnInit(): void {
    this.models = this.registry.list();
  }

  removeModel(typeName: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (confirm(`"${typeName}" modelini listeden kaldırmak istediğinize emin misiniz?`)) {
      this.registry.remove(typeName);
      this.models = this.registry.list();
    }
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }
}
