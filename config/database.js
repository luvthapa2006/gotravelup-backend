// config/database.js
const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection function
async function connectToMongoDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB Atlas');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
}

// --- STEP 1: Define all schemas ---

const userSchema = new mongoose.Schema({
    name: String,
    gender: String,
    sapId: String,
    email: String,
    phone: String,
    username: String,
    password: String,
    wallet: { type: Number, default: 0 },
    referralCode: String,
    createdAt: { type: Date, default: Date.now }
});

const tripSchema = new mongoose.Schema({
    destination: String,
    image: String,
    date: Date,
    originalPrice: Number,
    salePrice: Number,
    description: String,
    maxParticipants: Number,
    currentBookings: { type: Number, default: 0 },
    category: String,
    createdAt: { type: Date, default: Date.now }
});

const bookingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
    bookingDate: { type: Date, default: Date.now },
    amount: Number,
    destination: String,
    status: { type: String, default: 'active' } // active, cancelled
});

const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['credit', 'debit', 'refund'], required: true },
    details: { type: String, required: true }, // e.g., "Added via QR", "Booked Trip: Rishikesh"
    status: { type: String, default: 'completed' }, // pending, completed
    createdAt: { type: Date, default: Date.now }
});

const refundRequestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    tripDestination: String,
    amount: Number,
    requestedAt: { type: Date, default: Date.now },
    status: { type: String, default: 'pending' } // 'pending', 'approved'
});


// --- STEP 2: Create all models from the schemas ---

const User = mongoose.model('User', userSchema);
const Trip = mongoose.model('Trip', tripSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const RefundRequest = mongoose.model('RefundRequest', refundRequestSchema);


// --- STEP 3: Export the models ---

module.exports = {
    connectToMongoDB,
    User,
    Trip,
    Booking,
    Transaction,
    RefundRequest
};