const server = Bun.serve({
  port: parseInt(process.env.PORT || "5173"),
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    // Try to serve the static file
    const file = Bun.file(`dist${path}`);
    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback: serve index.html for client-side routing
    const indexFile = Bun.file("dist/index.html");
    if (await indexFile.exists()) {
      return new Response(indexFile);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running on http://localhost:${server.port}`);
