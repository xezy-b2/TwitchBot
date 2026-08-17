const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'dev_secret',
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 jours
    })
  );

  // Overlays (OBS Browser Source) : accès public, pas d'auth nécessaire
  app.use('/overlay', express.static(path.join(__dirname, '../../public/overlay')));
  // Fichiers son du soundboard : stockés en MongoDB (persistant), servis publiquement
  app.use('/sound-files', require('./routes/soundFiles'));
  app.use('/overlay-images', require('./routes/overlayImages'));
  // API publique (sans auth) : utilisée par l'overlay OBS pour son état initial
  app.use('/public-api', require('./routes/publicApi'));

  // Middleware d'auth pour le dashboard et son API
  function requireAuth(req, res, next) {
    if (req.session?.authenticated) return next();
    if (req.path.startsWith('/api')) return res.status(401).json({ error: 'Non authentifié' });
    return res.redirect('/login.html');
  }

  const authRoutes = require('./routes/auth');
  app.use('/auth', authRoutes);

  // Page de login servie sans auth
  app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/dashboard/login.html'));
  });

  // CSS/JS du dashboard : accès public, nécessaire car la page de login
  // (non authentifiée) les charge aussi. Doit être déclaré AVANT le
  // middleware protégé ci-dessous pour être prioritaire sur ces chemins.
  app.use('/dashboard/css', express.static(path.join(__dirname, '../../public/dashboard/css')));
  app.use('/dashboard/js', express.static(path.join(__dirname, '../../public/dashboard/js')));

  app.use('/dashboard', requireAuth, express.static(path.join(__dirname, '../../public/dashboard')));
  app.use('/api', requireAuth, require('./routes/api'));

  app.get('/', (req, res) => res.redirect('/dashboard'));

  return app;
}

module.exports = createApp;
