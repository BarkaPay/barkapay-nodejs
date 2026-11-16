'use strict';

/**
 * Runtime smoke test of the BUILT package (dist), with no dev dependency: it
 * runs on every supported Node version, including those the dev toolchain no
 * longer supports. It exercises the real global `fetch` against a loopback
 * server — the only place where redirects, timeouts and aborts are checked
 * against a real HTTP stack.
 */

const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const http = require('node:http');
const { inspect } = require('node:util');

const API_KEY = 'pk_live_smoke:sk_live_not-a-real-SMOKESECRET';

function envelope(data, extra) {
  return JSON.stringify({
    status: 'success',
    code: 'success',
    message: 'OK',
    timestamp: new Date().toISOString(),
    request_id: 'req-smoke',
    data,
    ...extra,
  });
}

/** A tiny stand-in for the hub: just enough routes to exercise the transport. */
function startServer() {
  const seen = [];
  const hits = new Map();

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const count = (hits.get(req.url) ?? 0) + 1;
      hits.set(req.url, count);
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });

      const json = (status, text, headers = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(text);
      };

      if (req.url === '/bf/v1/ping') {
        return json(200, envelope({ version: '2.0.0' }), { 'X-Request-Id': 'srv-1' });
      }
      if (req.url === '/bf/v1/redirect') {
        res.writeHead(302, { Location: '/bf/v1/stolen' });
        return res.end();
      }
      if (req.url === '/bf/v1/slow') {
        return undefined; // never answers
      }
      if (req.url === '/bf/v1/flaky') {
        return count === 1
          ? json(
              503,
              '{"status":"error","code":"service_unavailable","message":"busy"}',
              {
                'Retry-After': '0',
              },
            )
          : json(200, envelope({ attempt: count }));
      }
      if (req.url === '/bf/v1/payments' && req.method === 'POST') {
        return json(
          503,
          '{"status":"error","code":"service_unavailable","message":"busy"}',
        );
      }
      if (req.url === '/bf/v1/payments/links' && req.method === 'POST') {
        return json(
          201,
          envelope({
            payment_link: {
              public_id: 'PL-smoke',
              slug: '9j32HfkT2mQx4',
              url: 'https://checkout.example/9j32HfkT2mQx4',
              status: 'active',
              amount: { type: 'fixed', value: '25000', currency: 'XOF' },
              stats: { payments_count: 0, total_collected: '0' },
            },
          }),
        );
      }
      if (req.url === '/bf/v1/html') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        return res.end('<html>Not Found</html>');
      }
      return json(404, '{"status":"error","code":"resource_not_found","message":"nope"}');
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        seen,
        hits,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
      });
    });
  });
}

async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new assert.AssertionError({ message: 'expected the promise to reject' });
}

async function run(sdk, label, packageVersion) {
  const {
    ApiError,
    NetworkError,
    NotFoundError,
    BarkaPay,
    ServiceUnavailableError,
    SignatureVerificationError,
    VERSION,
    WEBHOOK_SIGNATURE_HEADER,
    parseWebhook,
    verifyWebhookSignature,
  } = sdk;

  // --- the module itself -----------------------------------------------------
  assert.equal(typeof BarkaPay, 'function', 'BarkaPay is exported');
  assert.equal(VERSION, packageVersion, 'VERSION matches the installed package.json');
  assert.equal(BarkaPay.VERSION, packageVersion);
  assert.equal(WEBHOOK_SIGNATURE_HEADER, 'Barkapay-Signature');
  assert.equal(typeof globalThis.fetch, 'function', 'this Node has a global fetch');

  const { server, seen, hits, baseUrl } = await startServer();

  try {
    const client = new BarkaPay({
      apiKey: API_KEY,
      country: 'bf',
      baseUrl,
      timeoutMs: 2000,
    });

    // --- a real round trip over the global fetch -----------------------------
    const ping = await client.ping();
    assert.deepEqual(ping, { version: '2.0.0' });
    const first = seen[0];
    assert.equal(first.headers.authorization, `Bearer ${API_KEY}`);
    assert.equal(first.headers.accept, 'application/json');
    assert.match(first.headers['user-agent'], /^barkapay-node\/\d+\.\d+\.\d+ node\//);
    assert.match(first.headers['x-request-id'], /^[0-9a-f-]{36}$/);

    // Send `ping()` to another route of the stand-in server, through the REAL
    // global fetch and with the init the SDK built (signal, redirect mode…).
    const routedTo = (route, options = {}) =>
      new BarkaPay({
        apiKey: API_KEY,
        country: 'bf',
        baseUrl,
        maxRetries: 0,
        ...options,
        fetch: (url, init) => globalThis.fetch(url.replace('/bf/v1/ping', route), init),
      });

    // --- redirects are never followed, credentials never forwarded -----------
    const redirected = await rejection(routedTo('/bf/v1/redirect').ping());
    assert.ok(redirected instanceof ApiError, 'a 3xx surfaces as an ApiError');
    assert.equal(redirected.httpStatus, 302);
    assert.equal(hits.get('/bf/v1/redirect'), 1);
    assert.ok(
      !seen.some((request) => request.url === '/bf/v1/stolen'),
      'the redirect target was never requested',
    );

    // --- timeouts abort a real socket ----------------------------------------
    const startedAt = Date.now();
    const timeout = await rejection(routedTo('/bf/v1/slow', { timeoutMs: 150 }).ping());
    assert.ok(timeout instanceof NetworkError, 'a timeout is a NetworkError');
    assert.equal(timeout.timedOut, true);
    assert.ok(Date.now() - startedAt < 1500, 'the timeout fired on time');

    // --- an idempotent GET is retried, honouring Retry-After -----------------
    const flaky = await routedTo('/bf/v1/flaky', { maxRetries: 2 }).ping();
    assert.deepEqual(flaky, { attempt: 2 });
    assert.equal(hits.get('/bf/v1/flaky'), 2);

    // --- a money-moving POST is never replayed on a 503 ----------------------
    const refused = await rejection(
      new BarkaPay({
        apiKey: API_KEY,
        country: 'bf',
        baseUrl,
        maxRetries: 3,
      }).payments.create({
        operator: 'ORANGE',
        phone_number: '74123456',
        amount: 100,
        order: { id: 'SMOKE-1', unique: true },
      }),
    );
    assert.ok(refused instanceof ServiceUnavailableError);
    assert.equal(hits.get('/bf/v1/payments'), 1, 'POST /payments was sent exactly once');

    // --- a non-JSON error page maps by status --------------------------------
    assert.ok((await rejection(routedTo('/bf/v1/html').ping())) instanceof NotFoundError);

    // --- payment links --------------------------------------------------------
    const link = await client.paymentLinks.create({
      title: 'Smoke',
      amount: { type: 'fixed', value: 25000 },
    });
    assert.equal(link.object, 'payment_link');
    assert.equal(link.url, 'https://checkout.example/9j32HfkT2mQx4');

    // --- path injection is refused before any request ------------------------
    const before = seen.length;
    for (const id of ['..', '.', '', 'a/b', '../../admin']) {
      const error = await rejection(client.payments.get(id));
      assert.equal(
        error.name,
        'ConfigurationError',
        `id ${JSON.stringify(id)} is refused`,
      );
    }
    assert.equal((await rejection(client.ping('bf/../sn'))).name, 'ConfigurationError');
    assert.equal(seen.length, before, 'no request left the process');

    // --- the key never shows up in dumps -------------------------------------
    for (const options of [
      {},
      { depth: Infinity, showHidden: true, customInspect: false },
    ]) {
      const dump = inspect(client, options);
      assert.ok(!dump.includes('SMOKESECRET'), 'inspect() hides the secret');
      assert.ok(!dump.includes('pk_live_smoke'), 'inspect() hides the key id');
    }
    assert.ok(
      !JSON.stringify(client).includes('SMOKESECRET'),
      'JSON.stringify hides the secret',
    );
    assert.ok(!inspect(timeout, { depth: Infinity }).includes('SMOKESECRET'));
  } finally {
    await new Promise((resolve) => {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      server.close(() => resolve());
    });
  }

  // --- webhooks ----------------------------------------------------------------
  const secret = 'whsec_smoke';
  const body =
    '{"type":"payment","public_id":"p-1","status":"SUCCESSFUL","event_id":"e-1"}';
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const header = `t=${t},v1=${v1}`;

  assert.equal(verifyWebhookSignature(body, header, secret), true);
  assert.equal(verifyWebhookSignature(Buffer.from(body), header, secret), true);
  assert.equal(verifyWebhookSignature(`${body} `, header, secret), false);
  assert.equal(verifyWebhookSignature(body, header, 'whsec_other'), false);
  assert.equal(verifyWebhookSignature(body, undefined, secret), false);
  assert.equal(parseWebhook(body, header, secret).status, 'SUCCESSFUL');
  assert.throws(
    () => parseWebhook(body, 't=1,v1=zz', secret),
    SignatureVerificationError,
  );
  assert.throws(() => parseWebhook(JSON.parse(body), header, secret), /RAW request body/);

  console.log(
    `smoke ok — ${label} — node ${process.versions.node} — barkapay ${VERSION}`,
  );
}

module.exports = { run };
