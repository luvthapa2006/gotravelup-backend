// server.js

// Patch express if you have it (optional, from your file)
// ... (your express patch code can remain here) ...

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const helmet = require('helmet'); // ✅ Import helmet
const rateLimit = require('express-rate-limit'); // ✅ Import express-rate-limit
const MongoStore = require('connect-mongo');

const apiRoutes = require('./routes/api.js');
const { connectToMongoDB } = require('./config/database.js');

const app = express();
connectToMongoDB();

// --- ✅ SECURITY MIDDLEWARE ---

// 1. Apply Helmet for essential security headers
app.use(helmet());

// 2. Configure CORS to only allow your Netlify frontend
const allowedOrigins = [
    'https://gotravelup.netlify.app', // Your production frontend
    'https://gotravelup-frontend.onrender.com' // Your other frontend
    // You can add 'http://localhost:xxxx' here for local development if needed
];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('This origin is not allowed by CORS'));
        }
    },
    credentials: true
}));

// 3. Apply Rate Limiting to all API requests
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/api', limiter);


// --- Standard Middleware ---
app.use(express.json());
app.set('trust proxy', 1);

// Session configuration (already secure, no changes needed)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: {
        secure: true,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        sameSite: 'none'
    }
}));


// --- API Routes ---
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
});