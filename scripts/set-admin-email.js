const fs = require("fs/promises");
const path = require("path");
require("dotenv").config();

const [, , emailArg] = process.argv;

if (!emailArg || !String(emailArg).includes("@")) {
  console.error("Usage: node scripts/set-admin-email.js <email>");
  process.exit(1);
}

const envPath = path.join(__dirname, "..", ".env");

async function main() {
  try {
    await fs.access(envPath);
  } catch {
    await fs.writeFile(envPath, "", "utf8");
  }

  const nextEmail = String(emailArg).trim().toLowerCase();
  const currentEnv = await fs.readFile(envPath, "utf8");
  const envLines = currentEnv ? currentEnv.split(/\r?\n/) : [];
  let found = false;
  const nextLines = envLines.map((line) => {
    if (!line.startsWith("ADMIN_EMAIL=")) {
      return line;
    }
    found = true;
    return `ADMIN_EMAIL=${nextEmail}`;
  });

  if (!found) {
    if (nextLines.length && nextLines[nextLines.length - 1] !== "") {
      nextLines.push("");
    }
    nextLines.push(`ADMIN_EMAIL=${nextEmail}`);
  }

  await fs.writeFile(envPath, `${nextLines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
  console.log(`Updated admin email in: ${envPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
