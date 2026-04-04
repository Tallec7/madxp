import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DragDropService<T> {
  private draggingIndex: number | null = null;

  startDrag(index: number): void {
    this.draggingIndex = index;
  }

  getDraggingIndex(): number | null {
    return this.draggingIndex;
  }

  drop(items: T[], targetIndex: number): T[] | null {
    if (this.draggingIndex === null || this.draggingIndex === targetIndex) {
      this.cancel();
      return null;
    }

    const result = [...items];
    const [movedItem] = result.splice(this.draggingIndex, 1);
    result.splice(targetIndex, 0, movedItem);

    this.cancel();
    return result;
  }

  cancel(): void {
    this.draggingIndex = null;
  }
}
