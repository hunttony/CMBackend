const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const paypal = require('paypal-rest-sdk');
const cors = require('cors');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration
app.use(cors({
  origin: 'http://localhost:5173', // Replace with your frontend's URL
  credentials: true
}));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Failed to connect to MongoDB', err);
});

// Session store configuration
const store = new MongoDBStore({
  uri: process.env.MONGO_URI,
  collection: 'sessions',
});

store.on('error', (error) => {
  console.error('Session store error:', error);
});

app.use(session({
  secret: process.env.SESSION_SECRET, // Ensure this is set in your .env file
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: {
    maxAge: 3600000, // 1 hour in milliseconds
  },
}));

// Body parser middleware
app.use(bodyParser.json());

// AccessCode Schema and Model
const AccessCodeSchema = new mongoose.Schema({
  code: String,
  expiration: Date,
  role: String, // Add role field
});

const AccessCode = mongoose.model('AccessCode', AccessCodeSchema);

// PayPal configuration
paypal.configure({
  mode: 'sandbox', // or 'live' for production
  client_id: process.env.PAYPAL_CLIENT_ID,
  client_secret: process.env.PAYPAL_CLIENT_SECRET,
});

app.post('/create-payment', (req, res) => {
  const create_payment_json = {
    intent: 'sale',
    payer: { payment_method: 'paypal' },
    redirect_urls: {
      return_url: `${process.env.FRONTEND_URL}/success`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
    },
    transactions: [{
      item_list: { items: [{ name: 'Access Code', sku: '001', price: '5.00', currency: 'USD', quantity: 1 }] },
      amount: { currency: 'USD', total: '5.00' },
      description: 'Purchase access code for the site',
    }],
  };

  paypal.payment.create(create_payment_json, (error, payment) => {
    if (error) {
      res.status(500).send(error);
    } else {
      res.json({ id: payment.id });
    }
  });
});

app.post('/execute-payment', (req, res) => {
  const { paymentId, payerId, role } = req.body; // Get role from request body
  const execute_payment_json = { payer_id: payerId };

  paypal.payment.execute(paymentId, execute_payment_json, async (error, payment) => {
    if (error) {
      res.status(500).send(error);
    } else {
      const code = Math.random().toString(36).substr(2, 7);
      const expiration = new Date(new Date().getTime() + 60 * 60 * 1000); // 1 hour from now
      const newCode = new AccessCode({ code, expiration, role }); // Save role with access code
      await newCode.save();
      res.json({ code });
    }
  });
});

app.post('/generate-test-code', async (req, res) => {
  const { role } = req.body; // Get role from request body
  const code = Math.random().toString(36).substr(2, 7);
  const expiration = new Date(new Date().getTime() + 60 * 60 * 1000); // 1 hour from now
  const newCode = new AccessCode({ code, expiration, role }); // Include role
  await newCode.save();
  res.json({ code });
});

app.get('/verify-code/:code', async (req, res) => {
  const { code } = req.params;
  const accessCode = await AccessCode.findOne({ code });

  if (accessCode && new Date() < new Date(accessCode.expiration)) {
    // Set session data
    req.session.user = {
      role: accessCode.role,
      code: accessCode.code,
    };
    req.session.isLoggedIn = true;
    res.json({ message: 'Code is valid', role: accessCode.role }); // Return role
  } else {
    res.status(400).json({ message: 'Code is invalid or expired' });
  }
});

const requireAuth = (req, res, next) => {
  if (req.session && req.session.isLoggedIn) {
    next(); // Proceed to next middleware or route handler
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

app.get('/main', requireAuth, (req, res) => {
  // Serve MainPage or perform other actions for authenticated users
  res.send('Welcome to MainPage');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
