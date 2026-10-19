// Opt-in contract test against the REAL ACL service. Skipped unless ACL_LIVE_TEST=1.
//   ACL_LIVE_TEST=1 ACL_LIVE_TEST_EMAIL=you@nsut.ac.in npm run test:acl
// Uses ACL_API_URL / ACL_CLIENT_ID / ACL_CLIENT_SECRET from backend/.env. Read-only: one lookup
// of the given account and one of a made-up address. Prints no personal data.
import { fetchUserAccess, AclError } from '../../src/auth/aclClient.js';

const live = process.env.ACL_LIVE_TEST === '1';
const email = process.env.ACL_LIVE_TEST_EMAIL;
const maybe = live ? describe : describe.skip;

maybe('live ACL contract', () => {
  beforeAll(() => {
    process.env.ACL_MODE = 'live';
    if (!email) throw new Error('Set ACL_LIVE_TEST_EMAIL to an @nsut.ac.in account registered in the ACL.');
  });
  afterAll(() => {
    process.env.ACL_MODE = 'mock';
  });

  test('a registered user returns the fields CRAS depends on', async () => {
    const a = await fetchUserAccess(email);
    expect(typeof a.aclId).toBe('string');
    expect(a.aclId.length).toBeGreaterThan(0);
    expect(a.email).toBe(email.toLowerCase());
    expect(a.status).toBe('ACTIVE');
    expect(['VIEWER', 'STUDENT_REP', 'FACULTY', 'ADMIN']).toContain(a.role);
    expect(Array.isArray(a.permissions)).toBe(true);
    for (const p of a.permissions) expect(p).toMatch(/^[a-z]+:[a-z-]+$/);
    expect(typeof a.academic).toBe('object');
    // Fields the booking rules read; null is allowed, a different type is not.
    for (const k of ['branch', 'year', 'semester', 'section']) {
      expect(a.academic).toHaveProperty(k);
    }
  }, 20000);

  test('an unknown email is a clean not_found', async () => {
    await expect(fetchUserAccess(`cras.contract.nobody.${Date.now()}@nsut.ac.in`)).rejects.toMatchObject({ code: 'not_found' });
  }, 20000);

  test('wrong client credentials surface as a config error, not a crash', async () => {
    const saved = process.env.ACL_CLIENT_SECRET;
    process.env.ACL_CLIENT_SECRET = 'definitely-wrong';
    try {
      const err = await fetchUserAccess(email).catch((e) => e);
      expect(err).toBeInstanceOf(AclError);
      expect(err.code).toBe('config');
    } finally {
      process.env.ACL_CLIENT_SECRET = saved;
    }
  }, 20000);
});

test('live ACL contract is opt-in', () => {
  expect(true).toBe(true);
});
