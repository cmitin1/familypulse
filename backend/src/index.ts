async function main() {
  // Подхватываем Express app из app.ts независимо от того, как он экспортируется
  const mod: any = await import("./app");
  const maybeCreate = typeof mod.createApp === "function" ? mod.createApp() : null;
  const app: any = mod.default ?? mod.app ?? maybeCreate;

  if (!app || typeof app.listen !== "function") {
    throw new Error(
      "Cannot find Express app export in ./app (expected default export, named 'app', or createApp())."
    );
  }

  // Health endpoint
  if (typeof app.get === "function") {
    app.get("/health", (_req: any, res: any) => res.status(200).json({ ok: true }));
  }

  const port = Number(process.env.PORT || 4000);
  const host = process.env.HOST || "0.0.0.0";

  app.listen(port, host, () => {
    console.log(`FamilyPulse API listening on http://${host}:${port}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
