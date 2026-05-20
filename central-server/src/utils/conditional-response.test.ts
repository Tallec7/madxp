import { Request, Response } from 'express';
import { sendJsonWithEtag } from './conditional-response';

type MockRes = Response & {
  headers: Record<string, string>;
  status: jest.Mock;
  end: jest.Mock;
  json: jest.Mock;
  setHeader: jest.Mock;
};

function makeRes(): MockRes {
  const headers: Record<string, string> = {};
  const res = { statusCode: 200, headers } as unknown as MockRes;
  res.setHeader = jest.fn((k: string, v: string) => {
    headers[k] = v;
    return res;
  });
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn();
  res.end = jest.fn();
  return res;
}

function makeReq(ifNoneMatch?: string): Request {
  return {
    headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {},
  } as unknown as Request;
}

describe('sendJsonWithEtag', () => {
  it('writes ETag + Cache-Control + json body on first hit', () => {
    const req = makeReq();
    const res = makeRes();

    sendJsonWithEtag(req, res, { hello: 'world' });

    expect(res.headers['ETag']).toMatch(/^W\/".+"$/);
    expect(res.headers['Cache-Control']).toBe('private, must-revalidate');
    expect(res.json).toHaveBeenCalledWith({ hello: 'world' });
    expect(res.end).not.toHaveBeenCalled();
  });

  it('returns 304 when client sends matching If-None-Match', () => {
    const firstRes = makeRes();
    sendJsonWithEtag(makeReq(), firstRes, { value: 42 });
    const issuedEtag = firstRes.headers['ETag'];

    const secondRes = makeRes();
    sendJsonWithEtag(makeReq(issuedEtag), secondRes, { value: 42 });

    expect(secondRes.status).toHaveBeenCalledWith(304);
    expect(secondRes.end).toHaveBeenCalled();
    expect(secondRes.json).not.toHaveBeenCalled();
    expect(secondRes.headers['ETag']).toBe(issuedEtag);
  });

  it('returns full body when client sends stale If-None-Match', () => {
    const firstRes = makeRes();
    sendJsonWithEtag(makeReq(), firstRes, { value: 1 });
    const staleEtag = firstRes.headers['ETag'];

    const secondRes = makeRes();
    sendJsonWithEtag(makeReq(staleEtag), secondRes, { value: 2 });

    expect(secondRes.status).not.toHaveBeenCalledWith(304);
    expect(secondRes.json).toHaveBeenCalledWith({ value: 2 });
    expect(secondRes.headers['ETag']).not.toBe(staleEtag);
  });

  it('respects custom cacheControl option', () => {
    const res = makeRes();
    sendJsonWithEtag(makeReq(), res, { x: 1 }, { cacheControl: 'public, max-age=60' });

    expect(res.headers['Cache-Control']).toBe('public, max-age=60');
  });

  it('uses etagKey instead of body when provided (stable ETag despite volatile fields)', () => {
    const stableKey = { siteId: 'abc', version: 1 };

    const r1 = makeRes();
    sendJsonWithEtag(makeReq(), r1, { siteId: 'abc', lastHit: '2026-05-20T10:00Z' }, { etagKey: stableKey });

    const r2 = makeRes();
    sendJsonWithEtag(makeReq(), r2, { siteId: 'abc', lastHit: '2026-05-20T10:01Z' }, { etagKey: stableKey });

    expect(r1.headers['ETag']).toBe(r2.headers['ETag']);
  });
});
