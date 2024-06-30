const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const paypal = require('paypal-rest-sdk');
const cors = require('cors');
const aws = require('aws-sdk');
const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const User = require('./models/User');
const Profile = require('./models/Profile');
const auth = require('./middleware/auth');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(bodyParser.json());

const allowedOrigins = ['http://localhost:5173'];
app.use(cors({
  credentials: true,
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
}));

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,
    key: function (req, file, cb) {
      cb(null, Date.now().toString() + '-' + file.originalname);
    },
  }),
});



app.post('/upload', upload.single('profilePicture'), async (req, res) => {
  try {
    // Extract profile data from the request body
    const { name, age, gender, bio, interests, phone, city, state, country } = req.body;

    // Create a new profile document
    const newProfile = new Profile({
      name,
      age,
      gender,
      bio,
      interests,
      phone,
      city,
      state,
      country,
      profilePicture: req.file.location, // Assuming req.file.location contains the URL of the uploaded image
    });

    // Save the profile document to MongoDB
    await newProfile.save();

    // Send a success response
    res.json({ message: 'Profile created successfully', profile: newProfile });
  } catch (error) {
    // Send an error response
    console.error('Error creating profile:', error);
    res.status(500).json({ error: 'An error occurred while creating the profile' });
  }
});


mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Failed to connect to MongoDB', err);
});

const store = new MongoDBStore({
  uri: process.env.MONGO_URI,
  collection: 'sessions',
});

store.on('error', (error) => {
  console.error('Session store error:', error);
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: {
    maxAge: 3600000, // 1 hour
    secure: false, // Set to true if using HTTPS
  },
}));

const AccessCodeSchema = new mongoose.Schema({
  code: String,
  expiration: Date,
  role: String,
});

const AccessCode = mongoose.model('AccessCode', AccessCodeSchema);

const secretKey = process.env.SECRET_KEY || 'your_secret_key';

paypal.configure({
  mode: 'sandbox',
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
  const { paymentId, payerId, role } = req.body;
  const execute_payment_json = { payer_id: payerId };

  paypal.payment.execute(paymentId, execute_payment_json, async (error, payment) => {
    if (error) {
      res.status(500).send(error);
    } else {
      const code = Math.random().toString(36).substr(2, 7);
      const expiration = new Date(new Date().getTime() + 60 * 60 * 1000);
      const newCode = new AccessCode({ code, expiration, role });
      await newCode.save();
      res.json({ code });
    }
  });
});

app.get('/api/verify-code/:code', async (req, res) => {
  const { code } = req.params;
  const accessCode = await AccessCode.findOne({ code });

  if (accessCode && new Date() < new Date(accessCode.expiration)) {
    req.session.role = accessCode.role;
    req.session.isLoggedIn = true;
    res.json({ message: 'Code is valid', role: accessCode.role });
  } else {
    res.status(400).json({ message: 'Code is invalid or expired' });
  }
});

app.get('/verify-session', (req, res) => {
  if (req.session.isLoggedIn) {
    res.json({ loggedIn: true, role: req.session.role });
  } else {
    res.json({ loggedIn: false });
  }
});

app.post('/generate-test-code', async (req, res) => {
  const { role } = req.body;
  const code = Math.random().toString(36).substr(2, 7);
  const expiration = new Date(new Date().getTime() + 60 * 60 * 1000); // 1 hour from now
  const newCode = new AccessCode({ code, expiration, role });
  await newCode.save();
  res.json({ code });
});




const requireAuth = (req, res, next) => {
  if (req.session && req.session.isLoggedIn) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

app.get('/main', requireAuth, (req, res) => {
  res.send('Welcome to MainPage');
});



app.get('/api/profiles', async (req, res) => {
  try {
    // Fetch all profiles from the database
    const profiles = await Profile.find();
    res.json(profiles); // Send the profiles as a JSON response
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'An error occurred while fetching profiles' });
  }
});


app.get('/api/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});