import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine which .env file to load
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(__dirname, `../../.env.${nodeEnv}`);
const fallbackPath = path.resolve(__dirname, '../../.env');

// Load environment-specific file first, then fall back to .env
const myEnv = dotenv.config({ path: envPath });
if (myEnv.error) {
  // If .env.${NODE_ENV} doesn't exist, try loading .env
  dotenv.config({ path: fallbackPath });
}

// Expand environment variables (e.g., for variables that reference other variables)
dotenvExpand.expand(myEnv);

console.log(`[Config] Loaded environment: ${nodeEnv}`);
if (process.env.DATABASE_URL) {
  console.log(`[Config] DATABASE_URL is set.`);
} else {
  console.warn(`[Config] DATABASE_URL is NOT set. Falling back to defaults.`);
}

export default process.env;
