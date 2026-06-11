const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Send email using SendGrid
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const msg = {
      to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL,
        name: 'WildRoots Africa'
      },
      subject,
      text: text || '',
      html
    };

    const response = await sgMail.send(msg);
    return response;

  } catch (error) {
    console.error('SendGrid error:', error.response?.body || error);
    throw new Error('Email could not be sent');
  }
};

module.exports = sendEmail;