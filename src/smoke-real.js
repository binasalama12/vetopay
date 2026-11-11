/**
 * Live sandbox smoke test (requires a filled .env — see README).
 * Connects to the OFFICIAL PayPal MCP server in sandbox mode and lists
 * its tools. Moves no money. Run: npm run smoke:real
 */
import { getConfig } from './config.js';
import { createRealTransport } from './transport/mcp.js';

const config = getConfig();
if (!config.clientId || !config.clientSecret) {
  console.error('SMOKE ABORTED: PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are empty.');
  console.error('Fill .env with the SANDBOX credentials of the "VetoPay" app first (see README).');
  process.exit(2);
}

const transport = await createRealTransport(config);
try {
  const tools = await transport.listTools();
  console.log(`PayPal MCP (sandbox) reachable. ${tools.length} tools:`);
  for (const t of tools) console.log(' -', t.name);
} finally {
  await transport.close();
}
