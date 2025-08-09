// MUST go at the very top before requiring any other files
const express = require('express');

// Patch express & Router before anything else loads
['get', 'post', 'put', 'delete', 'use'].forEach(method => {
  const original = express.application[method];
  express.application[method] = function (path, ...handlers) {
    if (typeof path === 'string' && path.startsWith('http')) {
      console.error(`🚨 BAD ROUTE on app.${method}:`, path);
      console.trace();
    }
    return original.call(this, path, ...handlers);
  };
});

const origRouter = express.Router;
express.Router = function (...args) {
  const router = origRouter.apply(this, args);
  ['get', 'post', 'put', 'delete', 'use'].forEach(method => {
    const orig = router[method];
    router[method] = function (path, ...handlers) {
      if (typeof path === 'string' && path.startsWith('http')) {
        console.error(`🚨 BAD ROUTE on router.${method}:`, path);
        console.trace();
      }
      return orig.call(this, path, ...handlers);
    };
  });
  return router;
};

// Now load everything else
require('dotenv').config();
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const apiRoutes = require('./routes/api');
const { connectToMongoDB } = require('./config/database');
const MongoStore = require('connect-mongo');

const app = express();

// --- START: ADD THIS CODE ---

// Connect to MongoDB
connectToMongoDB();

// Define the Port
const PORT = process.env.PORT || 3001;

// CORS configuration to allow credentials
// List of allowed origins (your frontend domains)
const allowedOrigins = [
    'https://gotravelup.netlify.app',
    'https://gotravelup-frontend.onrender.com'
    // You can add your local development URL here too, e.g., 'http://localhost:5500'
];

// CORS configuration to allow credentials from the whitelisted origins
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

// Middleware to parse JSON bodies
app.use(express.json());

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: {
        secure: true, // Must be true since we are using https
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        sameSite: 'none' // ✅ This is the crucial change
    }
}));

// API Routes
app.use('/api', apiRoutes);

// Root endpoint for testing
app.get('/', (req, res) => {
    res.send('Good to Go Backend is running! 🚀');
});

// Start the server
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
});

// --- END: ADD THIS CODE ---```