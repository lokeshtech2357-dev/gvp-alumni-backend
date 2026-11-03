const nodemailer = require('nodemailer');

const {
  EMAIL_HOST,
  EMAIL_PORT,
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_FROM,
  EMAIL_ADMIN
} = process.env;

const transportConfig = EMAIL_HOST && EMAIL_USER && EMAIL_PASS ? {
  host: EMAIL_HOST,
  port: Number(EMAIL_PORT) || 587,
  secure: Number(EMAIL_PORT) === 465,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
} : null;

const transporter = transportConfig ? nodemailer.createTransport(transportConfig) : null;

const fromAddress = EMAIL_FROM || EMAIL_USER || 'no-reply@gvp.local';
const adminAddress = EMAIL_ADMIN ? [EMAIL_ADMIN, 'secgayatrigrads@gmail.com', 'gayatrigradsassociation@gmail.com'] : ['secgayatrigrads@gmail.com', 'gayatrigradsassociation@gmail.com'];

const sendMail = async ({ to, subject, text, html, from = fromAddress }) => {
  if (!transporter) {
    console.warn('Email service is not configured.');
    return null;
  }

  const mailOptions = {
    from,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    text,
    html,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log('Email sent successfully.');
  return info;
};

const getAdminEmail = () => adminAddress.join(', ');
const isEmailConfigured = () => Boolean(transporter);

module.exports = { sendMail, getAdminEmail, isEmailConfigured };
