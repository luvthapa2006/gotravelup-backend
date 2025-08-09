const express = require('express');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const { connectToMongoDB } = require('./config/database');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to DB
connectToMongoDB();

// Middleware
app.use(cors({
    origin: 'https://gotravelup.netlify.app', // your frontend Netlify URL
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration (use proper store in production)
app.use(session({
    secret: process.env.SESSION_SECRET || 'goodtogo-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// API Routes
app.use('/api', apiRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'API route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error' });
});

app.listen(PORT, () => {
    console.log(`GoTravelUp backend running on port ${PORT}`);
});
