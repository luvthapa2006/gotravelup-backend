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
