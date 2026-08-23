const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/* ═══════════════════════════════════════════════════════════════════════
   This file replaces BOTH the old utils/email.js and utils/emailService.js.
   Everywhere in the codebase that did:
        const { sendEmail, emails } = require('../utils/email');
     or const { sendEmail, emails } = require('../utils/emailService');
   should now point at this single file. Delete the old email.js so there
   is only one source of truth for templates (two files drifting out of
   sync is exactly why "Contact Guide", "Email Applicant" etc. never
   actually sent anything).
   ═══════════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────────────────
// BRAND CONFIG
// ─────────────────────────────────────────────────────────────────────────
const BRAND = {
  name: 'International Volunteer Home Tz',
  shortName: 'IVHT',
  tagline: 'Volunteering & Safari Experiences in Tanzania',
  website: process.env.CLIENT_URL,
  adminPanel: `${process.env.CLIENT_URL}/admin.html`,
  supportEmail: process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || 'support@ivht.co.tz',
  guideEmail: process.env.GUIDE_EMAIL || process.env.ADMIN_EMAIL,
  hostEmail: process.env.HOST_EMAIL || process.env.ADMIN_EMAIL,
  phone: process.env.SUPPORT_PHONE || '+255 700 000 000',
  address: 'Arusha, Tanzania · East Africa',

  colorForest: '#1a3c2e',
  colorForestMid: '#2d6a4f',
  colorForestLight: '#52b788',
  colorGold: '#d4a017',
  colorGoldLight: '#f5d472',
  colorSand: '#f9f6f0',
  colorWhite: '#ffffff',
  colorText: '#1a1a1a',
  colorMuted: '#6b7280',
  colorBorder: '#e5e7eb',
  colorDanger: '#dc2626',
  colorSuccess: '#16a34a',
  colorTeal: '#0e7490',

  font: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
};

// ─────────────────────────────────────────────────────────────────────────
// SHARED BUILDING BLOCKS
// ─────────────────────────────────────────────────────────────────────────
const esc = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmtMoney = (n, currency = 'USD') => `${currency} ${(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const infoRow = (label, value, last = false) => `
  <tr>
    <td style="
      padding: 12px 0;
      ${last ? '' : `border-bottom: 1px solid ${BRAND.colorBorder};`}
      vertical-align: top;
    ">
      <span style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${BRAND.colorMuted};margin-bottom:3px;">${esc(label)}</span>
      <span style="font-size:15px;font-weight:600;color:${BRAND.colorText};">${value}</span>
    </td>
  </tr>`;

const badge = (text, bgColor = BRAND.colorForest, textColor = '#fff') => `
  <span style="display:inline-block;background:${bgColor};color:${textColor};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;padding:5px 12px;border-radius:999px;">${text}</span>`;

const ctaButton = (text, href, bg = BRAND.colorGold, color = BRAND.colorText) => `
  <div style="text-align:center;margin:32px 0 8px;">
    <a href="${href}" style="display:inline-block;background:${bg};color:${color};font-size:15px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:10px;letter-spacing:0.02em;">${text}</a>
  </div>`;

const divider = (margin = '24px 0') => `<div style="height:1px;background:${BRAND.colorBorder};margin:${margin};"></div>`;

const alertBox = (content, type = 'info') => {
  const colors = {
    info:    { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8' },
    warning: { bg: '#fffbeb', border: BRAND.colorGold,   text: '#92400e' },
    danger:  { bg: '#fef2f2', border: BRAND.colorDanger, text: BRAND.colorDanger },
    success: { bg: '#f0fdf4', border: BRAND.colorSuccess, text: BRAND.colorSuccess },
  };
  const c = colors[type] || colors.info;
  return `
    <div style="background:${c.bg};border-left:4px solid ${c.border};border-radius:0 8px 8px 0;padding:14px 18px;margin:20px 0;">
      <p style="margin:0;font-size:13.5px;color:${c.text};line-height:1.6;">${content}</p>
    </div>`;
};

// ─────────────────────────────────────────────────────────────────────────
// MASTER SHELL
// ─────────────────────────────────────────────────────────────────────────
const shell = ({ preheader = '', body, headerVariant = 'default' }) => {
  const headerBg = {
    default: `linear-gradient(150deg, ${BRAND.colorForest} 0%, ${BRAND.colorForestMid} 100%)`,
    dark:    `linear-gradient(150deg, #0d1f18 0%, ${BRAND.colorForest} 100%)`,
    gold:    `linear-gradient(150deg, ${BRAND.colorForest} 0%, #3a5a35 60%, #5a4010 100%)`,
    teal:    `linear-gradient(150deg, ${BRAND.colorForest} 0%, ${BRAND.colorTeal} 100%)`,
  }[headerVariant] || `linear-gradient(150deg, ${BRAND.colorForest} 0%, ${BRAND.colorForestMid} 100%)`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>${BRAND.name}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.colorSand};font-family:${BRAND.font};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${esc(preheader)}&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.colorSand};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${BRAND.colorWhite};border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
        <tr>
          <td style="background:${headerBg};padding:36px 40px;text-align:center;">
            <div style="display:inline-block;width:56px;height:56px;background:rgba(255,255,255,0.12);border-radius:14px;line-height:56px;font-size:28px;margin-bottom:14px;">&#127807;</div>
            <h1 style="margin:0 0 4px;color:${BRAND.colorWhite};font-size:20px;font-weight:800;letter-spacing:0.03em;">${BRAND.name}</h1>
            <p style="margin:0;color:rgba(255,255,255,0.65);font-size:12px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;">${BRAND.tagline}</p>
            <div style="width:48px;height:3px;background:${BRAND.colorGold};border-radius:999px;margin:18px auto 0;"></div>
          </td>
        </tr>
        <tr><td style="padding:40px;">${body}</td></tr>
        <tr>
          <td style="background:#f3f4f6;border-top:1px solid ${BRAND.colorBorder};padding:28px 40px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:${BRAND.colorMuted};">&copy; ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.</p>
            <p style="margin:0;font-size:12px;color:${BRAND.colorMuted};">
              ${BRAND.address} &middot;
              <a href="${BRAND.website}" style="color:${BRAND.colorForestLight};text-decoration:none;">${BRAND.website}</a>
            </p>
            <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">
              You received this because you have an account or an active booking with us.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

// ─────────────────────────────────────────────────────────────────────────
// CORE SEND FUNCTION — never throws past the caller; always resolves
// ─────────────────────────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html, text }) => {
  if (!to) {
    console.error('sendEmail: no "to" address given for subject:', subject);
    return { skipped: true };
  }
  const msg = {
    to,
    from: { email: process.env.SENDGRID_FROM_EMAIL, name: BRAND.name },
    subject,
    html,
  };
  if (text) msg.text = text;
  try {
    return await sgMail.send(msg);
  } catch (err) {
    console.error(`sendEmail failed (to=${to}, subject="${subject}"):`, err?.response?.body || err.message);
    // Swallow — a failed email must never break the booking/application flow.
    return { error: true, message: err.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Shared booking-summary block (used by the "email me full details"
// feature that replaces "Download PDF" on the portal).
// ─────────────────────────────────────────────────────────────────────────
function bookingSummaryRows(booking) {
  const isStay = booking.bookingType === 'accommodation';
  const rows = [];

  rows.push(infoRow('Booking Reference', `<span style="font-family:monospace;">${esc(booking.bookingRef)}</span>`));
  rows.push(infoRow('Type', isStay ? 'Accommodation Stay' : 'Safari / Tour'));
  rows.push(infoRow(isStay ? 'Property' : 'Tour', esc(isStay ? booking.accommodation?.name : (booking.tour?.title || booking.tour?.destination))));

  if (isStay) {
    rows.push(infoRow('Check-in', fmtDate(booking.checkInDate)));
    rows.push(infoRow('Check-out', fmtDate(booking.checkOutDate)));
    rows.push(infoRow('Nights', String(booking.numberOfNights ?? '—')));
    rows.push(infoRow('Guests', String(booking.numberOfGuests ?? '—')));
  } else {
    rows.push(infoRow('Travel Date', fmtDate(booking.startDate)));
    rows.push(infoRow('Travellers', String(booking.numberOfTravelers ?? '—')));
  }

  rows.push(infoRow('Status', esc(String(booking.status || '').toUpperCase())));
  rows.push(infoRow('Payment Status', esc(String(booking.paymentStatus || 'unpaid').replace(/_/g, ' ').toUpperCase())));
  rows.push(infoRow('Total Amount', fmtMoney(booking.totalAmount, booking.currency)));
  rows.push(infoRow('Deposit', fmtMoney(booking.depositAmount, booking.currency)));
  rows.push(infoRow('Booked On', fmtDate(booking.createdAt), true));

  return rows.join('');
}

// ─────────────────────────────────────────────────────────────────────────
// EMAIL TEMPLATES
// ─────────────────────────────────────────────────────────────────────────
const emails = {

  // ── WELCOME ──────────────────────────────────────────────────────────
  welcome: (user) => ({
    subject: `Welcome to ${BRAND.name} — Your Africa Journey Begins`,
    html: shell({
      preheader: `Hi ${user.firstName}, your account is ready.`,
      headerVariant: 'gold',
      body: `
        <h2 style="margin:0 0 8px;font-size:26px;font-weight:800;color:${BRAND.colorForest};">Welcome, ${esc(user.firstName)} &#128075;</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 24px;">
          We're delighted to have you join us — a community of travellers and volunteers who believe Africa is a transformation, not just a destination.
        </p>
        ${ctaButton('Explore Safaris & Programs', `${BRAND.website}/tours.html`)}
      `,
    }),
  }),

  // ── TOUR BOOKING — USER CONFIRMATION ────────────────────────────────
  bookingUser: (booking, user) => ({
    subject: `Booking Received — ${esc(booking.bookingRef)} · ${esc(booking.tour?.title || 'Safari')}`,
    html: shell({
      preheader: `Your safari to ${booking.tour?.title || 'your destination'} has been received.`,
      headerVariant: 'gold',
      body: `
        <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;border-radius:14px;padding:20px 24px;margin-bottom:28px;text-align:center;">
          <div style="font-size:36px;margin-bottom:8px;">&#127881;</div>
          <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:${BRAND.colorSuccess};">Booking Received</h2>
          <p style="margin:0;font-size:13px;color:#166534;">Reference: <strong>${esc(booking.bookingRef)}</strong></p>
        </div>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 24px;">
          Hi <strong>${esc(user.firstName)}</strong>, thank you for booking with ${BRAND.name}. Here is your summary:
        </p>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bookingSummaryRows(booking)}</table>
        </div>
        ${ctaButton('View My Booking', `${BRAND.website}/my-portal.html`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── TOUR BOOKING — ADMIN ALERT ───────────────────────────────────────
  bookingAdmin: (booking, user) => ({
    subject: `New Booking — ${esc(booking.bookingRef)} · ${esc(user.firstName)} ${esc(user.lastName)}`,
    html: shell({
      preheader: `${user.firstName} ${user.lastName} just booked ${booking.tour?.title}.`,
      headerVariant: 'dark',
      body: `
        ${badge('New Booking Alert', BRAND.colorGold, BRAND.colorText)}
        <h2 style="margin:14px 0 20px;font-size:22px;font-weight:800;color:${BRAND.colorForest};">${esc(user.firstName)} ${esc(user.lastName)} just booked a safari</h2>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:20px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Name', `${esc(user.firstName)} ${esc(user.lastName)}`)}
            ${infoRow('Email', esc(user.email))}
            ${infoRow('Phone', esc(user.phone || 'Not provided'), true)}
          </table>
        </div>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bookingSummaryRows(booking)}</table>
        </div>
        ${ctaButton('Open Admin Panel', `${BRAND.adminPanel}`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── ACCOMMODATION BOOKING — USER ─────────────────────────────────────
  bookingAccommodationUser: (booking, user) => ({
    subject: `Booking Received — ${esc(booking.bookingRef)} · ${esc(booking.accommodation?.name || 'Your Stay')}`,
    html: shell({
      preheader: `Your stay at ${booking.accommodation?.name} has been received.`,
      headerVariant: 'teal',
      body: `
        <div style="background:linear-gradient(135deg,#ecfeff,#cffafe);border:1.5px solid #67e8f9;border-radius:14px;padding:20px 24px;margin-bottom:28px;text-align:center;">
          <div style="font-size:36px;margin-bottom:8px;">&#127968;</div>
          <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:${BRAND.colorTeal};">Stay Booking Received</h2>
          <p style="margin:0;font-size:13px;color:#0e7490;">Reference: <strong>${esc(booking.bookingRef)}</strong></p>
        </div>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 24px;">
          Hi <strong>${esc(user.firstName)}</strong>, thanks for booking your stay with us. Here is your summary:
        </p>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bookingSummaryRows(booking)}</table>
        </div>
        ${ctaButton('View My Booking', `${BRAND.website}/my-portal.html`, BRAND.colorTeal, '#fff')}
      `,
    }),
  }),

  // ── ACCOMMODATION BOOKING — ADMIN ────────────────────────────────────
  bookingAccommodationAdmin: (booking, user) => ({
    subject: `New Stay Booking — ${esc(booking.bookingRef)} · ${esc(user.firstName)} ${esc(user.lastName)}`,
    html: shell({
      preheader: `${user.firstName} ${user.lastName} just booked ${booking.accommodation?.name}.`,
      headerVariant: 'dark',
      body: `
        ${badge('New Stay Booking', BRAND.colorTeal, '#fff')}
        <h2 style="margin:14px 0 20px;font-size:22px;font-weight:800;color:${BRAND.colorForest};">${esc(user.firstName)} ${esc(user.lastName)} booked ${esc(booking.accommodation?.name || 'a stay')}</h2>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:20px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Guest', `${esc(user.firstName)} ${esc(user.lastName)}`)}
            ${infoRow('Email', esc(user.email))}
            ${infoRow('Phone', esc(user.phone || 'Not provided'), true)}
          </table>
        </div>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bookingSummaryRows(booking)}</table>
        </div>
        ${ctaButton('Open Admin Panel', `${BRAND.adminPanel}`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── "EMAIL ME THE DETAILS" (replaces the fake Download PDF button) ──
  bookingDetails: (booking, user) => {
    const isStay = booking.bookingType === 'accommodation';
    return {
      subject: `Your Booking Details — ${esc(booking.bookingRef)}`,
      html: shell({
        preheader: `Full details for your ${isStay ? 'stay' : 'safari'} booking ${booking.bookingRef}.`,
        headerVariant: isStay ? 'teal' : 'gold',
        body: `
          <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.colorForest};">Your Booking, In Full &#128203;</h2>
          <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 24px;">
            Hi <strong>${esc(user.firstName)}</strong>, as requested, here are the complete details of your booking with ${BRAND.name}.
          </p>
          <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:20px;border:1px solid ${BRAND.colorBorder};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bookingSummaryRows(booking)}</table>
          </div>
          ${booking.specialRequests ? `
            <div style="background:${BRAND.colorSand};border-left:4px solid ${BRAND.colorForestLight};border-radius:0 12px 12px 0;padding:16px 20px;margin-bottom:24px;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${BRAND.colorMuted};">Special Requests</p>
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">${esc(booking.specialRequests)}</p>
            </div>` : ''}
          <p style="font-size:13.5px;color:${BRAND.colorMuted};line-height:1.7;">
            Keep this email as your booking confirmation. You can also view live status any time in your portal.
          </p>
          ${ctaButton('Open My Portal', `${BRAND.website}/my-portal.html`, BRAND.colorForest, '#fff')}
        `,
      }),
    };
  },

  // ── CONTACT GUIDE (tour bookings) ────────────────────────────────────
  contactGuideAdmin: (booking, user, message) => ({
    subject: `Guest Message — ${esc(booking.bookingRef)} · ${esc(user.firstName)} ${esc(user.lastName)}`,
    html: shell({
      preheader: `${user.firstName} sent a message about their upcoming safari.`,
      headerVariant: 'dark',
      body: `
        ${badge('Guide Enquiry', BRAND.colorGold, BRAND.colorText)}
        <h2 style="margin:14px 0 20px;font-size:22px;font-weight:800;color:${BRAND.colorForest};">Message from ${esc(user.firstName)} ${esc(user.lastName)}</h2>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:20px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Guest', `${esc(user.firstName)} ${esc(user.lastName)}`)}
            ${infoRow('Email', esc(user.email))}
            ${infoRow('Booking Ref', esc(booking.bookingRef))}
            ${infoRow('Tour', esc(booking.tour?.title || '—'), true)}
          </table>
        </div>
        <div style="background:${BRAND.colorSand};border-left:4px solid ${BRAND.colorForestLight};border-radius:0 12px 12px 0;padding:18px 22px;margin-bottom:24px;">
          <p style="margin:0;font-size:14.5px;color:#374151;line-height:1.75;">${esc(message).replace(/\n/g, '<br/>')}</p>
        </div>
        ${ctaButton(`Reply to ${esc(user.firstName)}`, `mailto:${esc(user.email)}`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),
  contactGuideUser: (booking, user) => ({
    subject: `We received your message — ${esc(booking.bookingRef)}`,
    html: shell({
      preheader: 'Your guide has been notified and will respond shortly.',
      body: `
        <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.colorForest};">Message Sent to Your Guide &#128233;</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">
          Hi <strong>${esc(user.firstName)}</strong>, we've passed your message about booking
          <strong>${esc(booking.bookingRef)}</strong> to your safari guide/coordinator. Expect a reply within 24 hours.
        </p>
        ${ctaButton('View My Booking', `${BRAND.website}/my-portal.html`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── CONTACT HOST (accommodation bookings) ────────────────────────────
  contactHostAdmin: (booking, user, message) => ({
    subject: `Guest Message — ${esc(booking.bookingRef)} · ${esc(user.firstName)} ${esc(user.lastName)}`,
    html: shell({
      preheader: `${user.firstName} sent a message about their stay.`,
      headerVariant: 'dark',
      body: `
        ${badge('Host Enquiry', BRAND.colorTeal, '#fff')}
        <h2 style="margin:14px 0 20px;font-size:22px;font-weight:800;color:${BRAND.colorForest};">Message from ${esc(user.firstName)} ${esc(user.lastName)}</h2>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:20px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Guest', `${esc(user.firstName)} ${esc(user.lastName)}`)}
            ${infoRow('Email', esc(user.email))}
            ${infoRow('Booking Ref', esc(booking.bookingRef))}
            ${infoRow('Property', esc(booking.accommodation?.name || '—'), true)}
          </table>
        </div>
        <div style="background:${BRAND.colorSand};border-left:4px solid ${BRAND.colorTeal};border-radius:0 12px 12px 0;padding:18px 22px;margin-bottom:24px;">
          <p style="margin:0;font-size:14.5px;color:#374151;line-height:1.75;">${esc(message).replace(/\n/g, '<br/>')}</p>
        </div>
        ${ctaButton(`Reply to ${esc(user.firstName)}`, `mailto:${esc(user.email)}`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),
  contactHostUser: (booking, user) => ({
    subject: `We received your message — ${esc(booking.bookingRef)}`,
    html: shell({
      preheader: 'Your host has been notified and will respond shortly.',
      headerVariant: 'teal',
      body: `
        <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.colorForest};">Message Sent to Your Host &#128233;</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">
          Hi <strong>${esc(user.firstName)}</strong>, we've passed your message about booking
          <strong>${esc(booking.bookingRef)}</strong> to the property host/our team. Expect a reply within 24 hours.
        </p>
        ${ctaButton('View My Booking', `${BRAND.website}/my-portal.html`, BRAND.colorTeal, '#fff')}
      `,
    }),
  }),

  // ── ADMIN → GUEST: free-text "Email Guest" button ────────────────────
  emailGuestCustom: (booking, user, message, subjectLine) => ({
    subject: subjectLine || `An update on your booking — ${esc(booking.bookingRef)}`,
    html: shell({
      preheader: message.slice(0, 120),
      body: `
        <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.colorForest};">A Message From Our Team</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">Hi <strong>${esc(user.firstName)}</strong>,</p>
        <div style="background:${BRAND.colorSand};border-left:4px solid ${BRAND.colorForestLight};border-radius:0 12px 12px 0;padding:18px 22px;margin-bottom:24px;">
          <p style="margin:0;font-size:14.5px;color:#374151;line-height:1.8;">${esc(message).replace(/\n/g, '<br/>')}</p>
        </div>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:24px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Booking Reference', esc(booking.bookingRef))}
            ${infoRow('Status', esc(String(booking.status || '').toUpperCase()), true)}
          </table>
        </div>
        ${ctaButton('View My Booking', `${BRAND.website}/my-portal.html`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── ADMIN → APPLICANT: free-text "Email Applicant" button ────────────
  emailApplicantCustom: (application, user, message, subjectLine) => ({
    subject: subjectLine || `An update on your application — ${esc(application.applicationRef)}`,
    html: shell({
      preheader: message.slice(0, 120),
      headerVariant: 'gold',
      body: `
        <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.colorForest};">A Message From Our Team</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">Hi <strong>${esc(user.firstName)}</strong>,</p>
        <div style="background:${BRAND.colorSand};border-left:4px solid ${BRAND.colorForestLight};border-radius:0 12px 12px 0;padding:18px 22px;margin-bottom:24px;">
          <p style="margin:0;font-size:14.5px;color:#374151;line-height:1.8;">${esc(message).replace(/\n/g, '<br/>')}</p>
        </div>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:24px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Application Reference', esc(application.applicationRef))}
            ${infoRow('Status', esc(String(application.status || '').toUpperCase()), true)}
          </table>
        </div>
        ${ctaButton('View My Applications', `${BRAND.website}/my-portal.html`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── PASSWORD RESET ────────────────────────────────────────────────────
  passwordReset: (user, resetUrl) => ({
    subject: `Reset Your Password — Action Required`,
    html: shell({
      preheader: 'You requested a password reset. This link expires in 30 minutes.',
      headerVariant: 'dark',
      body: `
        <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.colorForest};">Password Reset Request &#128272;</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">
          Hi <strong>${esc(user.firstName)}</strong>, we received a request to reset the password for your account.
        </p>
        ${ctaButton('Reset My Password', resetUrl, BRAND.colorForest, '#fff')}
        ${alertBox('&#9200; <strong>This link expires in 30 minutes.</strong> If it has expired, request a new reset link from the login page.', 'warning')}
        <p style="font-size:13.5px;color:${BRAND.colorMuted};line-height:1.7;margin:0;">
          If you did not request this, ignore this email — your password will not change.
        </p>
      `,
    }),
  }),

  // ── PAYMENT CONFIRMED ────────────────────────────────────────────────
  paymentConfirmed: (booking, user, amount) => ({
    subject: `Payment Verified — ${esc(booking.bookingRef)}`,
    html: shell({
      preheader: `Your payment of ${amount} has been confirmed.`,
      body: `
        <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;border-radius:14px;padding:24px;margin-bottom:28px;text-align:center;">
          <div style="font-size:40px;margin-bottom:10px;">&#9989;</div>
          <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:${BRAND.colorSuccess};">Payment Verified</h2>
          <p style="margin:0;font-size:14px;color:#166534;">Your booking is now fully confirmed.</p>
        </div>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 24px;">
          Hi <strong>${esc(user.firstName)}</strong>, we've successfully verified your payment. There's nothing else you need to do.
        </p>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Booking Reference', esc(booking.bookingRef))}
            ${infoRow('Amount Paid', fmtMoney(amount, booking.currency))}
            ${infoRow('Payment Status', 'Verified &amp; Cleared', true)}
          </table>
        </div>
        ${ctaButton('View My Booking', `${BRAND.website}/my-portal.html`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── PAYMENT REJECTED ─────────────────────────────────────────────────
  paymentRejected: (booking, user, reason = '') => ({
    subject: `Action Required — Payment Not Verified · ${esc(booking.bookingRef)}`,
    html: shell({
      preheader: 'We could not verify your payment. Please review and resubmit.',
      body: `
        ${alertBox('&#9888;&#65039; We were unable to verify your payment. Please review and resubmit proof of payment.', 'danger')}
        <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${BRAND.colorDanger};">Payment Not Approved</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 24px;">
          Hi <strong>${esc(user.firstName)}</strong>, unfortunately we were unable to verify your payment. Your booking is currently on hold.
        </p>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:20px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Booking Reference', esc(booking.bookingRef))}
            ${reason ? infoRow('Reason', esc(reason)) : ''}
            ${infoRow('Action Required', 'Resubmit payment proof', true)}
          </table>
        </div>
        ${ctaButton('Resubmit Payment Proof', `${BRAND.website}/my-portal.html`, BRAND.colorDanger, '#fff')}
      `,
    }),
  }),

  // ── BANK RECEIPT RECEIVED (user) ─────────────────────────────────────
  bankReceiptReceived: (booking, user, amount) => ({
    subject: `Receipt Received — Verifying Your Payment · ${esc(booking.bookingRef)}`,
    html: shell({
      preheader: "Your payment receipt has been received. We'll verify it within 24 hours.",
      body: `
        <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.colorForest};">Payment Proof Received &#128233;</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 24px;">
          Hi <strong>${esc(user.firstName)}</strong>, we've received your payment receipt and it's being reviewed. You'll hear from us within <strong>24 hours</strong>.
        </p>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Booking Reference', esc(booking.bookingRef))}
            ${infoRow('Amount Submitted', fmtMoney(amount, booking.currency))}
            ${infoRow('Verification Status', 'Under Review', true)}
          </table>
        </div>
        ${ctaButton('View Booking Status', `${BRAND.website}/my-portal.html`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── BANK RECEIPT — ADMIN ALERT ───────────────────────────────────────
  bankReceiptAdminAlert: (booking, user, amount, receiptPath) => ({
    subject: `Bank Receipt Uploaded — ${esc(booking.bookingRef)} · ${esc(user.firstName)} ${esc(user.lastName)}`,
    html: shell({
      preheader: `${user.firstName} uploaded a payment receipt for ${amount}.`,
      headerVariant: 'dark',
      body: `
        ${badge('Payment Receipt Uploaded', BRAND.colorGold, BRAND.colorText)}
        <h2 style="margin:14px 0 20px;font-size:22px;font-weight:800;color:${BRAND.colorForest};">New Receipt Requires Verification</h2>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Customer', `${esc(user.firstName)} ${esc(user.lastName)}`)}
            ${infoRow('Email', esc(user.email))}
            ${infoRow('Booking Reference', esc(booking.bookingRef))}
            ${infoRow('Amount Claimed', fmtMoney(amount, booking.currency))}
            ${infoRow('Receipt', receiptPath ? `<a href="${esc(receiptPath)}" style="color:${BRAND.colorForestLight};">View Receipt</a>` : 'See admin panel', true)}
          </table>
        </div>
        ${ctaButton('Review in Admin Panel', `${BRAND.adminPanel}`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── BOOKING STATUS CHANGED — CONFIRMED ───────────────────────────────
  bookingConfirmed: (booking, user) => ({
    subject: `Booking Confirmed — ${esc(booking.bookingRef)}`,
    html: shell({
      preheader: `Your booking ${booking.bookingRef} is now confirmed.`,
      headerVariant: 'gold',
      body: `
        <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;border-radius:14px;padding:20px 24px;margin-bottom:28px;text-align:center;">
          <div style="font-size:36px;margin-bottom:8px;">&#9989;</div>
          <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:${BRAND.colorSuccess};">Booking Confirmed</h2>
        </div>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 24px;">
          Hi <strong>${esc(user.firstName)}</strong>, great news — your booking <strong>${esc(booking.bookingRef)}</strong> is now confirmed.
        </p>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bookingSummaryRows(booking)}</table>
        </div>
        ${ctaButton('View My Booking', `${BRAND.website}/my-portal.html`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── BOOKING CANCELLED — USER ─────────────────────────────────────────
  bookingCancelled: (booking, user, reason = '') => ({
    subject: `Booking Cancelled — ${esc(booking.bookingRef)}`,
    html: shell({
      preheader: `Your booking ${booking.bookingRef} has been cancelled.`,
      body: `
        ${alertBox('Your booking has been cancelled. See details below.', 'danger')}
        <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${BRAND.colorDanger};">Booking Cancelled</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">
          Hi <strong>${esc(user.firstName)}</strong>, your booking <strong>${esc(booking.bookingRef)}</strong> has been cancelled.
        </p>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:24px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Booking Reference', esc(booking.bookingRef))}
            ${infoRow('Reason', esc(reason || 'Not specified'), true)}
          </table>
        </div>
        <p style="font-size:13.5px;color:${BRAND.colorMuted};line-height:1.7;">
          If you believe this was a mistake or would like to rebook, please contact us.
        </p>
        ${ctaButton('Contact Us', `${BRAND.website}/contact.html`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── BOOKING CANCELLED — ADMIN (internal notice) ──────────────────────
  bookingCancelledAdmin: (booking, user, reason = '') => ({
    subject: `Booking Cancelled — ${esc(booking.bookingRef)} · ${esc(user.firstName)} ${esc(user.lastName)}`,
    html: shell({
      preheader: `${user.firstName} ${user.lastName}'s booking was cancelled.`,
      headerVariant: 'dark',
      body: `
        ${badge('Cancellation', BRAND.colorDanger, '#fff')}
        <h2 style="margin:14px 0 20px;font-size:22px;font-weight:800;color:${BRAND.colorForest};">Booking Cancelled</h2>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Guest', `${esc(user.firstName)} ${esc(user.lastName)}`)}
            ${infoRow('Email', esc(user.email))}
            ${infoRow('Booking Reference', esc(booking.bookingRef))}
            ${infoRow('Reason', esc(reason || 'Not specified'), true)}
          </table>
        </div>
        ${ctaButton('Open Admin Panel', `${BRAND.adminPanel}`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── VOLUNTEER — APPLICATION RECEIVED (USER) ──────────────────────────
  volunteerReceived: (user, programName) => ({
    subject: `Application Received — ${esc(programName)}`,
    html: shell({
      preheader: `We've received your volunteer application for ${programName}.`,
      headerVariant: 'gold',
      body: `
        <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.colorForest};">Application Received &#127807;</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">
          Hi <strong>${esc(user.firstName)}</strong>, thank you for applying to volunteer with us for
          <strong>${esc(programName)}</strong>. Our team reviews every application personally — you'll hear back within <strong>48 hours</strong>.
        </p>
        ${ctaButton('Browse Other Programs', `${BRAND.website}/volunteer.html`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── VOLUNTEER — ADMIN ALERT ──────────────────────────────────────────
  volunteerAdminAlert: (user, program, ref) => ({
    subject: `New Volunteer Application — ${esc(ref)} · ${esc(program.title)}`,
    html: shell({
      preheader: `${user.firstName} ${user.lastName} just applied for ${program.title}.`,
      headerVariant: 'dark',
      body: `
        ${badge('New Volunteer Application', BRAND.colorForestLight, BRAND.colorForest)}
        <h2 style="margin:14px 0 20px;font-size:22px;font-weight:800;color:${BRAND.colorForest};">New Application Requires Review</h2>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Applicant', `${esc(user.firstName)} ${esc(user.lastName)}`)}
            ${infoRow('Email', esc(user.email))}
            ${infoRow('Program', esc(program.title))}
            ${infoRow('Reference', esc(ref), true)}
          </table>
        </div>
        ${ctaButton('Review Application', `${BRAND.adminPanel}`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── VOLUNTEER — STATUS UPDATE (approved / rejected / under_review) ──
  volunteerStatusUpdate: (user, programName, status, ref, notes = '', rejection = '') => {
    const isApproved = String(status).toLowerCase() === 'approved';
    const isRejected = String(status).toLowerCase() === 'rejected';
    return {
      subject: `Your Application has been ${esc(status)} — ${esc(programName)}`,
      html: shell({
        preheader: `Your application for ${programName} has been ${status}.`,
        headerVariant: isApproved ? 'gold' : 'default',
        body: `
          <div style="background:${isApproved ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : isRejected ? 'linear-gradient(135deg,#fef2f2,#fee2e2)' : 'linear-gradient(135deg,#f5f3ff,#ede9fe)'};
            border:1.5px solid ${isApproved ? '#86efac' : isRejected ? '#fca5a5' : '#c4b5fd'};
            border-radius:14px;padding:24px;margin-bottom:28px;text-align:center;">
            <div style="font-size:36px;margin-bottom:10px;">${isApproved ? '&#127881;' : isRejected ? '&#128203;' : '&#128269;'}</div>
            <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:${isApproved ? BRAND.colorSuccess : isRejected ? BRAND.colorDanger : '#6d28d9'};">Application ${esc(status)}</h2>
            <p style="margin:0;font-size:13px;color:#374151;">Reference: ${esc(ref)}</p>
          </div>
          <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">
            Hi <strong>${esc(user.firstName)}</strong>, your application for <strong>${esc(programName)}</strong> has been <strong>${esc(status)}</strong>.
          </p>
          ${notes ? `
            <div style="background:${BRAND.colorSand};border-radius:14px;padding:20px 24px;margin-bottom:20px;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${BRAND.colorMuted};">Notes from our team</p>
              <p style="margin:0;font-size:14.5px;line-height:1.7;color:#374151;">${esc(notes)}</p>
            </div>` : ''}
          ${rejection ? alertBox(`<strong>Reason:</strong> ${esc(rejection)}`, 'danger') : ''}
          ${isApproved
            ? ctaButton('View My Program Details', `${BRAND.website}/my-portal.html`, BRAND.colorForest, '#fff')
            : ctaButton('Browse Other Programs', `${BRAND.website}/volunteer.html`, BRAND.colorMuted, '#fff')}
        `,
      }),
    };
  },

  // ── CONTACT FORM — AUTO-REPLY (USER) ─────────────────────────────────
  contact: (data) => {
    const name = typeof data === 'string' ? data : (data.firstName || 'there');
    return {
      subject: `We've received your message — ${BRAND.name}`,
      html: shell({
        preheader: `Hi ${name}, we've received your enquiry.`,
        body: `
          <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.colorForest};">We've Got Your Message &#128233;</h2>
          <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">
            Hi <strong>${esc(name)}</strong>, thank you for reaching out. A member of our team will respond personally within <strong>2 business hours</strong>.
          </p>
          ${ctaButton('Browse Tours While You Wait', `${BRAND.website}/tours.html`)}
        `,
      }),
    };
  },

  // ── CONTACT FORM — ADMIN ─────────────────────────────────────────────
  contactAdmin: (data) => ({
    subject: `[Enquiry] ${esc(data.firstName)} ${esc(data.lastName || '')} · ${esc(data.email)}`,
    html: shell({
      preheader: `New website enquiry from ${data.firstName}.`,
      headerVariant: 'dark',
      body: `
        ${badge('Website Enquiry', BRAND.colorGold, BRAND.colorText)}
        <h2 style="margin:14px 0 20px;font-size:22px;font-weight:800;color:${BRAND.colorForest};">New Enquiry from ${esc(data.firstName)} ${esc(data.lastName || '')}</h2>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:20px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Email', esc(data.email))}
            ${infoRow('Phone', esc(data.phone || 'Not provided'), true)}
          </table>
        </div>
        <div style="background:${BRAND.colorSand};border-left:4px solid ${BRAND.colorForestLight};border-radius:0 12px 12px 0;padding:20px 24px;margin-bottom:28px;">
          <p style="margin:0;font-size:14.5px;color:#374151;line-height:1.75;">${esc(data.message || '').replace(/\n/g, '<br/>')}</p>
        </div>
        ${ctaButton(`Reply to ${esc(data.firstName)}`, `mailto:${esc(data.email)}`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── NEWSLETTER ────────────────────────────────────────────────────────
  newsletter: (email) => ({
    subject: `Welcome to the ${BRAND.name} Newsletter`,
    html: shell({
      preheader: 'Thanks for subscribing.',
      body: `
        <h2 style="margin:0 0 12px;color:${BRAND.colorForest};font-size:26px;font-weight:800;">Welcome Aboard! &#127757;</h2>
        <p style="font-size:15px;line-height:1.8;color:#374151;">Thank you for subscribing. You'll be first to hear about new tours, volunteer openings and travel tips.</p>
        ${ctaButton('Explore Tours', `${BRAND.website}/tours.html`)}
      `,
    }),
  }),
  newsletterAdmin: (email) => ({
    subject: `New Newsletter Subscriber`,
    html: shell({
      headerVariant: 'dark',
      body: `
        ${badge('Newsletter')}
        <h2 style="color:${BRAND.colorForest};margin:14px 0;">New Subscriber</h2>
        <table role="presentation" width="100%">${infoRow('Email', esc(email), true)}</table>
        ${ctaButton('Open Admin Dashboard', BRAND.adminPanel)}
      `,
    }),
  }),

};

module.exports = { sendEmail, emails, BRAND };