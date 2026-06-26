const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

module.exports = function (passport) {

  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,

      // ✅ FIX: must be absolute URL for Render production
      callbackURL: `${process.env.SERVER_URL}/api/auth/google/callback`
    },

    async (accessToken, refreshToken, profile, done) => {
      try {

        // Try to find existing user by Google ID
        let user = await User.findOne({ googleId: profile.id });

        // If not found, also check email (prevents duplicate accounts)
        if (!user && profile.emails?.[0]?.value) {
          user = await User.findOne({ email: profile.emails[0].value });
        }

        // If still not found, create new user
        if (!user) {
          user = await User.create({
            googleId: profile.id,
            firstName: profile.displayName,
            email: profile.emails?.[0]?.value || null,
            avatar: profile.photos?.[0]?.value || null,
            isVerified: true
          });
        } else {
          // If user exists but has no googleId, link it
          if (!user.googleId) {
            user.googleId = profile.id;
            await user.save();
          }
        }

        return done(null, user);

      } catch (err) {
        return done(err, null);
      }
    }
  ));

};