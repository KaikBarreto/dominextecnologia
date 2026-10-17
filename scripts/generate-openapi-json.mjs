import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';

const root = new URL('../', import.meta.url);
const source = new URL('docs/api/openapi.v1.yaml', root);
const destination = new URL('workers/openapi.v1.json', root);
const document = parse(await readFile(source, 'utf8'));

await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
