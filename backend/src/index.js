/*
 * FILE GUIDE: Server Process Entry Point (backend/src/index.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Dito talaga binubuhay yung HTTP server kapag actual run na: naglo-load ng .env,
 *   ini-import yung configured Express app galing app.js, at nag-li-listen sa port.
 *
 * Kapag may bug o babaguhing feature, dito unang silipin:
 *   - Port conflict (EADDRINUSE) — palitan lang yung PORT sa backend/.env
 *   - Network binding issues — naka-0.0.0.0 'to para ma-reach sa LAN o cloud host
 */
require('dotenv').config();
const app = require('./app');

// Kinukuha yung PORT sa .env, o nagde-default sa 3001 kapag local dev.
const PORT = Number(process.env.PORT) || 3001;

// Nag-li-listen sa lahat ng network interfaces (0.0.0.0) para gumana sa localhost at hosting platforms.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
