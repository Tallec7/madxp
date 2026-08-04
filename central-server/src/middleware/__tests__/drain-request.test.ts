import { Readable } from 'stream';
import { Request, Response, NextFunction } from 'express';
import { drainOnEarlyResponse } from '../drain-request';

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/**
 * Incident 2026-08-04 — rejet précoce sur route multipart : Node fermait la
 * socket avec le corps non lu → l'edge Railway annulait la stream HTTP/2 →
 * le navigateur voyait ERR_HTTP2_PROTOCOL_ERROR / status 0 au lieu du vrai code.
 */
describe('drainOnEarlyResponse', () => {
  const makeReq = (contentType: string | undefined, chunks: Buffer[] = []): Request => {
    const req = new Readable({ read() { /* piloté manuellement */ } }) as unknown as Request;
    req.headers = contentType ? { 'content-type': contentType } : {};
    Object.defineProperty(req, 'path', { value: '/api/image-to-video', configurable: true });
    (req as unknown as { complete: boolean }).complete = false;
    // Alimente le flux au tick suivant, comme un vrai upload en cours
    setImmediate(() => {
      chunks.forEach(c => (req as unknown as Readable).push(c));
      (req as unknown as Readable).push(null);
    });
    return req;
  };

  const makeRes = (onEnd: (body?: unknown) => void): { res: Response; endMock: jest.Mock } => {
    const res = { statusCode: 401 } as unknown as Response;
    const endMock = jest.fn((body?: unknown) => { onEnd(body); return res; });
    res.end = endMock as unknown as Response['end'];
    return { res, endMock };
  };

  it('ne touche pas aux requêtes non-multipart', () => {
    const req = makeReq('application/json');
    const originalEnd = jest.fn();
    const res = { statusCode: 200, end: originalEnd } as unknown as Response;
    const next = jest.fn() as NextFunction;

    drainOnEarlyResponse()(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.end).toBe(originalEnd); // pas de patch
  });

  it('diffère la réponse jusqu\'à ce que le corps multipart soit drainé', (done) => {
    const req = makeReq('multipart/form-data; boundary=xyz', [Buffer.alloc(1024), Buffer.alloc(2048)]);
    let ended = false;
    const { res, endMock } = makeRes(() => { ended = true; });

    drainOnEarlyResponse()(req, res, () => { /* next */ });

    res.end('{"error":"Non authentifié"}');

    // La réponse ne doit PAS être flushée tant que le corps arrive encore
    expect(ended).toBe(false);

    req.on('end', () => {
      setImmediate(() => {
        expect(ended).toBe(true);
        expect(endMock).toHaveBeenCalledWith('{"error":"Non authentifié"}');
        done();
      });
    });
  });

  it('répond immédiatement si le corps a déjà été consommé (cas nominal multer)', () => {
    const req = makeReq('multipart/form-data; boundary=xyz');
    (req as unknown as { complete: boolean }).complete = true;
    let ended = false;
    const { res } = makeRes(() => { ended = true; });

    drainOnEarlyResponse()(req, res, () => { /* next */ });
    res.end('{"ok":true}');

    expect(ended).toBe(true);
  });

  it('abandonne le drain au-delà du plafond (pas d\'éponge à bande passante)', (done) => {
    const req = makeReq('multipart/form-data; boundary=xyz', [Buffer.alloc(4096)]);
    const { res } = makeRes(() => {
      // Flushé dès le dépassement, sans attendre la fin du corps
      expect(req.readableEnded).toBe(false);
      done();
    });

    drainOnEarlyResponse(1024)(req, res, () => { /* next */ });
    res.end('{"error":"Trop de requêtes"}');
  });
});
