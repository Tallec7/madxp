import { TestBed } from '@angular/core/testing';
import { LanReceiverPrecacheService } from './lan-receiver-precache.service';
import { Configuration } from '../interfaces/configuration.interface';
import { environment } from '../../environments/environment';

describe('LanReceiverPrecacheService', () => {
  let service: LanReceiverPrecacheService;
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch').and.callFake(() =>
      Promise.resolve(
        new Response(new ArrayBuffer(8), { status: 200, headers: { 'Content-Type': 'video/mp4' } }),
      ),
    );
    TestBed.configureTestingModule({});
    service = TestBed.inject(LanReceiverPrecacheService);
  });

  describe('isLanReceiver', () => {
    it('returns false on localhost (Pi kiosk loopback)', () => {
      spyOnProperty(window, 'location', 'get').and.returnValue({ hostname: 'localhost' } as Location);
      expect(service.isLanReceiver()).toBe(false);
    });

    it('returns false on 127.0.0.1', () => {
      spyOnProperty(window, 'location', 'get').and.returnValue({ hostname: '127.0.0.1' } as Location);
      expect(service.isLanReceiver()).toBe(false);
    });

    it('returns true on a LAN IP (Fire Stick → Pi)', () => {
      spyOnProperty(window, 'location', 'get').and.returnValue({ hostname: '192.168.1.111' } as Location);
      expect(service.isLanReceiver()).toBe(true);
    });

    it('returns true on neopro.local', () => {
      spyOnProperty(window, 'location', 'get').and.returnValue({ hostname: 'neopro.local' } as Location);
      expect(service.isLanReceiver()).toBe(true);
    });

    it('returns false in SaaS mode even on a public host (regression guard: Chrome cache deadlock)', () => {
      const previous = environment.saasMode;
      environment.saasMode = true;
      try {
        spyOnProperty(window, 'location', 'get').and.returnValue({ hostname: 'app.neopro.com' } as Location);
        expect(service.isLanReceiver()).toBe(false);
      } finally {
        environment.saasMode = previous;
      }
    });
  });

  describe('precacheConfiguration in SaaS mode', () => {
    it('skips entirely (regression guard: video stall on first play)', async () => {
      const previous = environment.saasMode;
      environment.saasMode = true;
      try {
        spyOnProperty(window, 'location', 'get').and.returnValue({ hostname: 'app.neopro.com' } as Location);
        service.precacheConfiguration({
          sponsors: [{ path: 'https://kalonpartners.bzh/neopro-video/videos/a.mp4' }],
        } as unknown as Configuration);
        await new Promise(r => setTimeout(r, 50));
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        environment.saasMode = previous;
      }
    });
  });

  describe('precacheConfiguration', () => {
    it('skips entirely when not a LAN receiver (loopback)', () => {
      spyOnProperty(window, 'location', 'get').and.returnValue({ hostname: 'localhost' } as Location);
      service.precacheConfiguration({ sponsors: [{ path: 'videos/foo.mp4' }] } as unknown as Configuration);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('collects paths from sponsors, timeCategories, and categories (incl. subCategories)', async () => {
      spyOnProperty(window, 'location', 'get').and.returnValue({ hostname: 'neopro.local' } as Location);
      const config = {
        sponsors: [{ path: 'videos/sponsor1.mp4' }, { path: 'videos/sponsor2.mp4' }],
        timeCategories: [{ id: 'before', loopVideos: [{ path: 'videos/phase-before.mp4' }] }],
        categories: [
          {
            id: 'cat1',
            name: 'cat1',
            videos: [{ path: 'videos/manual1.mp4' }],
            subCategories: [
              { id: 'sub1', name: 'sub1', videos: [{ path: 'videos/manual2.mp4' }] },
            ],
          },
        ],
      } as unknown as Configuration;

      service.precacheConfiguration(config);
      // Laisser la queue se vider
      await new Promise(r => setTimeout(r, 50));

      const urls = fetchSpy.calls.allArgs().map(args => String(args[0]));
      expect(urls.length).toBe(5);
      expect(urls.some(u => u.endsWith('videos/sponsor1.mp4'))).toBe(true);
      expect(urls.some(u => u.endsWith('videos/sponsor2.mp4'))).toBe(true);
      expect(urls.some(u => u.endsWith('videos/phase-before.mp4'))).toBe(true);
      expect(urls.some(u => u.endsWith('videos/manual1.mp4'))).toBe(true);
      expect(urls.some(u => u.endsWith('videos/manual2.mp4'))).toBe(true);
    });

    it('deduplicates paths shared across sponsors and categories', async () => {
      spyOnProperty(window, 'location', 'get').and.returnValue({ hostname: 'neopro.local' } as Location);
      const config = {
        sponsors: [{ path: 'videos/shared.mp4' }],
        timeCategories: [],
        categories: [{ id: 'c', name: 'c', videos: [{ path: 'videos/shared.mp4' }] }],
      } as unknown as Configuration;

      service.precacheConfiguration(config);
      await new Promise(r => setTimeout(r, 50));

      expect(fetchSpy.calls.count()).toBe(1);
    });

    it('does not refetch a path already cached on a second invocation', async () => {
      spyOnProperty(window, 'location', 'get').and.returnValue({ hostname: 'neopro.local' } as Location);
      const config = {
        sponsors: [{ path: 'videos/a.mp4' }],
        timeCategories: [],
        categories: [],
      } as unknown as Configuration;

      service.precacheConfiguration(config);
      await new Promise(r => setTimeout(r, 50));
      expect(fetchSpy.calls.count()).toBe(1);

      service.precacheConfiguration(config);
      await new Promise(r => setTimeout(r, 50));
      expect(fetchSpy.calls.count()).toBe(1);
    });

    it('handles null/empty config without throwing', () => {
      spyOnProperty(window, 'location', 'get').and.returnValue({ hostname: 'neopro.local' } as Location);
      expect(() => service.precacheConfiguration(null)).not.toThrow();
      expect(() => service.precacheConfiguration(undefined)).not.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('uses cache:force-cache and credentials:omit for fetch options', async () => {
      spyOnProperty(window, 'location', 'get').and.returnValue({ hostname: 'neopro.local' } as Location);
      service.precacheConfiguration({
        sponsors: [{ path: 'videos/a.mp4' }],
      } as unknown as Configuration);
      await new Promise(r => setTimeout(r, 50));

      const opts = fetchSpy.calls.mostRecent().args[1] as RequestInit & { cache?: string };
      expect(opts.cache).toBe('force-cache');
      expect(opts.credentials).toBe('omit');
      expect(opts.mode).toBe('no-cors');
    });
  });
});
