const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { Parser } = require('json2csv');
const { User, Trip, Booking, Transaction, RefundRequest, SiteSettings, Transport, TransportBooking} = require('../config/database.js');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
// Add this line around line 12 in your api.js file
const { sendWelcomeEmail, sendBookingConfirmationEmail, sendRefundRequestEmail, sendNewUserAdminNotification } = require('../emailServices.js');
const router = express.Router();
const mongoose = require('mongoose');


// --- Multer Configuration for Trip Images ---
const tripImageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'uniscape-trips',
        allowed_formats: ['jpg', 'png', 'jpeg'],
    },
});
const uploadTripImage = multer({ storage: tripImageStorage });


// --- NEW: Multer Configuration for Backgrounds (Images & Videos) ---
const backgroundStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'uniscape-backgrounds',
        resource_type: 'auto', // ✅ Lets Cloudinary detect if it's an image or video
        allowed_formats: ['jpg', 'png', 'jpeg', 'mp4', 'mov'], // ✅ Added video formats
    },
});
const uploadBackground = multer({ storage: backgroundStorage });


// --- Admin password check middleware ---
const checkAdminPassword = (req, res, next) => {
    // Check password in headers for GET requests, and body for others
    const password = req.headers['admin-password'] || req.body.password;
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Invalid Admin Password' });
    }
    next();
};
const checkAdminPasswordFromBody = (req, res, next) => {
    if (!req.body.password || req.body.password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Invalid Admin Password' });
    }
    // If the password is correct, proceed to the route handler
    next();
};

// =============================================
// ADMIN ROUTES
// =============================================

// Edit a transport route
router.put('/admin/transport/:id', checkAdminPassword, async (req, res) => {
    try {
        const updatedTransport = await Transport.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedTransport) {
            return res.status(404).json({ success: false, message: 'Transport route not found' });
        }
        res.json({ success: true, message: 'Transport route updated successfully!', transport: updatedTransport });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Toggle transport route status
router.put('/admin/transport/:id/status', checkAdminPassword, async (req, res) => {
    try {
        const { status } = req.body;
        const transport = await Transport.findById(req.params.id);
        if (!transport) {
            return res.status(404).json({ success: false, message: 'Transport route not found' });
        }
        transport.status = status;
        await transport.save();
        res.json({ success: true, message: 'Transport status updated successfully!', transport });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// PUBLIC ROUTE to get all active transport options
router.get('/transport', async (req, res) => {
    try {
        const transportOptions = await Transport.find({ status: 'active' });
        res.json(transportOptions);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ✅ ADD THESE NEW ROUTES to api.js

// ADMIN: Get users who booked a specific shuttle
router.get('/admin/transport/:id/bookings', checkAdminPassword, async (req, res) => {
    try {
        const bookings = await TransportBooking.find({ transportId: req.params.id, status: 'active' }).populate('userId', '-password');
        res.json({ success: true, bookings });
    } catch(err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// USER: Get my shuttle bookings
router.get('/my-transport-bookings', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: 'Not logged in' });
    try {
        const bookings = await TransportBooking.find({ userId: req.session.userId, status: 'active' });
        res.json({ success: true, bookings });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// USER: Cancel a shuttle booking
// In api.js, replace the existing /transport-bookings/:bookingId/cancel route

router.post('/transport-bookings/:bookingId/cancel', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Not logged in' });
    try {
        const booking = await TransportBooking.findById(req.params.bookingId);
        if (!booking || booking.userId.toString() !== req.session.userId) {
            return res.status(404).json({ message: 'Booking not found.' });
        }
        if (booking.status === 'cancelled') {
            return res.status(400).json({ message: 'This booking has already been cancelled.' });
        }

        // --- ❌ REMOVE THE INSTANT REFUND LOGIC ---
        // const user = await User.findById(booking.userId);
        // user.wallet += booking.amount;
        // const refundTransaction = new Transaction({ ... });

        // --- ✅ ADD LOGIC TO CREATE A REFUND REQUEST INSTEAD ---
        const newRefund = new RefundRequest({
            userId: booking.userId,
            bookingId: booking._id, // Links to the TransportBooking
            tripDestination: booking.routeName, // Use routeName for the description
            amount: booking.amount
        });
        await newRefund.save();

        // Mark the original booking as cancelled
        booking.status = 'cancelled';
        
        // Decrement the booking count on the transport route
        const transport = await Transport.findById(booking.transportId);
        if (transport && transport.currentBookings > 0) {
            transport.currentBookings -= 1;
            await transport.save();
        }
        
        await booking.save();

        // Notify admin about the new request
        const user = await User.findById(booking.userId);
        if (user) {
            sendRefundRequestEmail(user, { destination: booking.routeName, amount: booking.amount });
        }

        res.json({ success: true, message: 'Shuttle booking cancelled. Your refund request has been submitted for approval.' });

    } catch (err) {
        console.error('Error during shuttle cancellation:', err);
        res.status(500).json({ message: 'Server error during cancellation.' });
    }
});
// ADMIN ROUTE to add a new transport option
router.post('/admin/transport', checkAdminPassword, async (req, res) => {
    try {
        const newTransport = new Transport({ ...req.body, date: req.body.date });
        await newTransport.save();
        res.json({ success: true, message: 'Transport route added successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// Get ALL transport routes for the admin panel
router.get('/admin/transport', checkAdminPassword, async (req, res) => {
    try {
        const allTransportOptions = await Transport.find(); // Gets all routes
        res.json({ success: true, routes: allTransportOptions });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// ADMIN ROUTE to delete a transport option
router.delete('/admin/transport/:id', checkAdminPassword, async (req, res) => {
    try {
        await Transport.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Transport route deleted successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});
router.post('/admin/refunds/:refundId/deny', checkAdminPassword, async (req, res) => {
    try {
        const refund = await RefundRequest.findById(req.params.refundId);
        if (!refund || refund.status !== 'pending') {
            return res.status(400).json({ message: 'Refund request not found or already processed.' });
        }

        // Mark the original booking as active again
        const booking = await Booking.findById(refund.bookingId);
        if (booking) {
            booking.status = 'active';
            await booking.save();
            const user = await User.findById(booking.userId);

// 📧 SEND REFUND REQUEST EMAIL
if (user) {
    sendRefundRequestEmail(user, booking);
}
        }

        // Mark the refund request as denied
        refund.status = 'denied';
        await refund.save();

        res.json({ success: true, message: 'Refund denied. The original booking has been reactivated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// ✅ NEW: Route to verify admin password before loading data
router.post('/admin/verify', checkAdminPassword, (req, res) => {
    // If the checkAdminPassword middleware passes, the password is correct.
    res.json({ success: true, message: 'Password verified.' });
});

// --- Refund Management ---
// Get all pending refund requests
router.get('/admin/refunds', checkAdminPassword, async (req, res) => {
    try {
        const refunds = await RefundRequest.find({ status: 'pending' })
            .populate('userId', 'name username');
        res.json({ success: true, refunds });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Approve a refund request
router.post('/admin/refunds/:refundId/approve', checkAdminPassword, async (req, res) => {
    try {
        const refund = await RefundRequest.findById(req.params.refundId);
        if (!refund || refund.status !== 'pending') {
            return res.status(400).json({ message: 'Refund request not found or already processed.' });
        }

        // Add money back to user's wallet
        const user = await User.findById(refund.userId);
        user.wallet += refund.amount;
        await user.save();

        // Update refund status
        refund.status = 'approved';
        await refund.save();
        // Create a refund transaction record
const refundTransaction = new Transaction({
    userId: user._id,
    amount: refund.amount,
    type: 'refund',
    details: `Refund for Trip: ${refund.tripDestination}`
});
await refundTransaction.save();

        res.json({ success: true, message: 'Refund approved and wallet updated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Deny (delete) a pending transaction
router.delete('/admin/transactions/:transactionId', checkAdminPassword, async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.transactionId);

        if (!transaction || transaction.status !== 'pending') {
            return res.status(400).json({ message: 'Transaction not found or not in pending state.' });
        }

        await Transaction.findByIdAndDelete(req.params.transactionId);
        res.json({ success: true, message: 'Transaction denied and deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Trip Management ---
// Add a new trip
router.post('/admin/trips', uploadTripImage.single('image'), checkAdminPasswordFromBody, async (req, res) => {
    try {
        const { destination, originalPrice, salePrice, description, tripPlan, date, category, maxParticipants, paymentDetails, status } = req.body;
        const imagePath = req.file ? req.file.path : '';

        if (!imagePath) {
            return res.status(400).json({ success: false, message: 'Trip image is required.' });
        }
        
        const newTrip = new Trip({
            destination,
            originalPrice,
            salePrice,
            description,
            tripPlan,
            date,
            category,
            maxParticipants,
            image: imagePath, // Save the path to the image
            status: status === 'active' ? 'active' : 'coming_soon',
            paymentDetails: paymentDetails ? JSON.parse(paymentDetails) : [], // Parse payment details if provided
        });

        await newTrip.save();
        res.json({ success: true, message: 'Trip added successfully!', trip: newTrip });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error while adding trip' });
    }
});

// Delete a trip
router.delete('/admin/trips/:id', checkAdminPassword, async (req, res) => {
    try {
        await Trip.findByIdAndDelete(req.params.id);
        // Also delete associated bookings to keep db clean
        await Booking.deleteMany({ tripId: req.params.id });
        res.json({ success: true, message: 'Trip deleted successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

router.get('/settings/background', async (req, res) => {
    try {
        // Find the settings doc, or create it if it doesn't exist
        let settings = await SiteSettings.findOne({ key: 'site-settings' });
        if (!settings) {
            settings = await new SiteSettings().save();
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});
router.post('/admin/settings/background', uploadBackground.single('backgroundFile'), checkAdminPasswordFromBody, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file was uploaded.' });
        }
        
        const { backgroundType } = req.body;
        const backgroundUrl = req.file.path; // URL from Cloudinary

        // Find the single settings document and update it, or create it if it doesn't exist.
        const updatedSettings = await SiteSettings.findOneAndUpdate(
            { key: 'site-settings' },
            { backgroundType, backgroundUrl },
            { new: true, upsert: true } // upsert: true creates the document if it's not found
        );

        res.json({ success: true, message: 'Background updated successfully!', settings: updatedSettings });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error while updating background' });
    }
});
// ADD THIS NEW ROUTE in api.js

// Edit a trip
router.put('/admin/trips/:id', checkAdminPassword, async (req, res) => {
    try {
        const updatedTrip = await Trip.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedTrip) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }
        res.json({ success: true, message: 'Trip updated successfully!', trip: updatedTrip });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});
router.put('/admin/trips/:id/status', checkAdminPassword, async (req, res) => {
    try {
        const { status } = req.body;
        const trip = await Trip.findById(req.params.id);
        if (!trip) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }
        trip.status = status;
        await trip.save();
        res.json({ success: true, message: 'Trip status updated successfully!', trip });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});
// CANCEL a trip booking
router.post('/bookings/:bookingId/cancel', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ message: 'Not logged in' });

        const booking = await Booking.findById(req.params.bookingId).populate('tripId');
        if (!booking || booking.userId.toString() !== req.session.userId) {
            return res.status(404).json({ message: 'Booking not found or access denied.' });
        }
        if (booking.status === 'cancelled') {
            return res.status(400).json({ message: 'This trip has already been cancelled.' });
        }

        const trip = booking.tripId;
        if (!trip) {
            return res.status(404).json({ message: 'Associated trip could not be found.' });
        }

        // --- NEW: REFUND CALCULATION LOGIC ---
        const now = new Date();
        const tripDate = new Date(trip.date);
        const hoursBeforeTrip = (tripDate - now) / (1000 * 60 * 60);
        
        // Decrement the booking count on the trip
        if (trip.currentBookings > 0) {
            trip.currentBookings -= 1;
            await trip.save();
        }
        
        // Mark the booking as cancelled
        booking.status = 'cancelled';
        await booking.save();
        
        // --- Tiered Refund Logic ---
        if (hoursBeforeTrip < 24) {
            // --- NO REFUND ---
            return res.json({ success: true, message: 'Trip cancelled. No refund is applicable as it is less than 24 hours before the trip.' });
        } else {
            // --- REFUND APPLICABLE ---
            let refundAmount = 0;
            let refundPercentage = '';

            if (hoursBeforeTrip >= 48) {
                // 100% Refund
                refundAmount = booking.amount;
                refundPercentage = '100%';
            } else {
                // 50% Refund
                refundAmount = booking.amount * 0.5;
                refundPercentage = '50%';
            }

            // Create a refund request with the calculated amount
            const newRefund = new RefundRequest({
                userId: booking.userId,
                bookingId: booking._id,
                tripDestination: booking.destination,
                amount: refundAmount
            });
            await newRefund.save();
            
            const user = await User.findById(booking.userId);
            if (user) {
                sendRefundRequestEmail(user, booking); // Notify admin
            }

            return res.json({ success: true, message: `Trip cancelled. Your refund request for ${refundPercentage} (₹${refundAmount}) has been submitted for approval.` });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during cancellation.' });
    }
});

// --- User Management ---
// Get all users
router.get('/admin/users', checkAdminPassword, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Download all users as CSV
router.get('/admin/users/download', checkAdminPassword, async (req, res) => {
    try {
        const users = await User.find().select('-password -__v').lean();
        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(users);

        res.header('Content-Type', 'text/csv');
        res.attachment("users.csv");
        res.send(csv);

    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to generate CSV.' });
    }
});

// Delete a user
router.delete('/admin/users/:id', checkAdminPassword, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        // Also delete associated bookings and transactions
        await Booking.deleteMany({ userId: req.params.id });
        await Transaction.deleteMany({ userId: req.params.id });
        res.json({ success: true, message: 'User deleted successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Get users who booked a specific trip
router.get('/admin/trips/:id/bookings', checkAdminPassword, async (req, res) => {
    try {
        const bookings = await Booking.find({ tripId: req.params.id, status: 'active' }).populate('userId', '-password');
        res.json({ success: true, bookings });
    } catch(err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


// --- Payment Management ---
router.post('/admin/pending-transactions', checkAdminPassword, async (req, res) => {
    try {
        const transactions = await Transaction.find({ status: 'pending' })
            .populate('userId', 'name username'); // Get user's name
        res.json({ success: true, transactions });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/wallet/confirm-transaction/:transactionId', checkAdminPassword, async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.transactionId);

        if (!transaction || transaction.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Transaction not found or already processed' });
        }

        const user = await User.findById(transaction.userId);
        user.wallet += transaction.amount;
        await user.save();

        transaction.status = 'completed';
        await transaction.save();

        res.json({ success: true, message: 'Payment confirmed and wallet updated', newBalance: user.wallet });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


// =============================================
// PUBLIC & USER ROUTES
// =============================================

// REPLACE the existing '/register' route in api.js with this one

router.post('/register', async (req, res) => {
    try {
        const { name, gender, sapId, email, phone, username, password, referralCode } = req.body;

        // --- Check for duplicate email or SAP ID ---
        const existingUser = await User.findOne({ $or: [{ username }, { email }, { sapId }] });
        if (existingUser) {
            let message = 'User already exists.';
            if (existingUser.username === username) {
                message = 'Username is already taken.';
            } else if (existingUser.email === email) {
                message = 'An account with this email already exists.';
            } else if (existingUser.sapId === sapId) {
                message = 'An account with this SAP ID already exists.';
            }
            return res.status(409).json({ message });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const generatedReferralCode = username.substring(0, 3).toUpperCase() + Math.floor(1000 + Math.random() * 9000);
        
        // --- FIX: Change initial wallet amount from 50 to 0 ---
        let initialWallet = 0; // ✅ CHANGE THIS LINE FROM 50 to 0

        // This part keeps the referral code logic working if you need it later
        if (referralCode) {
            const referrer = await User.findOne({ referralCode: referralCode });
            if (referrer) {
                initialWallet += 100; // Add referral bonus
            } else {
                return res.status(400).json({ message: 'Invalid referral code provided.' });
            }
        }

        const newUser = new User({
            name, gender, sapId, email, phone, username,
            password: hashedPassword,
            wallet: initialWallet, // Use the new initial amount
            referralCode: generatedReferralCode
        });

        await newUser.save();
        // 📧 SEND WELCOME EMAIL
        sendWelcomeEmail(newUser);
        sendNewUserAdminNotification(newUser); 
        res.status(201).json({ success: true, message: 'User registered successfully' });

    } catch (err) {
        console.error("Error during registration:", err);
        res.status(500).json({ success: false, message: 'Server error during registration' });
    }
});

// LOGIN user
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });

        if (!user) return res.status(400).json({ message: 'Invalid username or password' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid username or password' });

        req.session.userId = user._id;
        res.json({ success: true, message: 'Login successful' });

    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// LOGOUT user
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Could not log out, please try again.' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'Logout successful' });
    });
});

// GET user profile
router.get('/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: 'Not logged in' });
    try {
        const user = await User.findById(req.session.userId).select('-password');
        if (!user) {
             return res.status(404).json({ success: false, message: 'User not found.' });
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET trips list
router.get('/trips', async (req, res) => {
    try {
        const trips = await Trip.find();
        res.json(trips);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

/// BOOK a trip (FINAL, with duplicate check and transaction)
router.post('/book-trip', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();


try {
    // --- Initial validation and data fetching ---
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Not logged in' });
    }

    const { tripId } = req.body;
    
    const trip = await Trip.findById(tripId).session(session);
    const user = await User.findById(req.session.userId).session(session);

    if (!trip) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Trip not found' });
    }
    if (user.wallet < trip.salePrice) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    // --- Check for an existing ACTIVE booking (prevents double booking) ---
    const activeBooking = await Booking.findOne({ 
        userId: user._id, 
        tripId: trip._id,
        status: 'active'
    }).session(session);

    if (activeBooking) {
        await session.abortTransaction();
        session.endSession();
        return res.status(409).json({ message: 'You have already booked this trip.' });
    }

    // --- ✨ NEW LOGIC: Check for a CANCELLED booking to reactivate ---
    const cancelledBooking = await Booking.findOne({
        userId: user._id,
        tripId: trip._id,
        status: 'cancelled'
    }).session(session);

    // Common operations for any successful booking
    user.wallet -= trip.salePrice;
    trip.currentBookings += 1;

    if (cancelledBooking) {
        // --- Scenario A: Reactivate the old booking ---
        cancelledBooking.status = 'active';
        cancelledBooking.bookingDate = new Date(); // Update the booking date to now
        
        await cancelledBooking.save({ session });
        
    } else {
        // --- Scenario B: Create a brand new booking ---
        const newBooking = new Booking({ 
            userId: user._id, 
            tripId: trip._id, 
            amount: trip.salePrice, 
            destination: trip.destination 
        });
        await newBooking.save({ session });
    }
    
    // --- Save user and trip changes and create a transaction record ---
    await user.save({ session });
    await trip.save({ session });

    const debitTransaction = new Transaction({
        userId: user._id,
        amount: trip.salePrice,
        type: 'debit',
        details: `Booked Trip: ${trip.destination}`
    });
    await debitTransaction.save({ session });

    // --- Commit all changes to the database ---
    await session.commitTransaction();
    // 📧 SEND BOOKING CONFIRMATION EMAIL
    sendBookingConfirmationEmail(user, trip);
    session.endSession();

    res.json({ success: true, message: 'Trip booked successfully!', newWalletBalance: user.wallet });

} catch (err) {
    // This part remains the same, to handle any unexpected errors
    await session.abortTransaction();
    session.endSession();
    
    console.error('Booking transaction error:', err);
    res.status(500).json({ message: 'Server error during booking. Please try again.' });
}
});
// In api.js, near your other User & Public routes

router.post('/book-transport', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        if (!req.session.userId) return res.status(401).json({ message: 'Not logged in' });

        const { transportId } = req.body;
        const transport = await Transport.findById(transportId).session(session);
        const user = await User.findById(req.session.userId).session(session);

        if (!transport) return res.status(404).json({ message: 'Transport route not found.' });
        if (transport.currentBookings >= transport.capacity) return res.status(400).json({ message: 'This shuttle is fully booked.' });
        if (user.wallet < transport.price) return res.status(400).json({ message: 'Insufficient wallet balance.' });

        // Deduct from wallet and create transaction
        user.wallet -= transport.price;
        const debitTransaction = new Transaction({
            userId: user._id,
            amount: transport.price,
            type: 'debit',
            details: `Booked Shuttle: ${transport.routeName}`
        });

        // Create new booking record
        const newBooking = new TransportBooking({
            userId: user._id,
            transportId: transport._id,
            amount: transport.price,
            routeName: transport.routeName,
            date: transport.date,
        });
        
        // Increment booking count
        transport.currentBookings += 1;

        await user.save({ session });
        await debitTransaction.save({ session });
        await newBooking.save({ session });
        await transport.save({ session });

        await session.commitTransaction();
        session.endSession();

        // You can add an admin email notification here if you like
        sendBookingConfirmationEmail(user, transport);

        res.json({ success: true, message: 'Seat booked successfully!', newWalletBalance: user.wallet });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Transport booking error:', err);
        res.status(500).json({ message: 'Server error during booking.' });
    }
});
// GET my trips
router.get('/my-trips', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, message: 'Not logged in' });
        }

        // We no longer need to .populate() here since we saved the data
        const userBookings = await Booking.find({ userId: req.session.userId, status: 'active' });

        // ✅ FIXED: Maps the data directly from the booking document
        const formattedBookings = userBookings.map(booking => ({
            _id: booking._id,
            tripId: booking.tripId,
            destination: booking.destination,
            status: booking.status, // Uses the actual status
            bookedAt: booking.bookingDate,
            amount: booking.amount
        }));

        res.json({ success: true, bookings: formattedBookings });

    } catch (err) {
        console.error('Error fetching my trips:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Wallet Routes (initiate, check status)
router.post('/wallet/initiate-transaction', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ success: false, message: 'Not logged in' });
        
        const { amount, method } = req.body;

const newTransaction = new Transaction({
    userId: req.session.userId,
    amount: parseFloat(amount),
    type: 'credit', // FIX: Set the transaction type
    details: `Pending payment via ${method}`, // FIX: Use the 'details' field
    status: 'pending'
});

        await newTransaction.save();
        res.json({ success: true, message: 'Transaction initiated', transactionId: newTransaction._id });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/wallet/payment-status/:transactionId', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ success: false, message: 'Not logged in' });
        const transaction = await Transaction.findById(req.params.transactionId);
        if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });
        res.json({ success: true, status: transaction.status });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


// DELETE account
router.delete('/account', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ message: 'Not logged in' });

        await Booking.deleteMany({ userId: req.session.userId });
        await Transaction.deleteMany({ userId: req.session.userId });
        await User.findByIdAndDelete(req.session.userId);

        req.session.destroy();
        res.json({ success: true, message: 'Account deleted successfully' });

    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});
// GET user's wallet transaction history
router.get('/wallet/history', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, message: 'Not logged in' });
        }

        const transactions = await Transaction.find({ userId: req.session.userId })
            .sort({ createdAt: -1 }); // Sort by newest first
            
        res.json({ success: true, history: transactions });

    } catch (err) {
        console.error('Error fetching wallet history:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


module.exports = router;