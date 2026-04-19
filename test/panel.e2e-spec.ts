import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, TestAppBundle } from './utils/test-app.factory';

describe('Panel Auth (e2e)', () => {
  let bundle: TestAppBundle;
  let app: INestApplication;

  beforeAll(async () => {
    bundle = await createTestApp();
    app = bundle.app;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    bundle.mockAdminUsersService.verify.mockReset();
    bundle.mockAdminUsersService.findById.mockReset();
  });

  it('GET /panel/login returns 200 HTML with the login form', async () => {
    const res = await request(app.getHttpServer()).get('/panel/login');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Admin Girişi');
    expect(res.text).toContain('name="username"');
    expect(res.text).toContain('name="password"');
  });

  it('POST /panel/login with wrong credentials returns 401 and re-renders the form', async () => {
    bundle.mockAdminUsersService.verify.mockResolvedValueOnce(null);
    const res = await request(app.getHttpServer())
      .post('/panel/login')
      .type('form')
      .send({ username: 'wrong', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.text).toContain('Kullanıcı adı veya şifre hatalı');
    expect(bundle.mockAdminUsersService.verify).toHaveBeenCalledWith(
      'wrong',
      'wrong',
    );
  });

  it('POST /panel/login with right credentials sets panel.sid cookie and redirects to /panel', async () => {
    bundle.mockAdminUsersService.verify.mockResolvedValueOnce({
      _id: { toString: () => 'admin-id-1' },
      username: 'admin',
    } as any);

    const res = await request(app.getHttpServer())
      .post('/panel/login')
      .type('form')
      .send({ username: 'admin', password: 'ok' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/panel');
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain('panel.sid');
  });

  it('GET /panel without auth redirects to /panel/login (SessionAuthGuard)', async () => {
    const res = await request(app.getHttpServer()).get('/panel');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/panel/login');
  });

  it('session persists: after login, SessionAuthGuard allows protected GET /panel/api/session/meta', async () => {
    const agent = request.agent(app.getHttpServer());
    bundle.mockAdminUsersService.verify.mockResolvedValueOnce({
      _id: { toString: () => 'admin-id-1' },
      username: 'admin',
    } as any);

    const loginRes = await agent
      .post('/panel/login')
      .type('form')
      .send({ username: 'admin', password: 'ok' });
    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.location).toBe('/panel');

    // /panel/api/session/meta is guarded by SessionAuthGuard (not @PanelPublic).
    // Without session it would 302-redirect to /panel/login; with a persisted
    // cookie it must return 200 JSON — proving the session cookie round-trips.
    const metaRes = await agent.get('/panel/api/session/meta');
    expect(metaRes.status).toBe(200);
    expect(metaRes.headers['content-type']).toMatch(/application\/json/);
    expect(metaRes.body).toHaveProperty('expiresAt');
    expect(metaRes.body).toHaveProperty('idleTimeoutMs');
  });

  it('protected /panel/api/session/meta without auth redirects to /panel/login', async () => {
    const res = await request(app.getHttpServer()).get('/panel/api/session/meta');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/panel/login');
  });

  it('POST /panel/logout clears the panel.sid cookie and redirects to /panel/login', async () => {
    const agent = request.agent(app.getHttpServer());
    bundle.mockAdminUsersService.verify.mockResolvedValueOnce({
      _id: { toString: () => 'admin-id-1' },
      username: 'admin',
    } as any);

    await agent
      .post('/panel/login')
      .type('form')
      .send({ username: 'admin', password: 'ok' })
      .expect(302);

    const logoutRes = await agent.post('/panel/logout');
    expect(logoutRes.status).toBe(302);
    expect(logoutRes.headers.location).toBe('/panel/login');
    const setCookie = String(logoutRes.headers['set-cookie'] || '');
    // connect.sid cleared, or panel.sid reset with expired date / empty value
    expect(setCookie).toContain('panel.sid');

    // After logout, session is destroyed — GET /panel must redirect back to login.
    const afterRes = await agent.get('/panel');
    expect(afterRes.status).toBe(302);
    expect(afterRes.headers.location).toBe('/panel/login');
  });
});
