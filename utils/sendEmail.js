const nodemailer = require("nodemailer");

async function sendEmailWithAttachment(filePath) {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Asset Errors" <${process.env.EMAIL_USER}>`,
    to: "college.id.fr@gmail.com",
    subject: "Asset Error Report",
    text: "Please find attached the asset error report.",
    attachments: [
      {
        filename: "asset_errors.xlsx",
        path: filePath,
      },
    ],
  });
}

module.exports = {
    sendEmailWithAttachment
}