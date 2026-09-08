// ngrok dev tunnel for Mock Market — share your local server with anyone.
// Usage:
//   NGROK_AUTHTOKEN=xxxxx npm run tunnel            (tunnel the API+built client on :4280)
//   NGROK_AUTHTOKEN=xxxxx PORT=4280 npm run tunnel
//
// The authtoken is only needed the first time per machine (ngrok account,
// https://dashboard.ngrok.com/get-started/your-authtoken). Any ngrok version works here.
import ngrok from 'ngrok';

const PORT = Number(process.env.PORT) || 4280;
const token = process.env.NGROK_AUTHTOKEN;

if (!token) {
  console.log('\nNo NGROK_AUTHTOKEN set — skipping the tunnel (starting it would fail).');
  console.log('Set one with:  NGROK_AUTHTOKEN=xxxx npm run tunnel\n');
  process.exit(1);
}

const url = await ngrok.connect({
  addr: PORT,
  authtoken: token,
  region: process.env.NGROK_REGION || 'us',
});

console.log(`\n  Mock Market is live on the web:\n\n    ${url}\n`);
console.log('  (Ctrl+C to close the tunnel and stop)\n');

const stop = async () => {
  await ngrok.disconnect(url).catch(() => {});
  await ngrok.kill().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
