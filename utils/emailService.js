const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// BRAND CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const BRAND = {
  name: 'Osimlai Adventures',
  tagline: 'Luxury African Safari Experiences',
  website: process.env.CLIENT_URL,
  adminPanel: `${process.env.CLIENT_URL}/admin`,
  supportEmail: process.env.SUPPORT_EMAIL || 'support@osimlai.com',
  phone: process.env.SUPPORT_PHONE || '+254 700 000 000',
  address: 'Nairobi, Kenya · East Africa',

  // Design tokens
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

  font: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED BUILDING BLOCKS
// ─────────────────────────────────────────────────────────────────────────────

/** Escape HTML to prevent XSS in dynamic content */
const esc = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A labelled info row for summary cards */
const infoRow = (label, value, last = false) => `
  <tr>
    <td style="
      padding: 12px 0;
      ${last ? '' : `border-bottom: 1px solid ${BRAND.colorBorder};`}
      vertical-align: top;
    ">
      <span style="
        display: block;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: ${BRAND.colorMuted};
        margin-bottom: 3px;
      ">${label}</span>
      <span style="
        font-size: 15px;
        font-weight: 600;
        color: ${BRAND.colorText};
      ">${esc(value)}</span>
    </td>
  </tr>`;

/** A badge pill */
const badge = (text, bgColor = BRAND.colorForest, textColor = '#fff') => `
  <span style="
    display: inline-block;
    background: ${bgColor};
    color: ${textColor};
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 5px 12px;
    border-radius: 999px;
  ">${text}</span>`;

/** A primary CTA button */
const ctaButton = (text, href, bg = BRAND.colorGold, color = BRAND.colorText) => `
  <div style="text-align: center; margin: 32px 0 8px;">
    <a href="${href}"
       style="
         display: inline-block;
         background: ${bg};
         color: ${color};
         font-size: 15px;
         font-weight: 700;
         text-decoration: none;
         padding: 16px 36px;
         border-radius: 10px;
         letter-spacing: 0.02em;
       ">${text}</a>
  </div>`;

/** Divider line */
const divider = (margin = '24px 0') => `
  <div style="height: 1px; background: ${BRAND.colorBorder}; margin: ${margin};"></div>`;

/** Alert / notice box */
const alertBox = (content, type = 'info') => {
  const colors = {
    info:    { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8' },
    warning: { bg: '#fffbeb', border: BRAND.colorGold,   text: '#92400e' },
    danger:  { bg: '#fef2f2', border: BRAND.colorDanger, text: BRAND.colorDanger },
    success: { bg: '#f0fdf4', border: BRAND.colorSuccess, text: BRAND.colorSuccess },
  };
  const c = colors[type] || colors.info;
  return `
    <div style="
      background: ${c.bg};
      border-left: 4px solid ${c.border};
      border-radius: 0 8px 8px 0;
      padding: 14px 18px;
      margin: 20px 0;
    ">
      <p style="margin: 0; font-size: 13.5px; color: ${c.text}; line-height: 1.6;">
        ${content}
      </p>
    </div>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// MASTER EMAIL SHELL
// ─────────────────────────────────────────────────────────────────────────────

const shell = ({ preheader = '', body, headerVariant = 'default' }) => {
  const headerBg = {
    default: `linear-gradient(150deg, ${BRAND.colorForest} 0%, ${BRAND.colorForestMid} 100%)`,
    dark:    `linear-gradient(150deg, #0d1f18 0%, ${BRAND.colorForest} 100%)`,
    gold:    `linear-gradient(150deg, ${BRAND.colorForest} 0%, #3a5a35 60%, #5a4010 100%)`,
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
    ${esc(preheader)}&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:${BRAND.colorSand};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:${BRAND.colorWhite};
                    border-radius:20px;overflow:hidden;
                    box-shadow:0 8px 40px rgba(0,0,0,0.10);">

        <!-- HEADER -->
        <tr>
          <td style="background:${headerBg};padding:36px 40px;text-align:center;">
            <div style="
              display:inline-block;width:56px;height:56px;
              background:rgba(255,255,255,0.12);border-radius:14px;
              line-height:56px;font-size:28px;margin-bottom:14px;
            ">&#127807;</div>
            <h1 style="margin:0 0 4px;color:${BRAND.colorWhite};font-size:20px;
                       font-weight:800;letter-spacing:0.03em;">${BRAND.name}</h1>
            <p style="margin:0;color:rgba(255,255,255,0.65);font-size:12px;
                      font-weight:500;letter-spacing:0.08em;text-transform:uppercase;">
              ${BRAND.tagline}
            </p>
            <div style="width:48px;height:3px;background:${BRAND.colorGold};
                        border-radius:999px;margin:18px auto 0;"></div>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:40px;">
            ${body}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f3f4f6;border-top:1px solid ${BRAND.colorBorder};
                     padding:28px 40px;text-align:center;">
            <p style="margin:0 0 14px;font-size:12px;color:${BRAND.colorMuted};">Follow the adventure</p>
            <div style="margin-bottom:20px;">
              <a href="${BRAND.website}" style="display:inline-block;margin:0 4px;background:${BRAND.colorForest};color:#fff;font-size:11px;font-weight:700;text-decoration:none;padding:6px 12px;border-radius:6px;">Instagram</a>
              <a href="${BRAND.website}" style="display:inline-block;margin:0 4px;background:${BRAND.colorForest};color:#fff;font-size:11px;font-weight:700;text-decoration:none;padding:6px 12px;border-radius:6px;">Facebook</a>
              <a href="${BRAND.website}" style="display:inline-block;margin:0 4px;background:${BRAND.colorForest};color:#fff;font-size:11px;font-weight:700;text-decoration:none;padding:6px 12px;border-radius:6px;">YouTube</a>
              <a href="${BRAND.website}" style="display:inline-block;margin:0 4px;background:${BRAND.colorForest};color:#fff;font-size:11px;font-weight:700;text-decoration:none;padding:6px 12px;border-radius:6px;">Twitter</a>
            </div>
            <p style="margin:0 0 6px;font-size:12px;color:${BRAND.colorMuted};">
              &copy; ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.
            </p>
            <p style="margin:0;font-size:12px;color:${BRAND.colorMuted};">
              ${BRAND.address} &middot;
              <a href="${BRAND.website}" style="color:${BRAND.colorForestLight};text-decoration:none;">${BRAND.website}</a>
            </p>
            <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">
              You received this because you have an account or made an enquiry with us.
              <a href="${BRAND.website}/unsubscribe" style="color:#9ca3af;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// CORE SEND FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

const sendEmail = async ({ to, subject, html, text }) => {
  const msg = {
    to,
    from: { email: process.env.SENDGRID_FROM_EMAIL, name: BRAND.name },
    subject,
    html,
  };
  if (text) msg.text = text;
  return sgMail.send(msg);
};

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

const emails = {

  // ── 1. WELCOME ─────────────────────────────────────────────────────────────
  welcome: (user) => ({
    subject: `Welcome to ${BRAND.name} — Your Africa Journey Begins`,
    html: shell({
      preheader: `Hi ${user.firstName}, your adventure account is ready.`,
      headerVariant: 'gold',
      body: `
        <h2 style="margin:0 0 8px;font-size:26px;font-weight:800;color:${BRAND.colorForest};">
          Welcome, ${esc(user.firstName)} &#128075;
        </h2>
        <p style="margin:0 0 24px;font-size:13px;color:${BRAND.colorMuted};font-weight:600;
                  text-transform:uppercase;letter-spacing:0.06em;">Your account is now active</p>

        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">
          We're delighted to have you join the Osimlai Adventuress community — a circle of
          travellers who believe that Africa is not just a destination, but a transformation.
        </p>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 28px;">
          From the endless Serengeti plains to the misty gorilla forests of Rwanda, your next
          extraordinary chapter starts here.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td width="33%" style="padding:0 6px 0 0;text-align:center;vertical-align:top;">
              <div style="background:${BRAND.colorSand};border-radius:14px;padding:20px 12px;">
                <div style="font-size:26px;margin-bottom:10px;">&#128506;</div>
                <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${BRAND.colorForest};">Curated Tours</p>
                <p style="margin:0;font-size:12px;color:${BRAND.colorMuted};line-height:1.5;">Hand-crafted itineraries across East &amp; Southern Africa</p>
              </div>
            </td>
            <td width="33%" style="padding:0 3px;text-align:center;vertical-align:top;">
              <div style="background:${BRAND.colorSand};border-radius:14px;padding:20px 12px;">
                <div style="font-size:26px;margin-bottom:10px;">&#127957;</div>
                <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${BRAND.colorForest};">Luxury Camps</p>
                <p style="margin:0;font-size:12px;color:${BRAND.colorMuted};line-height:1.5;">Exclusive access to premier lodges and private conservancies</p>
              </div>
            </td>
            <td width="33%" style="padding:0 0 0 6px;text-align:center;vertical-align:top;">
              <div style="background:${BRAND.colorSand};border-radius:14px;padding:20px 12px;">
                <div style="font-size:26px;margin-bottom:10px;">&#127807;</div>
                <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${BRAND.colorForest};">Conservation</p>
                <p style="margin:0;font-size:12px;color:${BRAND.colorMuted};line-height:1.5;">Every booking supports local wildlife and community projects</p>
              </div>
            </td>
          </tr>
        </table>

        ${ctaButton('Explore Our Tours', `${BRAND.website}/tours.html`)}
        ${divider()}
        <p style="font-size:13px;color:${BRAND.colorMuted};text-align:center;margin:0;">
          Questions? Our team responds within 2 hours &middot;
          <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.colorForestLight};text-decoration:none;">${BRAND.supportEmail}</a>
        </p>
      `,
    }),
  }),

  // ── 2. BOOKING CONFIRMATION (USER) ─────────────────────────────────────────
  bookingUser: (booking, user) => ({
    subject: `Booking Confirmed — ${esc(booking.bookingRef)} &middot; ${esc(booking.tour?.title)}`,
    html: shell({
      preheader: `Your safari to ${booking.tour?.title} is confirmed. Here are your details.`,
      headerVariant: 'gold',
      body: `
        <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;
                    border-radius:14px;padding:20px 24px;margin-bottom:28px;text-align:center;">
          <div style="font-size:36px;margin-bottom:8px;">&#127881;</div>
          <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:${BRAND.colorSuccess};">Safari Confirmed</h2>
          <p style="margin:0;font-size:13px;color:#166534;">Reference: <strong>${esc(booking.bookingRef)}</strong></p>
        </div>

        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 24px;">
          Hi <strong>${esc(user.firstName)}</strong>, your safari with Osimlai Adventuress is
          officially confirmed. Below is a summary — please keep this for your records.
        </p>

        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;
                    margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Tour', booking.tour?.title || 'N/A')}
            ${infoRow('Destination', booking.tour?.destination || 'East Africa')}
            ${infoRow('Departure Date', booking.startDate)}
            ${infoRow('Duration', booking.tour?.duration || 'As per itinerary')}
            ${infoRow('Travellers', String(booking.numberOfTravelers))}
            ${infoRow('Booking Reference', booking.bookingRef)}
            ${infoRow('Status', '&#9989; Confirmed', true)}
          </table>
        </div>

        <h3 style="margin:0 0 14px;font-size:15px;font-weight:700;color:${BRAND.colorForest};">What Happens Next</h3>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td style="width:40px;vertical-align:top;padding:0 16px 16px 0;">
              <div style="width:32px;height:32px;background:${BRAND.colorForest};border-radius:8px;text-align:center;line-height:32px;font-size:11px;font-weight:800;color:${BRAND.colorGold};">01</div>
            </td>
            <td style="padding:0 0 16px;vertical-align:top;">
              <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:${BRAND.colorForest};">Documents</p>
              <p style="margin:0;font-size:13.5px;color:${BRAND.colorMuted};line-height:1.6;">Your full itinerary and packing guide will arrive 14 days before departure.</p>
            </td>
          </tr>
          <tr>
            <td style="width:40px;vertical-align:top;padding:0 16px 16px 0;">
              <div style="width:32px;height:32px;background:${BRAND.colorForest};border-radius:8px;text-align:center;line-height:32px;font-size:11px;font-weight:800;color:${BRAND.colorGold};">02</div>
            </td>
            <td style="padding:0 0 16px;vertical-align:top;">
              <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:${BRAND.colorForest};">Pre-departure Call</p>
              <p style="margin:0;font-size:13.5px;color:${BRAND.colorMuted};line-height:1.6;">Your personal safari consultant will call you 7 days before travel.</p>
            </td>
          </tr>
          <tr>
            <td style="width:40px;vertical-align:top;padding:0 16px 0 0;">
              <div style="width:32px;height:32px;background:${BRAND.colorForest};border-radius:8px;text-align:center;line-height:32px;font-size:11px;font-weight:800;color:${BRAND.colorGold};">03</div>
            </td>
            <td style="vertical-align:top;">
              <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:${BRAND.colorForest};">Departure</p>
              <p style="margin:0;font-size:13.5px;color:${BRAND.colorMuted};line-height:1.6;">Your dedicated guide and vehicle will meet you at the agreed point.</p>
            </td>
          </tr>
        </table>

        ${ctaButton('View Your Booking', `${BRAND.website}/my-bookings`, BRAND.colorForest, '#fff')}
        ${divider()}
        <p style="font-size:13px;color:${BRAND.colorMuted};text-align:center;margin:0;">
          Need help? Call <a href="tel:${BRAND.phone}" style="color:${BRAND.colorForestLight};text-decoration:none;">${BRAND.phone}</a>
          or email <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.colorForestLight};text-decoration:none;">${BRAND.supportEmail}</a>
        </p>
      `,
    }),
  }),

  // ── 3. BOOKING ALERT (ADMIN) ───────────────────────────────────────────────
  bookingAdmin: (booking, user) => ({
    subject: `&#128680; New Booking — ${esc(booking.bookingRef)} &middot; ${esc(user.firstName)} ${esc(user.lastName)}`,
    html: shell({
      preheader: `${user.firstName} ${user.lastName} just booked ${booking.tour?.title}. Review now.`,
      headerVariant: 'dark',
      body: `
        ${badge('&#9889; New Booking Alert', BRAND.colorGold, BRAND.colorText)}
        <h2 style="margin:14px 0 4px;font-size:22px;font-weight:800;color:${BRAND.colorForest};">
          ${esc(user.firstName)} ${esc(user.lastName)} just booked a safari
        </h2>
        <p style="margin:0 0 28px;font-size:13px;color:${BRAND.colorMuted};">
          Received ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} EAT
        </p>

        <h3 style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${BRAND.colorMuted};">Customer</h3>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:20px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Name', `${user.firstName} ${user.lastName}`)}
            ${infoRow('Email', user.email)}
            ${infoRow('Phone', user.phone || 'Not provided', true)}
          </table>
        </div>

        <h3 style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${BRAND.colorMuted};">Booking Details</h3>
        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Tour', booking.tour?.title || 'N/A')}
            ${infoRow('Departure', booking.startDate)}
            ${infoRow('Travellers', String(booking.numberOfTravelers))}
            ${infoRow('Booking Ref', booking.bookingRef)}
            ${infoRow('Total Amount', String(booking.totalAmount), true)}
          </table>
        </div>

        ${ctaButton('Open Admin Panel', `${BRAND.adminPanel}/bookings`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── 4. PASSWORD RESET ──────────────────────────────────────────────────────
  passwordReset: (user, resetUrl) => ({
    subject: `Reset Your Password — Action Required`,
    html: shell({
      preheader: 'You requested a password reset. This link expires in 30 minutes.',
      headerVariant: 'dark',
      body: `
        <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.colorForest};">Password Reset Request &#128272;</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">
          Hi <strong>${esc(user.firstName)}</strong>, we received a request to reset the password
          for your Osimlai Adventuress account.
        </p>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 24px;">
          Click the button below. For your security, this link expires in <strong>30 minutes</strong>.
        </p>

        ${ctaButton('Reset My Password', resetUrl, BRAND.colorForest, '#fff')}

        ${alertBox('&#9200; <strong>This link expires in 30 minutes.</strong> If it has expired, submit a new reset request from the login page.', 'warning')}
        ${divider()}
        <p style="font-size:13.5px;color:${BRAND.colorMuted};line-height:1.7;margin:0;">
          If you did <strong>not</strong> request this, ignore this email — your password will not change.
          Concerned about unauthorised access?
          <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.colorForestLight};text-decoration:none;">${BRAND.supportEmail}</a>
        </p>
      `,
    }),
  }),

  // ── 5. PAYMENT CONFIRMED ───────────────────────────────────────────────────
  paymentConfirmed: (booking, user, amount) => ({
    subject: `&#9989; Payment Verified — ${esc(booking.bookingRef)}`,
    html: shell({
      preheader: `Your payment of ${amount} for ${booking.tour?.title} has been confirmed.`,
      body: `
        <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;
                    border-radius:14px;padding:24px;margin-bottom:28px;text-align:center;">
          <div style="font-size:40px;margin-bottom:10px;">&#9989;</div>
          <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:${BRAND.colorSuccess};">Payment Verified</h2>
          <p style="margin:0;font-size:14px;color:#166534;">Your safari is now fully confirmed.</p>
        </div>

        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 24px;">
          Hi <strong>${esc(user.firstName)}</strong>, we have successfully verified your payment.
          There's nothing more you need to do — sit back and start dreaming about your upcoming adventure.
        </p>

        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;
                    margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Tour', booking.tour?.title || 'N/A')}
            ${infoRow('Booking Reference', booking.bookingRef)}
            ${infoRow('Amount Paid', String(amount))}
            ${infoRow('Payment Status', '&#9989; Verified &amp; Cleared', true)}
          </table>
        </div>

        ${ctaButton('View My Booking', `${BRAND.website}/my-bookings`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── 6. PAYMENT REJECTED ────────────────────────────────────────────────────
  paymentRejected: (booking, user, reason = '') => ({
    subject: `Action Required — Payment Not Verified &middot; ${esc(booking.bookingRef)}`,
    html: shell({
      preheader: 'We could not verify your payment. Please review and resubmit.',
      body: `
        ${alertBox('&#9888;&#65039; We were unable to verify your payment. Please review the details below and resubmit correct proof of payment.', 'danger')}

        <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${BRAND.colorDanger};">Payment Not Approved</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 24px;">
          Hi <strong>${esc(user.firstName)}</strong>, unfortunately we were unable to verify your payment.
          This may be due to incorrect details or an unreadable receipt. Your booking is currently on hold.
        </p>

        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;
                    margin-bottom:20px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Tour', booking.tour?.title || 'N/A')}
            ${infoRow('Booking Reference', booking.bookingRef)}
            ${reason ? infoRow('Reason', reason) : ''}
            ${infoRow('Action Required', 'Resubmit payment proof', true)}
          </table>
        </div>

        ${ctaButton('Resubmit Payment Proof', `${BRAND.website}/my-bookings`, BRAND.colorDanger, '#fff')}
        ${divider()}
        <p style="font-size:13.5px;color:${BRAND.colorMuted};line-height:1.7;margin:0;">
          Need assistance? Call <a href="tel:${BRAND.phone}" style="color:${BRAND.colorForestLight};text-decoration:none;">${BRAND.phone}</a>
          or email <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.colorForestLight};text-decoration:none;">${BRAND.supportEmail}</a>
        </p>
      `,
    }),
  }),

  // ── 7. BANK RECEIPT — USER CONFIRMATION ───────────────────────────────────
  bankReceiptReceived: (booking, user, amount) => ({
    subject: `Receipt Received — Verifying Your Payment &middot; ${esc(booking.bookingRef)}`,
    html: shell({
      preheader: "Your payment receipt has been received. We'll verify it within 24 hours.",
      body: `
        <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.colorForest};">Payment Proof Received &#128233;</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 24px;">
          Hi <strong>${esc(user.firstName)}</strong>, we have received your payment receipt and
          our accounts team is reviewing it. You will hear from us within <strong>24 hours</strong>.
        </p>

        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;
                    margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Booking Reference', booking.bookingRef)}
            ${infoRow('Tour', booking.tour?.title || 'N/A')}
            ${infoRow('Amount Submitted', String(amount))}
            ${infoRow('Verification Status', '&#9203; Under Review', true)}
          </table>
        </div>

        ${alertBox('&#9200; Our accounts team verifies receipts Monday–Friday, 8 AM – 6 PM EAT. Weekend submissions are processed first thing Monday morning.', 'info')}
        ${ctaButton('View Booking Status', `${BRAND.website}/my-bookings`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── 8. BANK RECEIPT — ADMIN ALERT ─────────────────────────────────────────
  bankReceiptAdminAlert: (booking, user, amount, receiptPath) => ({
    subject: `&#127974; Bank Receipt Uploaded — ${esc(booking.bookingRef)} &middot; ${esc(user.firstName)} ${esc(user.lastName)}`,
    html: shell({
      preheader: `${user.firstName} uploaded a payment receipt for ${amount}. Review in admin.`,
      headerVariant: 'dark',
      body: `
        ${badge('&#128179; Payment Receipt Uploaded', BRAND.colorGold, BRAND.colorText)}
        <h2 style="margin:14px 0 4px;font-size:22px;font-weight:800;color:${BRAND.colorForest};">New Receipt Requires Verification</h2>
        <p style="margin:0 0 28px;font-size:13px;color:${BRAND.colorMuted};">
          Submitted ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} EAT
        </p>

        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;
                    margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Customer', `${user.firstName} ${user.lastName}`)}
            ${infoRow('Email', user.email)}
            ${infoRow('Booking Reference', booking.bookingRef)}
            ${infoRow('Tour', booking.tour?.title || 'N/A')}
            ${infoRow('Amount Claimed', String(amount))}
            ${infoRow('Receipt File', receiptPath || 'See admin panel', true)}
          </table>
        </div>

        ${ctaButton('Review Receipt in Admin', `${BRAND.adminPanel}/bookings`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── 9. VOLUNTEER — APPLICATION RECEIVED (USER) ────────────────────────────
  volunteerReceived: (user, programName) => ({
    subject: `Application Received — ${esc(programName)}`,
    html: shell({
      preheader: `We've received your volunteer application for ${programName}. We'll be in touch within 48 hours.`,
      headerVariant: 'gold',
      body: `
        <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.colorForest};">Application Received &#127807;</h2>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">
          Hi <strong>${esc(user.firstName)}</strong>, thank you for applying to volunteer with
          Osimlai Adventuress. We've successfully received your application for
          <strong>${esc(programName)}</strong>.
        </p>
        <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 28px;">
          Our team reviews every application personally to ensure the right fit. You'll hear
          back within <strong>48 hours</strong>.
        </p>

        <div style="background:${BRAND.colorSand};border-radius:14px;padding:24px;margin-bottom:28px;">
          <h3 style="margin:0 0 16px;font-size:13px;font-weight:700;color:${BRAND.colorForest};
                     text-transform:uppercase;letter-spacing:0.06em;">What Happens Next</h3>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:100px;vertical-align:top;padding:0 16px 14px 0;">
                <span style="font-size:11px;font-weight:700;color:${BRAND.colorGold};text-transform:uppercase;letter-spacing:0.05em;">Within 48 hrs</span>
              </td>
              <td style="padding:0 0 14px;font-size:13.5px;color:#374151;line-height:1.6;">Our volunteer coordinator reviews your application</td>
            </tr>
            <tr>
              <td style="width:100px;vertical-align:top;padding:0 16px 14px 0;">
                <span style="font-size:11px;font-weight:700;color:${BRAND.colorGold};text-transform:uppercase;letter-spacing:0.05em;">3–5 days</span>
              </td>
              <td style="padding:0 0 14px;font-size:13.5px;color:#374151;line-height:1.6;">You may be invited for a short video call interview</td>
            </tr>
            <tr>
              <td style="width:100px;vertical-align:top;padding:0 16px 0 0;">
                <span style="font-size:11px;font-weight:700;color:${BRAND.colorGold};text-transform:uppercase;letter-spacing:0.05em;">On approval</span>
              </td>
              <td style="font-size:13.5px;color:#374151;line-height:1.6;">You receive your full program kit and pre-departure guide</td>
            </tr>
          </table>
        </div>

        ${ctaButton('Browse Other Programs', `${BRAND.website}/volunteer.html`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── 10. VOLUNTEER — ADMIN ALERT ───────────────────────────────────────────
  volunteerAdminAlert: (user, program, ref) => ({
    subject: `&#128276; New Volunteer Application — ${esc(ref)} &middot; ${esc(program.title)}`,
    html: shell({
      preheader: `${user.firstName} ${user.lastName} just applied for ${program.title}. Review now.`,
      headerVariant: 'dark',
      body: `
        ${badge('&#127807; New Volunteer Application', BRAND.colorForestLight, BRAND.colorForest)}
        <h2 style="margin:14px 0 4px;font-size:22px;font-weight:800;color:${BRAND.colorForest};">New Application Requires Review</h2>
        <p style="margin:0 0 28px;font-size:13px;color:${BRAND.colorMuted};">
          Submitted ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} EAT
        </p>

        <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 24px;
                    margin-bottom:28px;border:1px solid ${BRAND.colorBorder};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Applicant', `${user.firstName} ${user.lastName}`)}
            ${infoRow('Email', user.email)}
            ${infoRow('Program', program.title)}
            ${infoRow('Reference', ref, true)}
          </table>
        </div>

        ${ctaButton('Review Application', `${BRAND.adminPanel}/volunteers`, BRAND.colorForest, '#fff')}
      `,
    }),
  }),

  // ── 11. VOLUNTEER — STATUS UPDATE ─────────────────────────────────────────
  volunteerStatusUpdate: (user, programName, status, ref, notes = '', rejection = '') => {
    const isApproved = String(status).toLowerCase() === 'approved';
    return {
      subject: `Your Application has been ${esc(status)} — ${esc(programName)}`,
      html: shell({
        preheader: `Your application for ${programName} has been ${status}. See details inside.`,
        headerVariant: isApproved ? 'gold' : 'default',
        body: `
          <div style="
            background:${isApproved ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'linear-gradient(135deg,#fef2f2,#fee2e2)'};
            border:1.5px solid ${isApproved ? '#86efac' : '#fca5a5'};
            border-radius:14px;padding:24px;margin-bottom:28px;text-align:center;">
            <div style="font-size:36px;margin-bottom:10px;">${isApproved ? '&#127881;' : '&#128203;'}</div>
            <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;
                       color:${isApproved ? BRAND.colorSuccess : BRAND.colorDanger};">
              Application ${esc(status)}
            </h2>
            <p style="margin:0;font-size:13px;color:${isApproved ? '#166534' : '#991b1b'};">Reference: ${esc(ref)}</p>
          </div>

          <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">
            Hi <strong>${esc(user.firstName)}</strong>, we have reviewed your application for
            <strong>${esc(programName)}</strong> and it has been <strong>${esc(status)}</strong>.
          </p>

          ${notes ? `
            <div style="background:${BRAND.colorSand};border-radius:14px;padding:20px 24px;margin-bottom:20px;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;
                         letter-spacing:0.07em;color:${BRAND.colorMuted};">Notes from our team</p>
              <p style="margin:0;font-size:14.5px;line-height:1.7;color:#374151;">${esc(notes)}</p>
            </div>
          ` : ''}

          ${rejection ? alertBox(`<strong>Reason:</strong> ${esc(rejection)}`, 'danger') : ''}

          ${isApproved
            ? ctaButton('View My Program Details', `${BRAND.website}/volunteer.html`, BRAND.colorForest, '#fff')
            : ctaButton('Browse Other Programs', `${BRAND.website}/volunteer.html`, BRAND.colorMuted, '#fff')
          }
        `,
      }),
    };
  },

  // ── 12. CONTACT — AUTO-REPLY (USER) ───────────────────────────────────────
  contact: (data) => {
    const name    = typeof data === 'string' ? data : (data.firstName || 'there');
    const subject = typeof data === 'object' ? data.subject : null;
    const subjectLabels = {
      safari: '&#128506; Safari Tour', volunteer: '&#127807; Volunteer Program',
      custom: '&#11088; Custom Trip',  groups: '&#128101; Group Booking',
      general: '&#128172; General Query', press: '&#128240; Press / Media',
    };
    const subjectLabel = subject ? subjectLabels[subject] : null;

    return {
      subject: `We've received your message — Osimlai Adventuress`,
      html: shell({
        preheader: `Hi ${name}, we've received your enquiry and will respond within 2 hours.`,
        body: `
          <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.colorForest};">We've Got Your Message &#128233;</h2>

          <p style="font-size:15.5px;line-height:1.75;color:#374151;margin:0 0 20px;">
            Hi <strong>${esc(name)}</strong>, thank you for reaching out to Osimlai Adventuress.
            We've received your enquiry and a member of our team — someone who has actually been
            on the ground in Africa — will respond personally within <strong>2 business hours</strong>.
          </p>

          ${subjectLabel ? `<div style="margin-bottom:24px;">${badge(`Enquiry Type: ${subjectLabel}`, BRAND.colorSand, BRAND.colorForest)}</div>` : ''}

          ${typeof data === 'object' && data.message ? `
            <div style="background:${BRAND.colorSand};border-left:4px solid ${BRAND.colorForestLight};
                        border-radius:0 12px 12px 0;padding:18px 22px;margin-bottom:28px;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;
                         letter-spacing:0.07em;color:${BRAND.colorMuted};">Your message</p>
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;font-style:italic;">
                &ldquo;${esc(data.message)}&rdquo;
              </p>
            </div>
          ` : ''}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td width="33%" style="padding:0 5px 0 0;text-align:center;vertical-align:top;">
                <div style="background:${BRAND.colorSand};border-radius:12px;padding:16px 10px;">
                  <div style="font-size:22px;margin-bottom:8px;">&#9889;</div>
                  <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:${BRAND.colorForest};">Fast Response</p>
                  <p style="margin:0;font-size:11.5px;color:${BRAND.colorMuted};line-height:1.5;">2-hour reply during business hours</p>
                </div>
              </td>
              <td width="33%" style="padding:0 2.5px;text-align:center;vertical-align:top;">
                <div style="background:${BRAND.colorSand};border-radius:12px;padding:16px 10px;">
                  <div style="font-size:22px;margin-bottom:8px;">&#128100;</div>
                  <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:${BRAND.colorForest};">Real People</p>
                  <p style="margin:0;font-size:11.5px;color:${BRAND.colorMuted};line-height:1.5;">No bots — Africa experts only</p>
                </div>
              </td>
              <td width="33%" style="padding:0 0 0 5px;text-align:center;vertical-align:top;">
                <div style="background:${BRAND.colorSand};border-radius:12px;padding:16px 10px;">
                  <div style="font-size:22px;margin-bottom:8px;">&#127759;</div>
                  <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:${BRAND.colorForest};">Local Knowledge</p>
                  <p style="margin:0;font-size:11.5px;color:${BRAND.colorMuted};line-height:1.5;">Our team has been there</p>
                </div>
              </td>
            </tr>
          </table>

          ${ctaButton('Browse Tours While You Wait', `${BRAND.website}/tours.html`)}
          ${divider()}
          <p style="font-size:13px;color:${BRAND.colorMuted};text-align:center;line-height:1.7;margin:0;">
            Urgent? Call or WhatsApp us on
            <a href="tel:${BRAND.phone}" style="color:${BRAND.colorForestLight};text-decoration:none;font-weight:600;">${BRAND.phone}</a>
          </p>
        `,
      }),
    };
  },

  // ── 13. CONTACT — TEAM NOTIFICATION (ADMIN) ───────────────────────────────
  contactAdmin: (data) => {
    const subjectLabels = {
      safari: '&#128506; Safari Tour', volunteer: '&#127807; Volunteer Program',
      custom: '&#11088; Custom Trip',  groups: '&#128101; Group Booking',
      general: '&#128172; General Query', press: '&#128240; Press / Media',
    };
    const subjectLabel = subjectLabels[data.subject] || '&#128228; General';

    return {
      subject: `[Enquiry] ${subjectLabel} — ${esc(data.firstName)} ${esc(data.lastName || '')} &middot; ${esc(data.email)}`,
      html: shell({
        preheader: `New website enquiry from ${data.firstName}. Reply within 2 hours.`,
        headerVariant: 'dark',
        body: `
          ${badge(`${subjectLabel} Enquiry`, BRAND.colorGold, BRAND.colorText)}
          <h2 style="margin:14px 0 4px;font-size:22px;font-weight:800;color:${BRAND.colorForest};">
            New Enquiry from ${esc(data.firstName)} ${esc(data.lastName || '')}
          </h2>
          <p style="margin:0 0 28px;font-size:13px;color:${BRAND.colorMuted};">
            Submitted ${esc(data.submittedAt || new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }))} EAT
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr>
              <td width="50%" style="padding-right:10px;vertical-align:top;">
                <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 20px;border:1px solid ${BRAND.colorBorder};">
                  <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${BRAND.colorMuted};margin:14px 0 10px;">Contact</p>
                  ${infoRow('Name', `${data.firstName} ${data.lastName || ''}`.trim())}
                  ${infoRow('Email', data.email)}
                  ${infoRow('Phone', data.phone || 'Not provided')}
                  ${infoRow('Nationality', data.nationality || 'Not specified', true)}
                </div>
              </td>
              <td width="50%" style="padding-left:10px;vertical-align:top;">
                <div style="background:${BRAND.colorSand};border-radius:14px;padding:6px 20px;border:1px solid ${BRAND.colorBorder};">
                  <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${BRAND.colorMuted};margin:14px 0 10px;">Trip Details</p>
                  ${infoRow('Dates', data.dates || 'Flexible')}
                  ${infoRow('Group Size', data.groupSize || 'N/A')}
                  ${infoRow('Budget', data.budget || 'N/A')}
                  ${infoRow('Found us via', data.source || 'N/A', true)}
                </div>
              </td>
            </tr>
          </table>

          <div style="background:${BRAND.colorSand};border-left:4px solid ${BRAND.colorForestLight};
                      border-radius:0 12px 12px 0;padding:20px 24px;margin-bottom:28px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;
                       letter-spacing:0.07em;color:${BRAND.colorMuted};">Their Message</p>
            <p style="margin:0;font-size:14.5px;color:#374151;line-height:1.75;">
              ${esc(data.message).replace(/\n/g, '<br/>')}
            </p>
          </div>

          ${ctaButton(
            `Reply to ${esc(data.firstName)} &rarr;`,
            `mailto:${esc(data.email)}?subject=Re:%20Your%20Osimlai%20Adventuress%20Enquiry`,
            BRAND.colorForest, '#fff'
          )}
        `,
      }),
    };
  },

};

// ─────────────────────────────────────────────────────────────────────────────
module.exports = { sendEmail, emails };