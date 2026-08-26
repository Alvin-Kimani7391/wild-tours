/**
 * routes/generate-sitemap.js
 * -----------------------------------------------------------------------
 * WildRoots / IVH Tz sitemap generator.
 *
 * Mount at the ROOT of the app (not under /api), in server.js:
 *
 *   app.use('/', require('./routes/generate-sitemap'));
 *
 * Split into a sitemap index + one route per collection, each with its
 * OWN try/catch. This means if e.g. Accommodation's query is broken, you
 * still get a working /sitemap-tours.xml and /sitemap-programs.xml, and
 * hitting the broken one directly tells you exactly which collection is
 * at fault instead of a single generic 500 for everything.
 * -----------------------------------------------------------------------
 */

const express = require('express');
const router = express.Router();

// Double-check these paths/filenames/casing match your actual models dir
const VolunteerProgram = require('../models/Volunteer');
const Tour = require('../models/Tour');
const Accommodation = require('../models/Accommodation');

const SITE_URL = (process.env.SITE_URL || 'https://internationalvolunteerht.org').replace(/\/$/, '');

const STATIC_PAGES = [
  { url: '/', changefreq: 'weekly', priority: 1.0 },
  { url: '/volunteer.html', changefreq: 'weekly', priority: 0.9 },
  { url: '/category.html?cat=wildlife', changefreq: 'weekly', priority: 0.8 },
  { url: '/category.html?cat=education', changefreq: 'weekly', priority: 0.8 },
  { url: '/category.html?cat=healthcare', changefreq: 'weekly', priority: 0.8 },
  { url: '/category.html?cat=environment', changefreq: 'weekly', priority: 0.8 },
  { url: '/category.html?cat=community', changefreq: 'weekly', priority: 0.8 },
  { url: '/tours.html', changefreq: 'weekly', priority: 0.9 },
  { url: '/accommodation.html', changefreq: 'weekly', priority: 0.9 },
  { url: '/about.html', changefreq: 'monthly', priority: 0.6 },
  { url: '/blog.html', changefreq: 'weekly', priority: 0.6 },
  { url: '/gallery.html', changefreq: 'monthly', priority: 0.5 },
  { url: '/community.html', changefreq: 'monthly', priority: 0.6 },
  { url: '/faq.html', changefreq: 'monthly', priority: 0.5 },
  { url: '/contact.html', changefreq: 'monthly', priority: 0.7 },
];

function xmlEscape(str = '') {
  return String(str).replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return `<url><loc>${xmlEscape(loc)}</loc>` +
    (lastmod ? `<lastmod>${lastmod}</lastmod>` : '') +
    (changefreq ? `<changefreq>${changefreq}</changefreq>` : '') +
    (priority != null ? `<priority>${priority}</priority>` : '') +
    `</url>`;
}

function urlset(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries.join('\n') +
    `\n</urlset>`;
}

// ── SITEMAP INDEX ─────────────────────────────────────────
router.get('/sitemap.xml', (req, res) => {
  const now = new Date().toISOString();
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `<sitemap><loc>${SITE_URL}/sitemap-static.xml</loc><lastmod>${now}</lastmod></sitemap>\n` +
    `<sitemap><loc>${SITE_URL}/sitemap-programs.xml</loc><lastmod>${now}</lastmod></sitemap>\n` +
    `<sitemap><loc>${SITE_URL}/sitemap-tours.xml</loc><lastmod>${now}</lastmod></sitemap>\n` +
    `<sitemap><loc>${SITE_URL}/sitemap-accommodations.xml</loc><lastmod>${now}</lastmod></sitemap>\n` +
    `</sitemapindex>`;
  res.set('Content-Type', 'application/xml');
  res.send(body);
});

// ── STATIC PAGES ──────────────────────────────────────────
router.get('/sitemap-static.xml', (req, res) => {
  const now = new Date().toISOString();
  const entries = STATIC_PAGES.map((p) => urlEntry(SITE_URL + p.url, now, p.changefreq, p.priority));
  res.set('Content-Type', 'application/xml');
  res.send(urlset(entries));
});

// ── VOLUNTEER PROGRAMS ────────────────────────────────────
router.get('/sitemap-programs.xml', async (req, res) => {
  try {
    const programs = await VolunteerProgram.find({ isActive: { $ne: false } })
      .select('_id updatedAt')
      .limit(50000)
      .lean();

    const entries = programs.map((p) => urlEntry(
      `${SITE_URL}/volunteer-explore.html?id=${p._id}`,
      new Date(p.updatedAt || Date.now()).toISOString(),
      'monthly',
      0.7
    ));
    res.set('Content-Type', 'application/xml');
    res.send(urlset(entries));
  } catch (err) {
    console.error('Program sitemap error:', err);
    res.status(500).type('text/plain').send('Error generating program sitemap: ' + err.message);
  }
});

// ── TOURS ─────────────────────────────────────────────────
router.get('/sitemap-tours.xml', async (req, res) => {
  try {
    const tours = await Tour.find({ isActive: { $ne: false } })
      .select('_id updatedAt')
      .limit(50000)
      .lean();

    const entries = tours.map((t) => urlEntry(
      `${SITE_URL}/tour-detail.html?id=${t._id}`,
      new Date(t.updatedAt || Date.now()).toISOString(),
      'monthly',
      0.7
    ));
    res.set('Content-Type', 'application/xml');
    res.send(urlset(entries));
  } catch (err) {
    console.error('Tour sitemap error:', err);
    res.status(500).type('text/plain').send('Error generating tour sitemap: ' + err.message);
  }
});

// ── ACCOMMODATIONS ────────────────────────────────────────
router.get('/sitemap-accommodations.xml', async (req, res) => {
  try {
    const stays = await Accommodation.find({ isActive: { $ne: false } })
      .select('slug updatedAt')
      .limit(50000)
      .lean();

    const entries = stays.map((s) => urlEntry(
      `${SITE_URL}/accommodation-detail.html?slug=${s.slug}`,
      new Date(s.updatedAt || Date.now()).toISOString(),
      'monthly',
      0.7
    ));
    res.set('Content-Type', 'application/xml');
    res.send(urlset(entries));
  } catch (err) {
    console.error('Accommodation sitemap error:', err);
    res.status(500).type('text/plain').send('Error generating accommodation sitemap: ' + err.message);
  }
});

module.exports = router;