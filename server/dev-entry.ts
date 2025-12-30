// Dev entry point - registers TypeScript path aliases before loading the server
// This ensures @db and @shared aliases work on both Replit and local machines

import { register } from 'tsconfig-paths';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseUrl = path.resolve(__dirname, '..');

// Register path aliases from tsconfig.json
register({
  baseUrl,
  paths: {
    "@/*": ["./client/src/*"],
    "@shared/*": ["./shared/*"],
    "@db": ["./db/index.ts"]
  }
});

// Now import and start the actual server
import('./index.js');
