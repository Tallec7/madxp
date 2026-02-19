/**
 * Test helpers — Factories et utilitaires pour les tests unitaires des services.
 *
 * Fournit :
 * - Mock factories pour les dépendances Angular courantes
 * - Helpers pour localStorage, window, et BroadcastChannel
 * - Mock HTMLVideoElement
 */

import { HttpClient } from '@angular/common/http';
import { of, EMPTY } from 'rxjs';

// ============================================================================
// HTTP CLIENT MOCK
// ============================================================================

/**
 * Crée un spy HttpClient avec des réponses par défaut.
 */
export function createHttpClientMock(): jasmine.SpyObj<HttpClient> {
  return jasmine.createSpyObj('HttpClient', ['get', 'post', 'put', 'delete']);
}

// ============================================================================
// LOCALSTORAGE MOCK
// ============================================================================

export class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  get length(): number {
    return Object.keys(this.store).length;
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
}

/**
 * Installe un mock localStorage sur window.
 * Retourne le mock pour assertions.
 */
export function mockLocalStorage(): LocalStorageMock {
  const mock = new LocalStorageMock();
  Object.defineProperty(window, 'localStorage', { value: mock, writable: true, configurable: true });
  return mock;
}

// ============================================================================
// BROADCAST CHANNEL MOCK
// ============================================================================

export class BroadcastChannelMock {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private static instances: BroadcastChannelMock[] = [];

  constructor(name: string) {
    this.name = name;
    BroadcastChannelMock.instances.push(this);
  }

  postMessage(message: unknown): void {
    // Envoyer aux autres instances du même canal
    BroadcastChannelMock.instances
      .filter(ch => ch !== this && ch.name === this.name && ch.onmessage)
      .forEach(ch => ch.onmessage!(new MessageEvent('message', { data: message })));
  }

  close(): void {
    const idx = BroadcastChannelMock.instances.indexOf(this);
    if (idx >= 0) BroadcastChannelMock.instances.splice(idx, 1);
  }

  static reset(): void {
    BroadcastChannelMock.instances = [];
  }
}

/**
 * Installe un mock BroadcastChannel sur window.
 */
export function mockBroadcastChannel(): void {
  BroadcastChannelMock.reset();
  (window as unknown as Record<string, unknown>)['BroadcastChannel'] = BroadcastChannelMock;
}

// ============================================================================
// HTML VIDEO ELEMENT MOCK
// ============================================================================

export function createVideoElementMock(): HTMLVideoElement {
  const videoEl = document.createElement('video');

  // Override des méthodes qui ont besoin de mocking dans les tests
  spyOn(videoEl, 'play').and.returnValue(Promise.resolve());
  spyOn(videoEl, 'pause');
  spyOn(videoEl, 'load');

  // Propriétés par défaut
  Object.defineProperty(videoEl, 'readyState', { value: 4, writable: true, configurable: true });
  Object.defineProperty(videoEl, 'videoWidth', { value: 1280, writable: true, configurable: true });
  Object.defineProperty(videoEl, 'videoHeight', { value: 720, writable: true, configurable: true });
  Object.defineProperty(videoEl, 'duration', { value: 30, writable: true, configurable: true });

  return videoEl;
}

// ============================================================================
// CANVAS MOCK
// ============================================================================

export function createCanvasMock(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = {
    drawImage: jasmine.createSpy('drawImage'),
    clearRect: jasmine.createSpy('clearRect'),
  };
  spyOn(canvas, 'getContext').and.returnValue(ctx as unknown as CanvasRenderingContext2D);
  return canvas;
}

// ============================================================================
// SOCKET SERVICE MOCK
// ============================================================================

export function createSocketServiceMock(): {
  initialize: jasmine.Spy;
  on: jasmine.Spy;
  emit: jasmine.Spy;
} {
  return {
    initialize: jasmine.createSpy('initialize'),
    on: jasmine.createSpy('on'),
    emit: jasmine.createSpy('emit'),
  };
}

// ============================================================================
// FETCH MOCK
// ============================================================================

/**
 * Mock window.fetch pour retourner une réponse JSON.
 */
export function mockFetch(responseData: unknown, ok = true): jasmine.Spy {
  const spy = spyOn(window, 'fetch').and.returnValue(
    Promise.resolve(new Response(JSON.stringify(responseData), {
      status: ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    }))
  );
  return spy;
}

// ============================================================================
// NGZONE MOCK
// ============================================================================

export function createNgZoneMock(): { run: jasmine.Spy } {
  return {
    run: jasmine.createSpy('ngZone.run').and.callFake((fn: () => void) => fn()),
  };
}
