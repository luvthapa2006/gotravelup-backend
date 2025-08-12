const express = require('express');
const bcrypt = require('bcryptjs');
const { User, Trip, Booking, Transaction } = require('../config/database');
const multer = require('multer');
const { Parser } = require('json2csv');
const path = require('path');
const fs = require('fs');

const router = express.Router();

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

// =============================================
// ADMIN ROUTES
// =============================================

// --- Trip Management ---
// Add a new trip
router.post('/admin/trips', checkAdminPassword, upload.single('image'), async (req, res) => {
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

// BOOK a trip
router.post('/book-trip', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ message: 'Not logged in' });

        const { tripId } = req.body;
        const trip = await Trip.findById(tripId);
        const user = await User.findById(req.session.userId);

        if (!trip) return res.status(404).json({ message: 'Trip not found' });
        if (user.wallet < trip.salePrice) return res.status(400).json({ message: 'Insufficient wallet balance' });

        user.wallet -= trip.salePrice;
        trip.currentBookings += 1;
        
        await user.save();
        await trip.save();

        const booking = new Booking({ userId: user._id, tripId: trip._id, amount: trip.salePrice, destination: trip.destination });
        await booking.save();

        res.json({ success: true, message: 'Trip booked successfully!', newWalletBalance: user.wallet });

    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET my trips
router.get('/my-trips', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, message: 'Not logged in' });
        }

        const userBookings = await Booking.find({ userId: req.session.userId }).populate('tripId');
        
        const formattedBookings = userBookings.map(booking => ({
            _id: booking._id,
            destination: booking.tripId.destination,
            status: "Booked",
            bookedAt: booking.bookingDate,
            amount: booking.tripId.salePrice
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
            method: method,
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


module.exports = router;