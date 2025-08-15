// emailService.js
const nodemailer = require('nodemailer');

// Create a reusable transporter object using your .env variables
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Sends a welcome email to a new user.
 * @param {object} user - The user object from the database.
 */
const sendWelcomeEmail = async (user) => {
    const logoUrl = 'https://gotravelup.netlify.app/assets/logo.svg'; // A direct link to your logo

    const mailOptions = {
        from: `"UNISCAPE" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Welcome to UNISCAPE! Your Adventure Awaits! 🏔️✈️',
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #007bff; color: white; padding: 20px; text-align: center;">
                    <img src="${logoUrl}" alt="UNISCAPE Logo" width="60" style="margin-bottom: 10px;">
                    <h1 style="margin: 0;">Welcome Aboard, ${user.name}!</h1>
                </div>
                <div style="padding: 30px;">
                    <p>We are absolutely thrilled to have you join the UNISCAPE community! 🎉</p>
                    <p>Your account has been created successfully, and a world of student-friendly adventures in Uttarakhand is now at your fingertips.</p>
                    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">Your Account Details:</h3>
                        <p><strong>Username:</strong> ${user.username}</p>
                        <p><strong>SAP ID:</strong> ${user.sapId}</p>
                    </div>
                    <h3 style="color: #007bff;">What's Next?</h3>
                    <p>🎒 Log in to your dashboard, explore the upcoming trips, and get ready to make some unforgettable memories with your fellow UPES students!</p>
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="https://gotravelup.netlify.app/dashboard" style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 50px; font-weight: bold;">Go to Dashboard</a>
                    </div>
                </div>
                <div style="background-color: #f2f2f2; color: #777; padding: 15px; text-align: center; font-size: 12px;">
                    <p>Happy Travels,<br>The UNISCAPE Team ✨</p>
                </div>
            </div>
        `
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Welcome email sent to ${user.email}`);
    } catch (error) {
        console.error('Error sending welcome email:', error);
    }
};

/**
 * Sends a notification to the admin when a new user signs up.
 * @param {object} user - The new user object from the database.
 */
const sendNewUserAdminNotification = async (user) => {
    const registrationTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const mailOptions = {
        from: `"UNISCAPE Notifier" <${process.env.EMAIL_USER}>`,
        to: process.env.ADMIN_EMAIL, // Sends to the admin(s)
        subject: `🎉 New User Registration: ${user.username}`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto;">
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
                    <h1 style="color: #007bff; text-align: center;">👤 New User Signup</h1>
                    <p style="text-align: center;">A new user has just registered on UNISCAPE.</p>
                    <p style="text-align: center; font-size: 14px; color: #6c757d;">Registered on: ${registrationTime}</p>
                    <hr>
                    <h3 style="color: #333;">User Details:</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 10px; font-weight: bold;">Full Name:</td>
                            <td style="padding: 10px;">${user.name}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 10px; font-weight: bold;">Username:</td>
                            <td style="padding: 10px;">${user.username}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 10px; font-weight: bold;">Email:</td>
                            <td style="padding: 10px;">${user.email}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 10px; font-weight: bold;">Phone:</td>
                            <td style="padding: 10px;">${user.phone}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold;">SAP ID:</td>
                            <td style="padding: 10px;">${user.sapId}</td>
                        </tr>
                    </table>
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="https://gotravelup.netlify.app/admin.html" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">View in Admin Panel</a>
                    </div>
                </div>
            </div>
        `
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`New user notification sent to admin for ${user.username}`);
    } catch (error) {
        console.error('Error sending new user notification to admin:', error);
    }
};

/**
 * Sends a booking confirmation email to the admin.
 * @param {object} user - The user who booked the trip.
 * @param {object} trip - The trip that was booked.
 */
const sendBookingConfirmationEmail = async (user, trip) => {
    const mailOptions = {
        from: `"UNISCAPE Notifier" <${process.env.EMAIL_USER}>`,
        to: process.env.ADMIN_EMAIL,
        subject: `New Trip Booking: ${trip.destination}`,
        html: `<h1>New Booking Notification</h1>
               <p>A booking has been confirmed for <b>${trip.destination}</b> on ${new Date(trip.date).toLocaleDateString()}.</p>
               <p><b>User Details:</b></p>
               <ul>
                 <li>Name: ${user.name}</li>
                 <li>Username: ${user.username}</li>
                 <li>Email: ${user.email}</li>
                 <li>Phone: ${user.phone}</li>
               </ul>`
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log('Booking confirmation sent to admin.');
    } catch (error) {
        console.error('Error sending booking confirmation email:', error);
    }
};

/**
 * Sends a refund request notification to the admin.
 * @param {object} user - The user requesting the refund.
 * @param {object} booking - The cancelled booking details.
 */
const sendRefundRequestEmail = async (user, booking) => {
    const mailOptions = {
        from: `"UNISCAPE Notifier" <${process.env.EMAIL_USER}>`,
        to: process.env.ADMIN_EMAIL,
        subject: `Refund Request for ${booking.destination}`,
        html: `<h1>New Refund Request</h1>
               <p>A refund has been requested for the trip to <b>${booking.destination}</b>.</p>
               <p><b>Amount:</b> ₹${booking.amount}</p>
               <p><b>User Details:</b></p>
               <ul>
                 <li>Name: ${user.name}</li>
                 <li>Username: ${user.username}</li>
                 <li>Email: ${user.email}</li>
               </ul>
               <p>Please review this request in the admin panel.</p>`
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log('Refund request email sent to admin.');
    } catch (error) {
        console.error('Error sending refund request email:', error);
    }
};

module.exports = {
    sendWelcomeEmail,
    sendBookingConfirmationEmail,
    sendRefundRequestEmail,
    sendNewUserAdminNotification
};