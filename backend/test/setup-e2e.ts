/**
 * Loads `backend/.env` before any test module is imported.
 *
 * Without this, `AppConfigService` would call `getOrThrow('JWT_ACCESS_SECRET')`
 * and the whole suite would fail at bootstrap. `@nestjs/config` loads `.env`
 * when the app is created, but the config service is constructed during module
 * resolution — by which point the singleton has already been instantiated in
 * some paths. Loading it here removes the ordering hazard entirely.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Nothing in the test suite should ever talk to a production database. The
// suite truncates tables and creates accounts freely.
process.env.NODE_ENV = 'test';

/**
 * Raise the rate limits out of the way.
 *
 * The suite creates a few dozen accounts, each of which is a register call, and
 * the production limit is 5 registrations per minute per IP — which the whole
 * suite shares. Left alone, most of the tests past the first handful would fail
 * with 429 for reasons unrelated to what they are checking.
 *
 * Throttling itself still needs to be *proved*, which is why the dedicated
 * "Rate limiting" block reads the decorator metadata directly rather than
 * relying on a request count.
 */
process.env.THROTTLE_TTL_MS = '60000';
process.env.THROTTLE_LIMIT = '100000';
process.env.THROTTLE_LIMIT_REGISTER = '100000';
process.env.THROTTLE_LIMIT_LOGIN = '100000';
process.env.THROTTLE_LIMIT_REFRESH = '100000';
