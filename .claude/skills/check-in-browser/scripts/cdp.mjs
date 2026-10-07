// A minimal Chrome DevTools Protocol client: one page target, send/await, events.
// Used by flow.mjs. Chrome must already be running with --remote-debugging-port
// (run.mjs starts it). Node 22 has the WebSocket this needs built in.

export async function openPage(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const target = await response.json();
  return connect(target.webSocketDebuggerUrl, target.id, port);
}

/**
 * Asks the browser on `port` to close itself, every process of it (Browser.close) - for run.mjs, whose own
 * child may be gone by then: Edge's launcher hands the browser to a process of its own and exits, and stopping
 * the child left the browser running. False when nothing answers.
 */
export async function closeBrowser(port) {
  try {
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const browser = await connect(version.webSocketDebuggerUrl, null, port);
    // The answer may never come: the browser is going.
    await Promise.race([browser.send('Browser.close').catch(() => undefined), new Promise((done) => setTimeout(done, 3000))]);
    browser.socket.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * A page in a browser context of its own - another browser, as far as the site can tell: no localStorage, no
 * cookies, no session shared with the first page. `close()` disposes the context with it.
 */
export async function openPageInNewContext(port) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browser = await connect(version.webSocketDebuggerUrl, null, port);
  const { browserContextId } = await browser.send('Target.createBrowserContext');
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((item) => item.id === targetId);
  const page = await connect(target.webSocketDebuggerUrl, targetId, port);
  const closePage = page.close;
  page.close = async () => {
    await closePage();
    await browser.send('Target.disposeBrowserContext', { browserContextId }).catch(() => undefined);
    browser.socket.close();
  };
  return page;
}

async function connect(url, targetId, port) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  socket.addEventListener('message', (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      data.error ? reject(new Error(`${data.error.message} ${data.error.data ?? ''}`)) : resolve(data.result);
      return;
    }
    for (const listener of listeners.get(data.method) ?? []) {
      listener(data.params);
    }
  });

  const page = {
    targetId,
    socket,
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    on(method, listener) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(listener);
    },
    async evaluate(expression) {
      const result = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) {
        throw new Error(`evaluate failed: ${JSON.stringify(result.exceptionDetails).slice(0, 500)}`);
      }
      return result.result.value;
    },
    async close() {
      socket.close();
      await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`).catch(() => undefined);
    },
  };

  return page;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls an expression in the page until it is truthy. */
export async function waitFor(page, expression, timeout = 15000, interval = 150) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    try {
      last = await page.evaluate(expression);
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await sleep(interval);
  }
  throw new Error(`timed out waiting for: ${expression} (last: ${JSON.stringify(last)})`);
}
