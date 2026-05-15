if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const cors = require('cors');

// Fail fast and loud if the secret key is missing
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('FATAL: STRIPE_SECRET_KEY environment variable is not set.');
  process.exit(1);
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.json());
app.use(cors());

// Cache the exchange rate so we're not hitting the API on every request
let cachedRate = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getPhpToUsdRate() {
  const now = Date.now();
  if (cachedRate && now - cacheTime < CACHE_TTL) return cachedRate;

  const res = await fetch('https://open.er-api.com/v6/latest/PHP');
  if (!res.ok) throw new Error(`Exchange rate API error: ${res.status}`);
  const data = await res.json();
  if (!data.rates?.USD) throw new Error('Exchange rate response missing USD rate');
  cachedRate = data.rates.USD;
  cacheTime = now;
  return cachedRate;
}

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency } = req.body; // amount is in centavos PHP

    if (!amount || !currency) {
      return res.status(400).json({ error: 'amount and currency are required' });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    let chargeAmount = Math.round(amount);
    let chargeCurrency = currency.toLowerCase();

    // PHP is not directly supported by Stripe — convert to USD
    if (chargeCurrency === 'php') {
      const rate = await getPhpToUsdRate();
      const amountInPHP = amount / 100;             // centavos → pesos
      const amountInUSD = amountInPHP * rate;       // pesos → USD
      chargeAmount = Math.round(amountInUSD * 100); // USD → cents
      chargeCurrency = 'usd';

      // Stripe minimum charge is $0.50 USD (50 cents)
      if (chargeAmount < 50) {
        chargeAmount = 50;
      }
    }

    console.log(`Creating PaymentIntent: ${chargeAmount} ${chargeCurrency.toUpperCase()}`);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: chargeAmount,
      currency: chargeCurrency,
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Stripe error:', err.message);
    // Return the real error message so Flutter can show it
    res.status(500).json({ error: err.message });
  }
});

// Health check — also verifies Stripe key is valid
app.get('/', async (req, res) => {
  try {
    await stripe.paymentIntents.list({ limit: 1 });
    res.json({ status: 'CampusFoodie payment server running', stripe: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'running', stripe: 'error', detail: err.message });
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));