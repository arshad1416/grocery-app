/**
 * Catalog availability gate semantics.
 *
 * Moving Turso behind the relay changed the default of this gate, and that is
 * worth pinning down. The old `isTursoReady()` was false until the user had
 * pasted a database URL and token into Settings — in practice, false for
 * nearly everyone. `isCatalogAvailable()` is true whenever catalog lookups are
 * enabled and a relay URL is set, and both of those are on by default
 * (tursoEnabled: true, relayUrl: 'ws://localhost').
 *
 * So the gate flipped from false-by-default to true-by-default. These tests
 * record why that is safe:
 *   - the toggle genuinely turns it off (it previously gated nothing);
 *   - an unenrolled device short-circuits before any request is made;
 *   - the Deals surfaces are gated on flippFsa, which has no default, so
 *     nothing new appears for a user who has not configured one.
 */

jest.mock('../src/identity/enroll', () => ({
  getRelayToken: jest.fn(),
}));

import { isCatalogAvailable, fetchProduct, fetchDeals } from '../src/services/catalogClient';
import { getRelayToken } from '../src/identity/enroll';
import * as settings from '../src/config/settings';
import { DEFAULT_SETTINGS_FOR_TEST } from '../src/config/settings';

const mockGetRelayToken = getRelayToken as jest.MockedFunction<typeof getRelayToken>;

function withSettings(overrides: Record<string, unknown>) {
  jest
    .spyOn(settings, 'getSettings')
    .mockReturnValue({ ...DEFAULT_SETTINGS_FOR_TEST, ...overrides } as any);
}

describe('isCatalogAvailable', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockGetRelayToken.mockReset();
    (global as any).fetch = undefined;
  });

  it('is true under the shipped defaults', () => {
    withSettings({});
    expect(isCatalogAvailable()).toBe(true);
  });

  it('is false when the user turns catalog lookups off', () => {
    // The old "Turso Enabled" toggle stopped no traffic at all. This one does.
    withSettings({ tursoEnabled: false });
    expect(isCatalogAvailable()).toBe(false);
  });

  it('is false with no relay configured', () => {
    withSettings({ relayUrl: '' });
    expect(isCatalogAvailable()).toBe(false);
  });

  it('is false before settings are initialised, rather than throwing', () => {
    jest.spyOn(settings, 'getSettings').mockImplementation(() => {
      throw new Error('Settings not initialized');
    });
    expect(isCatalogAvailable()).toBe(false);
  });
});

describe('catalog requests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockGetRelayToken.mockReset();
    (global as any).fetch = undefined;
  });

  it('issues no request at all when the toggle is off', async () => {
    withSettings({ tursoEnabled: false });
    (global as any).fetch = jest.fn();
    mockGetRelayToken.mockResolvedValue('relay-token');

    expect(await fetchProduct('012345678905')).toBeNull();
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('issues no request when the device is not enrolled', async () => {
    // The gate is true by default, so this short-circuit is what stops an
    // unconfigured install from talking to a relay it has no token for.
    withSettings({});
    (global as any).fetch = jest.fn();
    mockGetRelayToken.mockResolvedValue(null);

    expect(await fetchProduct('012345678905')).toBeNull();
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('returns an empty result rather than throwing when the relay has no catalog', async () => {
    // The relay answers 503 when TURSO_URL / TURSO_TOKEN are unset. Callers
    // must fall through to their next source, not surface an error.
    withSettings({});
    mockGetRelayToken.mockResolvedValue('relay-token');
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

    expect(await fetchDeals('L0R')).toEqual([]);
    expect(await fetchProduct('012345678905')).toBeNull();
  });

  it('returns an empty result when the relay is unreachable', async () => {
    withSettings({});
    mockGetRelayToken.mockResolvedValue('relay-token');
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network request failed'));

    expect(await fetchDeals('L0R')).toEqual([]);
  });

  it('sends the relay enrollment token, never a value out of settings', async () => {
    withSettings({});
    mockGetRelayToken.mockResolvedValue('relay-token');
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ product: null }),
    });

    await fetchProduct('012345678905');

    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toContain('/api/catalog/product');
    expect(init.headers.Authorization).toBe('Bearer relay-token');
    // The barcode is sent as JSON data, never spliced into a query string.
    expect(JSON.parse(init.body)).toEqual({ barcode: '012345678905' });
  });

  it('has no FSA default, so Deals surfaces stay hidden until one is set', () => {
    // HomeScreen and GroceryListScreen both bail with 'fsa_missing' before
    // consulting the catalog gate. Without a default, the true-by-default gate
    // cannot surface an empty Deals view to a user who never configured one.
    expect((DEFAULT_SETTINGS_FOR_TEST as any).flippFsa).toBeUndefined();
  });
});
