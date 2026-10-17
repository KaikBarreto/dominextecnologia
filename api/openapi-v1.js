import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

let cachedDocument;

function openApiDocument() {
  if (!cachedDocument) {
    const sourcePath = fileURLToPath(new URL('../docs/api/openapi.v1.yaml', import.meta.url));
    cachedDocument = parse(readFileSync(sourcePath, 'utf8'));
  }
  return cachedDocument;
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  res.setHeader('Content-Type', 'application/vnd.oai.openapi+json;version=3.1.1; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).json(openApiDocument());
}
