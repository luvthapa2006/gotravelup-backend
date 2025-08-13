const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { Parser } = require('json2csv');
const path = require('path');
const fs = require('fs');
const { User, Trip, Booking, Transaction, RefundRequest } = require('../config/database');

const router = express.Router();
const mongoose = require('mongoose');

// --- Multer Configuration for Image Uploads ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Create an 'uploads' directory if it doesn't exist
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Create a unique filename to avoid overwrites
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


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
router.post('/admin/trips', upload.single('image'), checkAdminPasswordFromBody, async (req, res) => {
    try {
        const { destination, originalPrice, salePrice, description, date, category, maxParticipants } = req.body;
        const imagePath = req.file ? `/${req.file.path.replace(/\\/g, "/")}` : ''; // Get the path of the uploaded file

        if (!imagePath) {
            return res.status(400).json({ success: false, message: 'Trip image is required.' });
        }
        
        const newTrip = new Trip({
            destination,
            originalPrice,
            salePrice,
            description,
            date,
            category,
            maxParticipants,
            image: imagePath // Save the path to the image
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

// CANCEL a trip booking
router.post('/bookings/:bookingId/cancel', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ message: 'Not logged in' });

        const booking = await Booking.findById(req.params.bookingId).populate('tripId');
        if (!booking || booking.userId.toString() !== req.session.userId) {
            return res.status(404).json({ message: 'Booking not found or access denied.' });
        }
        const trip = booking.tripId;
        if (trip && trip.currentBookings > 0) {
            trip.currentBookings -= 1;
            await trip.save();
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({ message: 'This trip has already been cancelled.' });
        }

        // Create a refund request
        const newRefund = new RefundRequest({
            userId: booking.userId,
            bookingId: booking._id,
            tripDestination: booking.tripId.destination,
            amount: booking.tripId.salePrice
        });
        await newRefund.save();

        // Mark the original booking as cancelled
        booking.status = 'cancelled';
        await booking.save();

        res.json({ success: true, message: 'Trip cancelled. Your refund request has been submitted for approval.' });

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
        const bookings = await Booking.find({ tripId: req.params.id }).populate('userId', '-password');
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

// REGISTER user
router.post('/register', async (req, res) => {
    try {
        const { name, gender, sapId, email, phone, username, password, referralCode } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already taken' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const generatedReferralCode = username.substring(0, 3).toUpperCase() + Math.floor(1000 + Math.random() * 9000);
        const newUser = new User({
            name, gender, sapId, email, phone, username,
            password: hashedPassword,
            wallet: 50,
            referralCode: generatedReferralCode
        });
        await newUser.save();
        res.status(201).json({ success: true, message: 'User registered successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
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
        if (!req.session.userId) {
            return res.status(401).json({ message: 'Not logged in' });
        }

        const { tripId } = req.body;
        
        const trip = await Trip.findById(tripId).session(session);
        const user = await User.findById(req.session.userId).session(session);

        // --- START: NEW LOGIC TO PREVENT DUPLICATE BOOKINGS ---
        const existingBooking = await Booking.findOne({ 
            userId: user._id, 
            tripId: trip._id,
            status: 'active' // Only check for currently active bookings
        }).session(session);

        if (existingBooking) {
            await session.abortTransaction();
            session.endSession();
            // Return a 409 Conflict error, which is appropriate
            return res.status(409).json({ message: 'You have already booked this trip.' });
        }
        // --- END: NEW LOGIC ---

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

        user.wallet -= trip.salePrice;
        trip.currentBookings += 1;
        
        const booking = new Booking({ 
            userId: user._id, 
            tripId: trip._id, 
            amount: trip.salePrice, 
            destination: trip.destination 
        });
        
        await user.save({ session });
        await trip.save({ session });
        await booking.save({ session });
        // Create a debit transaction record for this booking
        const debitTransaction = new Transaction({
            userId: user._id,
            amount: trip.salePrice,
            type: 'debit',
            details: `Booked Trip: ${trip.destination}`
        });
        await debitTransaction.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.json({ success: true, message: 'Trip booked successfully!', newWalletBalance: user.wallet });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        
        console.error('Booking transaction error:', err);
        res.status(500).json({ message: 'Server error during booking. Please try again.' });
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