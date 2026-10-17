const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  connectionTimeout: 5000, // 5s connection timeout
  greetingTimeout: 5000,
  socketTimeout: 5000
});

const sendVerificationEmail = async (toEmail, otp) => {
  const mailOptions = {
    from: `"CityMesh" <${process.env.SMTP_USER || 'no-reply@citymesh.com'}>`,
    to: toEmail,
    subject: 'CityMesh - Verify your Email Address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="color: #282c3f;">Welcome to CityMesh! 🥡</h2>
        <p>Thank you for signing up. Please verify your email address by entering the following OTP on the verification page:</p>
        <h1 style="font-size: 36px; letter-spacing: 5px; color: #ff4757; text-align: center; background: #f4f5f7; padding: 10px; border-radius: 8px;">${otp}</h1>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `
  };

  try {
    // Only attempt to send if SMTP credentials are provided, else just log it
    if (process.env.SMTP_USER && process.env.SMTP_USER !== 'your_email@gmail.com') {
      const sendPromise = transporter.sendMail(mailOptions);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("SMTP timeout (Render Free tier blocks outbound SMTP ports)")), 5000)
      );
      await Promise.race([sendPromise, timeoutPromise]);
      console.log(`Verification email sent to ${toEmail}`);
      return { success: true };
    } else {
      console.log(`[Dev Mode] Verification OTP for ${toEmail}: ${otp}`);
      return { success: true, devMode: true, otp };
    }
  } catch (error) {
    console.error('Error sending email:', error.message || error);
    return { success: false, error: error.message, otp };
  }
};

module.exports = {
  sendVerificationEmail
};
