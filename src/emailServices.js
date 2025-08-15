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
    const mailOptions = {
        from: `"UNISCAPE" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Welcome to UNISCAPE! Your Adventure Awaits!',
        html: `<h1>Welcome, ${user.name}!</h1>
               <p>We're thrilled you've joined the UNISCAPE community. You can now log in and start exploring amazing trips.</p>
               <p><b>Username:</b> ${user.username}</p>
               <p>Happy travels!</p>
               <p>The UNISCAPE Team</p>`
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Welcome email sent to ${user.email}`);
    } catch (error) {
        console.error('Error sending welcome email:', error);
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
    sendRefundRequestEmail
};