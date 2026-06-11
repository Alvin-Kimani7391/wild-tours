const express = require('express');
const router = express.Router();
const axios = require('axios');
const { protect, asyncHandler } = require('../middleware/auth');
const Booking = require('../models/Booking');
const Application = require('../models/Volunteer').Application;
const { sendEmail } = require('../utils/email');

// ── M-PESA HELPERS ───────────────────────────────────────
const getMpesaToken = async () => {
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const baseUrl = process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

  const res = await axios.get(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  return { token: res.data.access_token, baseUrl };
};

const getMpesaTimestamp = () => {
  const now = new Date();
  const pad = n => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

// ── POST /api/payments/mpesa/stk-push ────────────────────
router.post('/mpesa/stk-push', protect, asyncHandler(async (req, res) => {
  const { phone, amount, bookingId, applicationId } = req.body;

  if (!phone || !amount) {
    return res.status(400).json({ success: false, message: 'Phone and amount are required.' });
  }

  // Format phone: 254XXXXXXXXX
  const formattedPhone = phone.replace(/^(\+254|0)/, '254');

  const { token, baseUrl } = await getMpesaToken();
  const timestamp = getMpesaTimestamp();
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const accountRef = bookingId
    ? `WR-BK-${bookingId.slice(-8).toUpperCase()}`
    : `WR-APP-${applicationId?.slice(-8).toUpperCase()}`;

  try {
    const stkRes = await axios.post(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: accountRef,
      TransactionDesc: `WildRoots Africa - ${accountRef}`,
    }, { headers: { Authorization: `Bearer ${token}` } });

    const checkoutRequestId = stkRes.data.CheckoutRequestID;

    // Save pending payment record
    if (bookingId) {
      const booking = await Booking.findById(bookingId);
      if (booking && booking.user.toString() === req.user._id.toString()) {
        booking.payments.push({
          method: 'mpesa',
          amount,
          reference: checkoutRequestId,
          status: 'pending',
        });
        await booking.save();
      }
    }

    res.json({
      success: true,
      message: 'STK Push sent. Check your phone and enter your M-Pesa PIN.',
      checkoutRequestId,
      merchantRequestId: stkRes.data.MerchantRequestID,
    });
  } catch (err) {
    const errMsg = err.response?.data?.errorMessage || 'M-Pesa STK Push failed. Try again.';
    res.status(400).json({ success: false, message: errMsg });
  }
}));

// ── POST /api/payments/mpesa/callback ────────────────────
router.post('/mpesa/callback', asyncHandler(async (req, res) => {
  const { Body } = req.body;
  if (!Body?.stkCallback) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  const { ResultCode, ResultDesc, CallbackMetadata, CheckoutRequestID } = Body.stkCallback;

  if (ResultCode === 0) {
    // Payment successful
    const meta = {};
    CallbackMetadata.Item.forEach(item => { meta[item.Name] = item.Value; });

    // Find booking with this checkoutRequestId
    const booking = await Booking.findOne({ 'payments.reference': CheckoutRequestID })
      .populate('user', 'firstName email')
      .populate('tour', 'title');

    if (booking) {
      const payment = booking.payments.find(p => p.reference === CheckoutRequestID);
      if (payment) {
        payment.status = 'completed';
        payment.paidAt = new Date();
        payment.reference = meta.MpesaReceiptNumber || CheckoutRequestID;
      }
      booking.paymentStatus = meta.Amount >= booking.totalAmount ? 'fully_paid' : 'deposit_paid';
      if (booking.status === 'pending') booking.status = 'confirmed';
      await booking.save();

      // Email
      try {
        await sendEmail({
          to: booking.user.email,
          subject: `✅ Payment Confirmed via M-Pesa - ${booking.bookingRef}`,
          template: 'paymentConfirmed',
          data: {
            name: booking.user.firstName,
            bookingRef: booking.bookingRef,
            tourName: booking.tour.title,
            amount: meta.Amount,
            mpesaRef: meta.MpesaReceiptNumber,
            method: 'M-Pesa',
          }
        });
      } catch (e) { /* non-critical */ }
    }
  } else {
    // Payment failed - update payment record
    const booking = await Booking.findOne({ 'payments.reference': CheckoutRequestID });
    if (booking) {
      const payment = booking.payments.find(p => p.reference === CheckoutRequestID);
      if (payment) payment.status = 'failed';
      await booking.save();
    }
    console.log('M-Pesa payment failed:', ResultDesc);
  }

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}));

// ── POST /api/payments/mpesa/query ───────────────────────
router.post('/mpesa/query', protect, asyncHandler(async (req, res) => {
  const { checkoutRequestId } = req.body;
  const { token, baseUrl } = await getMpesaToken();
  const timestamp = getMpesaTimestamp();
  const shortcode = process.env.MPESA_SHORTCODE;
  const password = Buffer.from(`${shortcode}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

  try {
    const queryRes = await axios.post(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }, { headers: { Authorization: `Bearer ${token}` } });

    res.json({ success: true, data: queryRes.data });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Query failed.' });
  }
}));

// ── POST /api/payments/paypal/create-order ───────────────
router.post('/paypal/create-order', protect, asyncHandler(async (req, res) => {
  const { bookingId, amount, currency = 'USD' } = req.body;

  const booking = await Booking.findById(bookingId).populate('tour', 'title');
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (booking.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized.' });
  }

  // Get PayPal access token
  const authRes = await axios.post(
    `https://api${process.env.PAYPAL_MODE === 'live' ? '' : '.sandbox'}.paypal.com/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      auth: { username: process.env.PAYPAL_CLIENT_ID, password: process.env.PAYPAL_CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );
  const accessToken = authRes.data.access_token;
  const paypalBase = `https://api${process.env.PAYPAL_MODE === 'live' ? '' : '.sandbox'}.paypal.com`;

  const orderRes = await axios.post(`${paypalBase}/v2/checkout/orders`, {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: booking.bookingRef,
      description: `Booking: ${booking.tour.title}`,
      amount: { currency_code: currency, value: amount.toFixed(2) },
    }],
    application_context: {
      return_url: `${process.env.CLIENT_URL}/booking-success.html?bookingId=${bookingId}`,
      cancel_url: `${process.env.CLIENT_URL}/tour-detail.html?cancelled=true`,
      brand_name: 'WildRoots Africa',
    }
  }, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });

  // Save pending payment
  booking.payments.push({
    method: 'paypal', amount, currency,
    reference: orderRes.data.id, status: 'pending',
  });
  await booking.save();

  res.json({ success: true, orderId: orderRes.data.id, approveUrl: orderRes.data.links.find(l => l.rel === 'approve')?.href });
}));

// ── POST /api/payments/paypal/capture ────────────────────
router.post('/paypal/capture', protect, asyncHandler(async (req, res) => {
  const { orderId, bookingId } = req.body;

  const authRes = await axios.post(
    `https://api${process.env.PAYPAL_MODE === 'live' ? '' : '.sandbox'}.paypal.com/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      auth: { username: process.env.PAYPAL_CLIENT_ID, password: process.env.PAYPAL_CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );
  const accessToken = authRes.data.access_token;
  const paypalBase = `https://api${process.env.PAYPAL_MODE === 'live' ? '' : '.sandbox'}.paypal.com`;

  const captureRes = await axios.post(
    `${paypalBase}/v2/checkout/orders/${orderId}/capture`,
    {},
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );

  if (captureRes.data.status === 'COMPLETED') {
    const booking = await Booking.findById(bookingId)
      .populate('user', 'firstName email')
      .populate('tour', 'title');

    if (booking) {
      const payment = booking.payments.find(p => p.reference === orderId);
      if (payment) { payment.status = 'completed'; payment.paidAt = new Date(); }
      booking.paymentStatus = payment?.amount >= booking.totalAmount ? 'fully_paid' : 'deposit_paid';
      booking.status = 'confirmed';
      await booking.save();

      await sendEmail({
        to: booking.user.email,
        subject: `✅ Payment Confirmed via PayPal - ${booking.bookingRef}`,
        template: 'paymentConfirmed',
        data: {
          name: booking.user.firstName,
          bookingRef: booking.bookingRef,
          tourName: booking.tour.title,
          amount: payment?.amount,
          method: 'PayPal',
          paypalOrderId: orderId,
        }
      });
    }

    res.json({ success: true, message: 'Payment captured successfully.', booking });
  } else {
    res.status(400).json({ success: false, message: 'PayPal payment capture failed.' });
  }
}));

// ── GET /api/payments/bank-details ───────────────────────
router.get('/bank-details', (req, res) => {
  res.json({
    success: true,
    bankDetails: {
      bankName: 'Equity Bank Kenya',
      accountName: 'WildRoots Africa Ltd',
      accountNumber: '0150263XXXX',
      branchCode: '68',
      swiftCode: 'EQBLKENA',
      currency: 'KES / USD',
      instructions: 'Please use your Booking Reference as the payment reference. Send proof of payment through the portal.',
    }
  });
});

module.exports = router;