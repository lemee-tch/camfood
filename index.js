// backend/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Simple Express backend that creates Stripe PaymentIntents.
// Deploy this to Firebase Functions, Railway, Render, or run locally.
//
// SETUP:
//   npm install express stripe cors dotenv
//   Create .env with:  STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY
//   Run locally:  node index.js
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.json());
app.use(cors());

// ── POST /create-payment-intent ──────────────────────────────────────────────
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({ error: 'amount and currency are required' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),   // in centavos (smallest unit)
      currency: currency,           // 'php'
      automatic_payment_methods: {
        enabled: true,              // enables GCash, cards, etc. automatically
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'CampusFoodie payment server running' }));

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));