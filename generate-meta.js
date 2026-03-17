import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');
const metaFile = path.join(publicDir, 'meta.json');

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate timestamp
const version = new Date().getTime().toString();

// Write to meta.json
fs.writeFileSync(metaFile, JSON.stringify({ version }), 'utf-8');

console.log(`[Version Check] Generated meta.json with version: ${version}`);
