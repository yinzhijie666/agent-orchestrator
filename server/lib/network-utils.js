export async function isPortFree(port, host = "127.0.0.1") {
  try {
    const server = await import("node:net").then((m) =>
      m.createServer().listen(port, host)
    );
    await new Promise((resolve) => server.close(resolve));
    return true;
  } catch {
    return false;
  }
}

export async function findFreePort(range, host = "127.0.0.1") {
  for (const port of range) {
    if (await isPortFree(port, host)) {
      return port;
    }
  }
  return null;
}
