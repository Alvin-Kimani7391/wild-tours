const express = require('express');
const router = express.Router();
const { protect, authorize, asyncHandler } = require('../middleware/auth');
const { VolunteerProgram, Application } = require('../models/Volunteer');
const { Review } = require('../models/Review');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Tour = require('../models/Tour');

// GET /api/dashboard/stats — admin/staff: full platform overview
router.get(
  '/stats',
  protect,
  authorize('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersThisMonth,
      totalBookings,
      confirmedBookings,
      pendingBookings,
      cancelledBookings,
      totalApplications,
      approvedApplications,
      pendingApplications,
      totalRevenueAgg,
      monthRevenueAgg,
      totalTours,
      totalPrograms,
      totalReviews,
      pendingReviews,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'user', createdAt: { $gte: monthStart } }),

      Booking.countDocuments(),
      Booking.countDocuments({ status: 'confirmed' }),
      Booking.countDocuments({ status: 'pending' }),
      Booking.countDocuments({ status: 'cancelled' }),

      Application.countDocuments(),
      Application.countDocuments({ status: 'approved' }),
      Application.countDocuments({ status: 'pending' }),

      Booking.aggregate([
        { $match: { paymentStatus: { $in: ['deposit_paid', 'fully_paid'] } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Booking.aggregate([
        { $match: { paymentStatus: { $in: ['deposit_paid', 'fully_paid'] }, createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),

      Tour.countDocuments({ isActive: true }),
      VolunteerProgram.countDocuments({ isActive: true }),
      Review.countDocuments(),
      Review.countDocuments({ isApproved: false }),
    ]);

    // Monthly revenue chart data — last 6 months
    const monthlyRevenue = await Booking.aggregate([
      {
        $match: {
          paymentStatus: { $in: ['deposit_paid', 'fully_paid'] },
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id:   { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          count:   { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Recent activity feeds
    const recentBookings = await Booking.find()
      .populate('tour', 'title destination')
      .populate('user', 'firstName lastName email')
      .sort('-createdAt')
      .limit(5);

    const recentApplications = await Application.find()
      .populate('program', 'title country')
      .populate('user', 'firstName lastName email')
      .sort('-createdAt')
      .limit(5);

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          newThisMonth: newUsersThisMonth,
        },
        bookings: {
          total:     totalBookings,
          confirmed: confirmedBookings,
          pending:   pendingBookings,
          cancelled: cancelledBookings,
        },
        applications: {
          total:    totalApplications,
          approved: approvedApplications,
          pending:  pendingApplications,
        },
        revenue: {
          total:     totalRevenueAgg[0]?.total || 0,
          thisMonth: monthRevenueAgg[0]?.total  || 0,
        },
        content: {
          tours:          totalTours,
          programs:       totalPrograms,
          reviews:        totalReviews,
          pendingReviews,
        },
      },
      monthlyRevenue,
      recentBookings,
      recentApplications,
    });
  })
);

module.exports = router;