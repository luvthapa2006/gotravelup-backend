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

// Initialize the Express app
const app = express();

// --- Main Server Configuration Starts Here ---

// Disable the x-powered-by header for security
app.disable('x-powered-by');

// Connect to MongoDB
connectToMongoDB();

// Define the Port
const PORT = process.env.PORT || 3001;

// List of allowed origins
const allowedOrigins = [
    'https://gotravelup.netlify.app',
    'https://gotravelup-frontend.onrender.com'
];

// CORS configuration
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// Middleware to parse JSON bodies
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use('/js', express.static('js'));
app.use('/assets', express.static('assets'));

// Session configuration
app.set('trust proxy', 1); // Important for services like Render
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