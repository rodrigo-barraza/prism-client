/**
 * The Prism token every test runs with: tests/setup.ts stubs the token
 * manager (services/prismTokenManager.ts) so a request never waits on
 * /api/prism-token. A test that checks the Authorization header compares
 * it with this.
 */
export const TEST_PRISM_TOKEN = "test-prism-token";
