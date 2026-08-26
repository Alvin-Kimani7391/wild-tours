/**
 * Dynamic sitemap generator for Wild Tours / IVH Tz backend (Node/Express + MongoDB).
 *
 * Usage:
 *   1. Adjust the model names/fields below to match your actual Mongoose models
 *      (VolunteerProgram, Tour, Accommodation — rename as needed).
 *   2. Mount as a route, e.g.:
 *        const { sitemapHandler } = require('./generate-sitemap');
 *        app.get('/sitemap.xml', sitemapHandler);
 *      This serves a fresh sitemap on every request. For a high-traffic site you'd
 *      instead cache the output and regenerate on a schedule (e.g. every hour via cron).
 *   3. Point robots.txt's "Sitemap:" line at this route instead of the static file
 *      once this is live, so search engines always see current listings.
 */

const SITE_URL = 'https://internationalvolunteerhometz.org'; // Change to your actual site URL

// Replace with your actual models
const VolunteerProgram = require('../models/Volunteer');
const Tour = require('../models/Tour');
const Accommodation = require('../models/Accommodation');

const STATIC_URLS = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/volunteer.html', changefreq: 'weekly', priority: '0.9' },
  { loc: '/category.html?cat=wildlife', changefreq: 'weekly', priority: '0.8' },
  { loc: '/category.html?cat=education', changefreq: 'weekly', priority: '0.8' },
  { loc: '/category.html?cat=healthcare', changefreq: 'weekly', priority: '0.8' },
  { loc: '/category.html?cat=environment', changefreq: 'weekly', priority: '0.8' },
  { loc: '/category.html?cat=community', changefreq: 'weekly', priority: '0.8' },
  { loc: '/tours.html', changefreq: 'weekly', priority: '0.9' },
  { loc: '/accommodation.html', changefreq: 'weekly', priority: '0.9' },
  { loc: '/about.html', changefreq: 'monthly', priority: '0.6' },
  { loc: '/blog.html', changefreq: 'weekly', priority: '0.6' },
  { loc: '/gallery.html', changefreq: 'monthly', priority: '0.5' },
  { loc: '/community.html', changefreq: 'monthly', priority: '0.6' },
  { loc: '/faq.html', changefreq: 'monthly', priority: '0.5' },
  { loc: '/contact.html', changefreq: 'monthly', priority: '0.7' },
];

function urlEntry(loc, changefreq, priority, lastmod) {
  return `  <url>
    <loc>${SITE_URL}${loc}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

async function sitemapHandler(req, res) {
  try {
    const [programs, tours, stays] = await Promise.all([
      VolunteerProgram.find({ isActive: { $ne: false } }).select('_id updatedAt').lean(),
      Tour.find({ isActive: { $ne: false } }).select('_id updatedAt').lean(),
      Accommodation.find({ isActive: { $ne: false } }).select('slug updatedAt').lean(),
    ]);

    const dynamicEntries = [
      ...programs.map(p => urlEntry(`/volunteer-explore.html?id=${p._id}`, 'monthly', '0.7', p.updatedAt?.toISOString().slice(0, 10))),
      ...tours.map(t => urlEntry(`/tour-detail.html?id=${t._id}`, 'monthly', '0.7', t.updatedAt?.toISOString().slice(0, 10))),
      ...stays.map(s => urlEntry(`/accommodation-detail.html?slug=${s.slug}`, 'monthly', '0.7', s.updatedAt?.toISOString().slice(0, 10))),
    ];

    const staticEntries = STATIC_URLS.map(u => urlEntry(u.loc, u.changefreq, u.priority));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries.join('\n')}
${dynamicEntries.join('\n')}
</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap generation failed:', err);
    res.status(500).send('Sitemap generation failed');
  }
}

module.exports = { sitemapHandler };