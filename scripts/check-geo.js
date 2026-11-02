import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import maxmind from 'maxmind';

const database = path.resolve('geo/GeoLite2-City.mmdb');
// Opening the database rejects missing files and error pages saved as .mmdb.
await maxmind.open(database);

for (const route of [
  'api/send',
  'api/record',
  'api/batch',
  '(collect)/p/[slug]',
  '(collect)/q/[slug]',
]) {
  const trace = path.resolve(`.next/server/app/${route}/route.js.nft.json`);
  const { files } = JSON.parse(await readFile(trace, 'utf8'));
  assert(
    files.some(file => path.resolve(path.dirname(trace), file) === database),
    `GeoLite database is missing from the ${route} function trace.`,
  );
}
