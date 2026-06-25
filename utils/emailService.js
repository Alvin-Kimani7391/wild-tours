const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * 🌍 BRAND CONFIG
 */
const BRAND = {
  name: 'Osimlai Adventuress',
  website: process.env.CLIENT_URL,
  colorPrimary: '#1a3c2e',
  colorAccent: '#d4a017',
  font: 'Arial, sans-serif'
};

/**
 * 🧱 MASTER EMAIL WRAPPER (LUXURY DESIGN SYSTEM)
 */
const buildEmail = ({ title, content, ctaText, ctaLink }) => {
  return `
  <div style="margin:0;padding:0;background:#f4f6f8;font-family:${BRAND.font};">

    <div style="max-width:640px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.12);">

      <!-- HEADER -->
      <div style="background:linear-gradient(135deg, ${BRAND.colorPrimary}, #2d6a4f);padding:28px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;">
          ${BRAND.name}
        </h1>
        <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px;">
          Luxury African Safari Experiences
        </p>
      </div>

      <!-- BODY -->
      <div style="padding:32px;color:#333;">
        <h2 style="color:${BRAND.colorPrimary};margin-top:0;">
          ${title}
        </h2>

        <div style="font-size:15px;line-height:1.7;color:#444;">
          ${content}
        </div>

        ${
          ctaText && ctaLink
            ? `
          <div style="margin-top:28px;text-align:center;">
            <a href="${ctaLink}"
               style="display:inline-block;background:${BRAND.colorAccent};
               color:#1a1a1a;padding:12px 22px;border-radius:999px;
               text-decoration:none;font-weight:bold;font-size:14px;">
              ${ctaText}
            </a>
          </div>
          `
            : ''
        }

      </div>

      <!-- FOOTER -->
      <div style="background:#f8f8f8;padding:20px;text-align:center;font-size:12px;color:#777;">
        <p style="margin:0 0 6px;">
          © ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.
        </p>
        <p style="margin:0;">
          <a href="${BRAND.website}" style="color:${BRAND.colorPrimary};text-decoration:none;">
            Visit Website
          </a>
        </p>
      </div>

    </div>
  </div>
  `;
};

/**
 * 📤 CORE SEND FUNCTION
 */
const sendEmail = async ({ to, subject, html }) => {
  return sgMail.send({
    to,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL,
      name: BRAND.name
    },
    subject,
    html
  });
};

/**
 * 📦 EMAIL TEMPLATES (USER + ADMIN)
 */
const emails = {

  // 🌿 WELCOME
  welcome: (user) => ({
    subject: `Welcome to ${BRAND.name} 🌍`,
    html: buildEmail({
      title: `Welcome ${user.firstName} 🌿`,
      content: `
        <p>Thank you for joining <strong>${BRAND.name}</strong>.</p>
        <p>Your African adventure journey starts now.</p>
      `,
      ctaText: 'Explore Tours',
      ctaLink: `${BRAND.website}/tours.html`
    })
  }),

  // 🧾 BOOKING USER
  // 🧾 BOOKING USER (FIXED)
bookingUser: (booking, user) => ({
  subject: 'Booking Confirmed 🐘',
  html: buildEmail({
    title: `Your Safari is Confirmed 🎉`,
    content: `
      <p>Hi <strong>${user.firstName}</strong>, your booking is confirmed.</p>

      <div style="background:#f7f7f7;padding:16px;border-radius:12px;">
        <p><strong>Tour:</strong> ${booking.tour?.title || 'N/A'}</p>
        <p><strong>Date:</strong> ${booking.startDate}</p>
        <p><strong>Guests:</strong> ${booking.numberOfTravelers}</p>
        <p><strong>Booking Ref:</strong> ${booking.bookingRef}</p>
      </div>
    `
  })
}),

  // 👨‍💼 BOOKING ADMIN
  // 👨‍💼 BOOKING ADMIN (FIXED)
bookingAdmin: (booking, user) => ({
  subject: `NEW BOOKING ALERT 🚨`,
  html: buildEmail({
    title: `New Booking Received`,
    content: `
      <p><strong>User:</strong> ${user.firstName} ${user.lastName}</p>
      <p><strong>Email:</strong> ${user.email}</p>

      <div style="background:#f7f7f7;padding:16px;border-radius:12px;">
        <p><strong>Tour:</strong> ${booking.tour?.title || 'N/A'}</p>
        <p><strong>Date:</strong> ${booking.startDate}</p>
        <p><strong>Guests:</strong> ${booking.numberOfTravelers}</p>
        <p><strong>Ref:</strong> ${booking.bookingRef}</p>
        <p><strong>Total:</strong> ${booking.totalAmount}</p>
      </div>
    `,
    ctaText: 'Open Admin Panel',
    ctaLink: `${BRAND.website}/admin/bookings.html`
  })
}),

  // 💳 PASSWORD RESET (UPGRADED SECURITY EMAIL)
  // 🔐 PASSWORD RESET EMAIL
passwordReset: (user, resetUrl) => ({
  subject: 'Reset Your Osimlai Adventuress Password 🔐',
  html: buildEmail({
    title: 'Password Reset Request',
    content: `
      <p>Hi <strong>${user.firstName}</strong>,</p>

      <p>We received a request to reset your password.</p>

      <p>If this was you, click the button below:</p>

      <p>If you did NOT request this, you can safely ignore this email.</p>

      <div style="background:#f7f7f7;padding:16px;border-radius:12px;margin:16px 0;">
        <p style="font-size:13px;color:#666;">
          This link will expire in 30 minutes for security reasons.
        </p>
      </div>
    `,
    ctaText: 'Reset Password',
    ctaLink: resetUrl
  })
}),


paymentConfirmed: (booking, user, amount) => ({
  subject: `✅ Payment Verified — ${booking.bookingRef}`,
  html: buildEmail({
    title: 'Payment Confirmed 🎉',
    content: `
      <p>Hi <strong>${user.firstName}</strong>,</p>

      <p>Your payment has been successfully verified.</p>

      <div style="background:#f7f7f7;padding:16px;border-radius:12px;">
        <p><strong>Tour:</strong> ${booking.tour?.title}</p>
        <p><strong>Booking Ref:</strong> ${booking.bookingRef}</p>
        <p><strong>Amount Paid:</strong> ${amount}</p>
      </div>

      <p>Your safari is now fully confirmed.</p>
    `
  })
}),

paymentRejected: (booking, user) => ({
  subject: `❌ Payment Rejected — ${booking.bookingRef}`,
  html: buildEmail({
    title: 'Payment Not Approved',
    content: `
      <p>Hi <strong>${user.firstName}</strong>,</p>

      <p>Unfortunately, we could not verify your payment.</p>

      <div style="background:#f7f7f7;padding:16px;border-radius:12px;">
        <p><strong>Booking Ref:</strong> ${booking.bookingRef}</p>
        <p><strong>Tour:</strong> ${booking.tour?.title}</p>
      </div>

      <p>Please contact support or upload correct payment proof.</p>
    `
  })
}),

  // 📩 CONTACT AUTO REPLY
  contact: (name) => ({
    subject: 'We received your message 📩',
    html: buildEmail({
      title: `Thank You ${name}`,
      content: `
        <p>We received your message.</p>
        <p>Our team will respond within 24 hours.</p>
      `
    })
  }),

  // 🐘 VOLUNTEER USER
  volunteerReceived: (user, programName) => ({
  subject: `🌿 Application Received - ${programName}`,
  html: buildEmail({
    title: 'Application Received',
    content: `
      <p>Hi <strong>${user.firstName}</strong>,</p>
      <p>Your application for <strong>${programName}</strong> has been received successfully.</p>
      <p>We will review it and get back to you within 48 hours.</p>
    `
  })
}),

  // 👨‍💼 VOLUNTEER ADMIN
  volunteerAdminAlert: (user, program, ref) => ({
  subject: `🔔 New Volunteer Application: ${ref}`,
  html: buildEmail({
    title: 'New Volunteer Application',
    content: `
      <p><strong>Applicant:</strong> ${user.firstName} ${user.lastName}</p>
      <p><strong>Email:</strong> ${user.email}</p>
      <p><strong>Program:</strong> ${program.title}</p>
      <p><strong>Reference:</strong> ${ref}</p>
    `
  })
}),

bankReceiptAdminAlert: (booking, user, amount, receiptPath) => ({
  subject: `🏦 Bank Receipt Uploaded — ${booking.bookingRef}`,
  html: buildEmail({
    title: 'New Bank Receipt Uploaded',
    content: `
      <p><strong>Customer:</strong> ${user.firstName}</p>
      <p><strong>Email:</strong> ${user.email}</p>

      <div style="background:#f7f7f7;padding:16px;border-radius:12px;">
        <p><strong>Booking Ref:</strong> ${booking.bookingRef}</p>
        <p><strong>Tour:</strong> ${booking.tour?.title}</p>
        <p><strong>Amount:</strong> ${amount}</p>
        <p><strong>Receipt File:</strong> ${receiptPath}</p>
      </div>
    `,
    ctaText: 'Open Admin Panel',
    ctaLink: `${BRAND.website}/admin/bookings.html`
  })
}),

bankReceiptReceived: (booking, user, amount) => ({
  subject: `✅ Receipt Received — ${booking.bookingRef}`,
  html: buildEmail({
    title: 'Payment Proof Received 📩',
    content: `
      <p>Hi <strong>${user.firstName}</strong>,</p>

      <p>We have successfully received your payment receipt.</p>

      <div style="background:#f7f7f7;padding:16px;border-radius:12px;">
        <p><strong>Booking Ref:</strong> ${booking.bookingRef}</p>
        <p><strong>Tour:</strong> ${booking.tour?.title}</p>
        <p><strong>Amount:</strong> ${amount}</p>
      </div>

      <p>Our team will verify your payment within 24 hours.</p>
    `
  })
}),

volunteerStatusUpdate: (user, programName, status, ref, notes, rejection) => ({
  subject: `Application ${status} - ${programName}`,
  html: buildEmail({
    title: `Application ${status}`,
    content: `
      <p>Hi <strong>${user.firstName}</strong>,</p>
      <p>Your application for <strong>${programName}</strong> has been <strong>${status}</strong>.</p>

      <p><strong>Reference:</strong> ${ref}</p>

      ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
      ${rejection ? `<p><strong>Reason:</strong> ${rejection}</p>` : ''}
    `
  })
})
}; // ✅ THIS WAS MISSING

module.exports = {
  sendEmail,
  emails
};