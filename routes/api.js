const express = require('express');
const bcrypt = require('bcryptjs');
const { User, Trip, Booking, Transaction } = require('../config/database');

const router = express.Router();
// --- NEW: Admin password check middleware ---
const checkAdminPassword = (req, res, next) => {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Invalid Admin Password' });
    }
    next();
};
// REGISTER user
router.post('/register', async (req, res) => {
    try {
        const { name, gender, sapId, email, phone, username, password, referralCode } = req.body;

        // Check if username already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already taken' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate referral code
        const generatedReferralCode = username.substring(0, 3) + Math.floor(Math.random() * 1000);

        // Create new user
        const newUser = new User({
            name, gender, sapId, email, phone,
            username,
            password: hashedPassword,
            wallet: 50, // Initial wallet credit
            referralCode: generatedReferralCode
        });

        await newUser.save();
        res.json({ message: 'User registered successfully', referralCode: generatedReferralCode });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// VALIDATE referral code
router.post('/validate-referral', async (req, res) => {
    try {
        const { referralCode } = req.body;
        const user = await User.findOne({ referralCode });
        res.json({ valid: !!user });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
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
        res.json({ message: 'Login successful' });

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
        res.clearCookie('connect.sid'); // Clears the session cookie
        res.json({ success: true, message: 'Logout successful' });
    });
});

router.post('/admin/pending-transactions', checkAdminPassword, async (req, res) => {
    try {
        const transactions = await Transaction.find({ status: 'pending' })
            .populate('userId', 'name username'); // Get user's name
        res.json({ success: true, transactions });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// GET user profile
router.get('/profile', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ success: false, message: 'Not logged in' });
        const user = await User.findById(req.session.userId).select('-password');
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ADD money to wallet

// 1. INITIATE a transaction
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

// 2. CHECK transaction status
router.get('/wallet/payment-status/:transactionId', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ success: false, message: 'Not logged in' });

        const transaction = await Transaction.findById(req.params.transactionId);

        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        res.json({ success: true, status: transaction.status });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 3. CONFIRM a transaction (This is for the admin/cash collector)
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

        // Deduct wallet
        user.wallet -= trip.salePrice;
        await user.save();

        // Increase trip bookings
        trip.currentBookings += 1;
        await trip.save();

        // Save booking record
        const booking = new Booking({ userId: user._id, tripId: trip._id });
        await booking.save();

        res.json({ message: 'Trip booked successfully', wallet: user.wallet });

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

        if (!userBookings) {
            return res.json({ success: true, bookings: [] });
        }

        // Map the bookings to a more frontend-friendly format
        const formattedBookings = userBookings.map(booking => ({
            _id: booking._id,
            destination: booking.tripId.destination,
            status: "Booked", // You can enhance this later
            bookedAt: booking.bookingDate,
            amount: booking.tripId.salePrice
        }));

        res.json({ success: true, bookings: formattedBookings });

    } catch (err) {
        console.error('Error fetching my trips:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// DELETE account
router.delete('/account', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ message: 'Not logged in' });

        await Booking.deleteMany({ userId: req.session.userId });
        await User.findByIdAndDelete(req.session.userId);

        req.session.destroy();
        res.json({ message: 'Account deleted successfully' });

    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
