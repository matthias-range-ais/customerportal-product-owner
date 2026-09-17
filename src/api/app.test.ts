import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('buildApp', () => {
  it('serves the built frontend shell on GET /', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<title>customerportal-product-owner</title>');
    expect(response.body).toContain('<div id="root">');

    await app.close();
  });

  it('serves a built JS bundle that renders the German landing-page text', async () => {
    const app = await buildApp();

    const page = await app.inject({ method: 'GET', url: '/' });
    const scriptSrc = page.body.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
    expect(scriptSrc, 'expected an inline <script src="...js"> in the built HTML').toBeDefined();

    const bundle = await app.inject({ method: 'GET', url: scriptSrc! });

    expect(bundle.statusCode).toBe(200);
    expect(bundle.body).toContain('Grundgerüst läuft');

    await app.close();
  });
});
