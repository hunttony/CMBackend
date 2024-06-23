const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const paypal = require('paypal-rest-sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const AccessCodeSchema = new mongoose.Schema({
  code: String,
  expiration: Date,
});

const AccessCode = mongoose.model('AccessCode', AccessCodeSchema);

app.use(bodyParser.json());

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
  const { paymentId, payerId } = req.body;
  const execute_payment_json = { payer_id: payerId };

  paypal.payment.execute(paymentId, execute_payment_json, async (error, payment) => {
    if (error) {
      res.status(500).send(error);
    } else {
      const code = Math.random().toString(36).substr(2, 7);
      const expiration = new Date(new Date().getTime() + 60 * 60 * 1000); // 1 hour from now
      const newCode = new AccessCode({ code, expiration });
      await newCode.save();
      res.json({ code });
    }
  });
});

app.get('/verify-code/:code', async (req, res) => {
  const { code } = req.params;
  const accessCode = await AccessCode.findOne({ code });

  if (accessCode && new Date() < new Date(accessCode.expiration)) {
    res.send('Code is valid');
  } else {
    res.send('Code is invalid or expired');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});