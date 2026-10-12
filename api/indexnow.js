import { submitIndexNow } from '../functions/_lib/indexnow.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const urls = Array.isArray(req.body?.urls) ? req.body.urls : [req.body?.url];
  const result = await submitIndexNow(urls);
  res.status(result.status).json(result.body);
}
