// config/database.js
const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection function
async function connectToMongoDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
        });
        console.log('✅ Connected to MongoDB Atlas');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
}

// User schema
const userSchema = new mongoose.Schema({
    name: String,
    gender: String,
    sapId: String,
    email: String,
    memberId: String,
    phone: String,
    username: String,
    password: String, // Should be hashed in production
    wallet: { type: Number, default: 0 },
    referralCode: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Trip schema
const tripSchema = new mongoose.Schema({
    destination: String,
    image: String,
    date: String,
    originalPrice: Number,
    salePrice: Number,
    description: String,
    maxParticipants: Number,
    currentBookings: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// Booking schema
const bookingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
    bookingDate: { type: Date, default: Date.now }
});

// Create models
const User = mongoose.model('User', userSchema);
const Trip = mongoose.model('Trip', tripSchema);
const Booking = mongoose.model('Booking', bookingSchema);

module.exports = {
    connectToMongoDB,
    User,
    Trip,
    Booking
};
