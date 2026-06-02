import express from "express";
import path from "node:path";
import process from "node:process";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const config = {
    dir: "",
    port: 3001,
    host: "0.0.0.0",
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--dir") {
      config.dir = args[index + 1] || "";
      index += 1;
      continue;
    }

    if (token === "--port") {
      const parsed = Number(args[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        config.port = parsed;
      }
      index += 1;
      continue;
    }

    if (token === "--host") {
      config.host = args[index + 1] || config.host;
      index += 1;
    }
  }

  return config;
};

const { dir, port, host } = parseArgs();

if (!dir) {
  // eslint-disable-next-line no-console
  console.error("Missing required argument --dir /absolute/path/to/site");
  process.exit(1);
}

const app = express();
const resolvedDir = path.resolve(dir);

app.use(express.static(resolvedDir, { extensions: ["html"] }));

app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(resolvedDir, "index.html"));
});

app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Serving ${resolvedDir} at http://${host}:${port}`);
});
