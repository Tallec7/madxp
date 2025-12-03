import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Configuration } from '../../interfaces/configuration.interface';
import { SocketService } from '../../services/socket.service';

interface ProgramItem {
  id: string;
  videoPath: string;
  videoName: string;
  category: string;
  subcategory: string;
  duration?: number; // durée estimée en secondes
}

interface Program {
  id: string;
  name: string;
  type: 'pre-match' | 'half-time' | 'post-match';
  items: ProgramItem[];
  autoPlay: boolean;
  loop: boolean;
}

@Component({
  selector: 'app-program',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './program.component.html',
  styleUrl: './program.component.scss'
})
export class ProgramComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly socketService = inject(SocketService);

  public configuration!: Configuration;
  public programs: Program[] = [];
  public selectedProgram: Program | null = null;
  public isCreatingProgram = false;
  public isEditingProgram = false;
  public currentlyPlayingProgram: string | null = null;

  // Pour la sélection de vidéos
  public availableCategories: string[] = [];
  public selectedCategory: string | null = null;
  public selectedSubCategory: string | null = null;
  public availableVideos: { name: string; path: string }[] = [];

  // Drag & Drop
  public draggedItemIndex: number | null = null;

  public ngOnInit(): void {
    const data = this.route.snapshot.data['configuration'] as Configuration;
    this.configuration = data;
    this.loadAvailableCategories();
    this.loadPrograms();
    this.initializeDefaultPrograms();
  }

  private loadAvailableCategories(): void {
    this.availableCategories = Object.keys(this.configuration);
  }

  private loadPrograms(): void {
    const saved = localStorage.getItem('neopro_programs');
    if (saved) {
      this.programs = JSON.parse(saved);
    }
  }

  public savePrograms(): void {
    localStorage.setItem('neopro_programs', JSON.stringify(this.programs));
  }

  private initializeDefaultPrograms(): void {
    if (this.programs.length === 0) {
      // Créer les 3 programmes par défaut s'ils n'existent pas
      this.programs = [
        {
          id: 'pre-match-' + Date.now(),
          name: 'Avant-Match',
          type: 'pre-match',
          items: [],
          autoPlay: false,
          loop: false
        },
        {
          id: 'half-time-' + Date.now(),
          name: 'Mi-Temps',
          type: 'half-time',
          items: [],
          autoPlay: false,
          loop: false
        },
        {
          id: 'post-match-' + Date.now(),
          name: 'Fin de Match',
          type: 'post-match',
          items: [],
          autoPlay: false,
          loop: false
        }
      ];
      this.savePrograms();
    }
  }

  public selectProgram(program: Program): void {
    this.selectedProgram = program;
    this.isEditingProgram = false;
    this.resetVideoSelection();
  }

  public createNewProgram(): void {
    this.isCreatingProgram = true;
    this.selectedProgram = {
      id: 'custom-' + Date.now(),
      name: 'Nouveau Programme',
      type: 'pre-match',
      items: [],
      autoPlay: false,
      loop: false
    };
  }

  public saveNewProgram(): void {
    if (this.selectedProgram) {
      this.programs.push(this.selectedProgram);
      this.savePrograms();
      this.isCreatingProgram = false;
    }
  }

  public cancelNewProgram(): void {
    this.isCreatingProgram = false;
    this.selectedProgram = null;
  }

  public deleteProgram(program: Program): void {
    const defaultPrograms = ['Avant-Match', 'Mi-Temps', 'Fin de Match'];
    if (defaultPrograms.includes(program.name)) {
      if (!confirm(`Êtes-vous sûr de vouloir supprimer le programme "${program.name}" ?`)) {
        return;
      }
    }

    this.programs = this.programs.filter(p => p.id !== program.id);
    this.savePrograms();

    if (this.selectedProgram?.id === program.id) {
      this.selectedProgram = null;
    }
  }

  public editProgram(): void {
    this.isEditingProgram = true;
  }

  public saveProgramEdit(): void {
    this.isEditingProgram = false;
    this.savePrograms();
  }

  // Sélection de catégorie pour ajouter des vidéos
  public onCategorySelect(category: string): void {
    this.selectedCategory = category;
    this.selectedSubCategory = null;
    this.availableVideos = [];
  }

  public onSubCategorySelect(subcategory: string): void {
    this.selectedSubCategory = subcategory;
    this.loadVideosForSubCategory();
  }

  private loadVideosForSubCategory(): void {
    if (!this.selectedCategory || !this.selectedSubCategory) {
      return;
    }

    const categoryData = (this.configuration as any)[this.selectedCategory];
    const subcategoryData = categoryData[this.selectedSubCategory];

    if (Array.isArray(subcategoryData)) {
      this.availableVideos = subcategoryData.map((video: any) => ({
        name: video.name,
        path: video.path
      }));
    } else {
      this.availableVideos = [];
    }
  }

  public addVideoToProgram(video: { name: string; path: string }): void {
    if (!this.selectedProgram || !this.selectedCategory || !this.selectedSubCategory) {
      return;
    }

    const item: ProgramItem = {
      id: Date.now() + '-' + Math.random(),
      videoPath: video.path,
      videoName: video.name,
      category: this.selectedCategory,
      subcategory: this.selectedSubCategory,
      duration: 0 // On pourrait estimer la durée si nécessaire
    };

    this.selectedProgram.items.push(item);
    this.savePrograms();
  }

  public removeItemFromProgram(itemId: string): void {
    if (!this.selectedProgram) {
      return;
    }

    this.selectedProgram.items = this.selectedProgram.items.filter(item => item.id !== itemId);
    this.savePrograms();
  }

  public moveItemUp(index: number): void {
    if (!this.selectedProgram || index === 0) {
      return;
    }

    const items = this.selectedProgram.items;
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    this.savePrograms();
  }

  public moveItemDown(index: number): void {
    if (!this.selectedProgram || index === this.selectedProgram.items.length - 1) {
      return;
    }

    const items = this.selectedProgram.items;
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    this.savePrograms();
  }

  // Drag & Drop
  public onDragStart(index: number): void {
    this.draggedItemIndex = index;
  }

  public onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  public onDrop(event: DragEvent, dropIndex: number): void {
    event.preventDefault();

    if (this.draggedItemIndex === null || !this.selectedProgram) {
      return;
    }

    const items = this.selectedProgram.items;
    const draggedItem = items[this.draggedItemIndex];

    items.splice(this.draggedItemIndex, 1);
    items.splice(dropIndex, 0, draggedItem);

    this.draggedItemIndex = null;
    this.savePrograms();
  }

  public onDragEnd(): void {
    this.draggedItemIndex = null;
  }

  // Lecture du programme
  public playProgram(program: Program): void {
    if (program.items.length === 0) {
      alert('Ce programme ne contient aucune vidéo');
      return;
    }

    this.currentlyPlayingProgram = program.id;

    // Envoyer chaque vidéo séquentiellement via Socket.IO
    this.playProgramSequence(program, 0);
  }

  private playProgramSequence(program: Program, index: number): void {
    if (index >= program.items.length) {
      // Fin du programme
      this.currentlyPlayingProgram = null;

      if (program.loop) {
        // Recommencer depuis le début
        this.playProgramSequence(program, 0);
      }
      return;
    }

    const item = program.items[index];
    this.socketService.sendCommand({
      type: 'video',
      data: item.videoPath
    });

    // Attendre un délai estimé avant de jouer la suivante
    // (dans une vraie implémentation, on attendrait un event "video-ended" du serveur)
    const estimatedDuration = item.duration || 30; // 30 secondes par défaut
    setTimeout(() => {
      if (this.currentlyPlayingProgram === program.id) {
        this.playProgramSequence(program, index + 1);
      }
    }, estimatedDuration * 1000);
  }

  public stopProgram(): void {
    this.currentlyPlayingProgram = null;
    // Retourner aux sponsors
    this.socketService.sendCommand({
      type: 'sponsors',
      data: null
    });
  }

  public isProgramPlaying(programId: string): boolean {
    return this.currentlyPlayingProgram === programId;
  }

  public getTotalDuration(program: Program): number {
    return program.items.reduce((total, item) => total + (item.duration || 30), 0);
  }

  public formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  public goBack(): void {
    this.router.navigate(['/remote']);
  }

  private resetVideoSelection(): void {
    this.selectedCategory = null;
    this.selectedSubCategory = null;
    this.availableVideos = [];
  }

  public getSubcategories(category: string): string[] {
    return Object.keys((this.configuration as any)[category] || {});
  }

  public getProgramTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'pre-match': 'Avant-Match',
      'half-time': 'Mi-Temps',
      'post-match': 'Fin de Match'
    };
    return labels[type] || type;
  }

  public getProgramTypeIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'pre-match': '🏁',
      'half-time': '⏸️',
      'post-match': '🏆'
    };
    return icons[type] || '📋';
  }
}
