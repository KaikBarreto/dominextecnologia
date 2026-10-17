export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.redirect(308, '/docs');
}
