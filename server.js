require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const apiRoutes = require('./routes/api');
const { connectToMongoDB } = require('./config/database');
const MongoStore = require('connect-mongo');

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Connect to MongoDB Atlas
connectToMongoDB();

// ✅ CORS setup to allow Netlify frontend
app.use(cors({
    origin: 'https://gotravelup.netlify.app', // change to your Netlify frontend URL
    credentials: true
}));

// ✅ Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Sessions (temporary MemoryStore, replace for production)
app.use(session({
    secret: process.env.SESSION_SECRET || 'gotravelup-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI, // same as your DB connection string
        ttl: 24 * 60 * 60 // session lifetime in seconds
    }),
    cookie: {
        secure: true, // true if using HTTPS
        sameSite: 'none',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// ✅ API Routes
app.use('/api', apiRoutes);

// ✅ Simple status check route
app.get('/', (req, res) => {
    res.send('GoTravelUp backend is running 🚀');
});

// ✅ 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Page not found' });
});

// ✅ Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ message: 'Internal server error' });
});

// ✅ Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`GoTravelUp backend running on http://0.0.0.0:${PORT}`);
});
