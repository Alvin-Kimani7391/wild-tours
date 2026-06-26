const express = require('express');
const router = express.Router();
const { sendEmail, emails } = require('../utils/emailService');

const TEAM_EMAIL = process.env.TEAM_EMAIL || 'alvinkimani7391@mail.com';

/* ===== POST /api/contact ===== */
router.post('/', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      nationality,
      dates,
      groupSize,
      budget,
      message,
      subject,   // the active tab value e.g. "safari", "volunteer"
      source,
    } = req.body;

    // --- Basic validation ---
    if (!firstName || !email || !message) {
      return res.status(400).json({ message: 'First name, email and message are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }

    const enquiryData = {
      firstName,
      lastName: lastName || '',
      email,
      phone: phone || 'Not provided',
      nationality: nationality || 'Not specified',
      dates: dates || 'Flexible',
      groupSize: groupSize || 'Not specified',
      budget: budget || 'Not specified',
      message,
      subject: subject || 'general',
      source: source || 'Not specified',
      submittedAt: new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }),
    };

    // Build email payloads from templates
    const userEmail  = emails.contact(enquiryData);
    const adminEmail = emails.contactAdmin(enquiryData);

    // Send team notification + user auto-reply in parallel
    await Promise.all([
      sendEmail({ to: TEAM_EMAIL, ...adminEmail }),
      sendEmail({ to: enquiryData.email, ...userEmail }),
    ]);

    return res.status(200).json({ message: 'Message sent successfully!' });

  } catch (err) {
    console.error('[Contact Route Error]', err);
    return res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

/* ===== POST /api/contact/newsletter ===== */
router.post('/newsletter', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }

    const newsletterEmail = emails.contact({ email, firstName: '', message: null });
    await sendEmail({ to: email, ...newsletterEmail });

    return res.status(200).json({ message: 'Subscribed successfully!' });

  } catch (err) {
    console.error('[Newsletter Route Error]', err);
    return res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

module.exports = router;