const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const http = require("http");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const ROOT = path.join(__dirname, "..");

async function read(file) {
  return fs.readFile(path.join(ROOT, file), "utf8");
}

function runScript(script, env = {}) {
  return execFileAsync("bash", [script], {
    cwd: ROOT,
    env: { ...process.env, ...env }
  });
}

test("systemd environment file stays outside the web root and is required", async () => {
  const service = await read("deploy/thecistus-homepage.service");
  assert.match(service, /Environment=HOST=127\.0\.0\.1/);
  assert.match(service, /Environment=SKIP_DOTENV=1/);
  assert.match(service, /EnvironmentFile=\/etc\/thecistus-homepage\.env/);
  assert.match(service, /ExecStart=\/usr\/bin\/node \/var\/www\/thecistus\.com\/current\/server\.js/);
  assert.match(service, /UMask=0077/);
  assert.match(service, /NoNewPrivileges=true/);
  assert.match(service, /PrivateTmp=true/);
  assert.match(service, /PrivateDevices=true/);
  assert.match(service, /ProtectSystem=strict/);
  assert.match(service, /ProtectKernelTunables=true/);
  assert.match(service, /CapabilityBoundingSet=/);
  assert.match(service, /RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6/);
  assert.match(service, /ReadWritePaths=\/var\/lib\/thecistus/);
  assert.doesNotMatch(service, /EnvironmentFile=-\/etc\/thecistus-homepage\.env/);
  assert.doesNotMatch(service, /EnvironmentFile=.*\/var\/www\/thecistus\.com\/current\/\.env/);
});

test("nginx configs block dotfiles, avoid duplicate CSP, and do not trust client-supplied XFF chains", async () => {
  const staticConf = await read("deploy/nginx.thecistus.com.conf");
  const nodeConf = await read("deploy/nginx.thecistus.com.node.conf");
  assert.match(staticConf, /location ~ \/\\\.\(\?!well-known/);
  assert.match(staticConf, /server\\\.js\|content-store\\\.js\|package/);
  assert.match(staticConf, /deploy\|scripts\|test\|data/);
  assert.match(nodeConf, /location ~ \/\\\.\(\?!well-known/);
  assert.match(nodeConf, /Strict-Transport-Security/);
  assert.doesNotMatch(nodeConf, /includeSubDomains/);
  assert.doesNotMatch(nodeConf, /Content-Security-Policy-Report-Only/);
  assert.match(nodeConf, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.doesNotMatch(nodeConf, /\$proxy_add_x_forwarded_for/);
  assert.match(nodeConf, /proxy_pass http:\/\/thecistus_app\/healthz;/);
});

test("preflight script runs syntax/tests/artifact/audit checks before deployment", async () => {
  const script = await read("deploy/preflight.sh");
  const pkg = JSON.parse(await read("package.json"));
  const publish = await read("deploy/publish_node_app.sh");
  const legacyPublish = await read("deploy/publish.sh");
  const legacyInstall = await read("deploy/install_nginx.sh");
  const ops = await read("docs/ec2-node-operations.md");

  assert.equal(pkg.scripts.preflight, "bash deploy/preflight.sh");
  assert.match(script, /node --check server\.js/);
  assert.match(script, /bash -n deploy\/\*\.sh/);
  assert.match(script, /find test -name '\*\.test\.js'/);
  assert.match(script, /npm test -- --test-reporter=spec/);
  assert.match(script, /publish artifact dry-run/);
  assert.match(script, /test ! -e "\$tmp_dest\/deploy"/);
  assert.match(script, /test ! -e "\$tmp_dest\/scripts"/);
  assert.match(script, /test ! -e "\$tmp_dest\/test"/);
  assert.match(script, /test ! -e "\$tmp_dest\/\.env"/);
  assert.match(script, /test ! -e "\$tmp_dest\/data\/content\.json"/);
  assert.match(script, /test ! -e "\$tmp_dest\/homepage-critical-feedback\.html"/);
  assert.match(script, /test ! -e "\$tmp_dest\/daylog"/);
  assert.match(script, /npm audit --omit=dev/);
  assert.match(script, /git diff --check/);

  assert.match(publish, /DRY_RUN/);
  assert.match(publish, /--dry-run --itemize-changes/);
  assert.match(publish, /dry-run destination must already exist/);
  assert.doesNotMatch(publish, /"\$ROOT_DIR\/deploy"/);
  assert.doesNotMatch(publish, /"\$ROOT_DIR\/scripts"/);
  assert.doesNotMatch(publish, /"\$ROOT_DIR\/test"/);
  assert.match(publish, /after operator confirmation/);
  assert.match(publish, /refusing to publish into an unsafe destination/);

  assert.match(legacyPublish, /ALLOW_LEGACY_STATIC_PUBLISH/);
  assert.match(legacyPublish, /legacy static publish is disabled/);
  assert.match(legacyInstall, /ALLOW_LEGACY_STATIC_INSTALL/);
  assert.match(legacyInstall, /legacy static nginx install is disabled/);

  assert.match(ops, /DRY_RUN=1 \.\/deploy\/publish_node_app\.sh/);
  assert.match(ops, /npm run preflight/);
  assert.match(ops, /운영 산출물에는 `deploy\/`, `scripts\/`, `test\/`를 포함하지 않는다/);
  assert.match(ops, /배포 전\/후 수동 QA 체크리스트/);
  assert.match(ops, /draft\/trash/);
  assert.match(ops, /sudoedit \/etc\/thecistus-homepage\.env/);
  assert.match(ops, /deploy\/check_env\.sh/);
  assert.match(ops, /deploy\/smoke_check\.sh/);
  assert.match(ops, /롤백 개요/);
  assert.match(ops, /rsync -a --delete --dry-run/);
  assert.match(ops, /ALLOW_LEGACY_STATIC_PUBLISH/);
  assert.match(ops, /\/server\.js/);
  assert.match(ops, /\/data\/admin-auth\.json/);
  assert.doesNotMatch(ops, /npm run set-admin-email --/);
  assert.doesNotMatch(ops, /\/var\/www\/thecistus\.com\/current\/\.env/);
});

test("node publish replaces stale runtime artifact directories", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "thecistus-publish-"));
  const stalePaths = ["deploy", "scripts", "test", "data"];
  for (const name of stalePaths) {
    await fs.mkdir(path.join(tmp, name), { recursive: true });
    await fs.writeFile(path.join(tmp, name, "stale.txt"), "stale\n");
  }
  await fs.writeFile(path.join(tmp, ".env"), "SECRET=do-not-keep\n");

  await execFileAsync("bash", ["deploy/publish_node_app.sh", tmp], { cwd: ROOT });

  await fs.access(path.join(tmp, "server.js"));
  await fs.access(path.join(tmp, "data", "default-content.json"));
  await fs.access(path.join(tmp, "data", "admin-auth.json"));
  for (const name of ["deploy", "scripts", "test", ".env", "data/content.json", "data/stale.txt"]) {
    await assert.rejects(fs.access(path.join(tmp, name)), undefined, name);
  }
});


test("operator scripts avoid secret printing and cover env/smoke checks", async () => {
  const envCheck = await read("deploy/check_env.sh");
  const smoke = await read("deploy/smoke_check.sh");
  const release = await read("docs/release-checklist.md");
  const hardening = await read("docs/frontend-hardening-plan.md");
  const gitignore = await read(".gitignore");

  assert.match(envCheck, /REQUIRED_KEYS/);
  assert.match(envCheck, /APP_DATA_DIR=\/var\/lib\/thecistus/);
  assert.match(envCheck, /CONTENT_PATH COMMENTS_PATH AUTH_PATH/);
  assert.match(envCheck, /HOST=127\\\.0\\\.0\\\.1/);
  assert.match(envCheck, /PORT=4173/);
  assert.match(envCheck, /values were not printed/);
  assert.match(envCheck, /EnvironmentFile=\/etc\/thecistus-homepage\.env/);
  assert.match(envCheck, /\[ -L "\$ENV_FILE" \]/);
  assert.match(envCheck, /EXPECTED_ENV_OWNER_GROUP/);
  assert.doesNotMatch(envCheck, /cat "?\$ENV_FILE/);
  assert.doesNotMatch(envCheck, /printenv/);
  assert.doesNotMatch(envCheck, /set -x/);
  assert.doesNotMatch(envCheck, /source "?\$ENV_FILE/);

  assert.match(smoke, /--connect-timeout/);
  assert.match(smoke, /--max-time/);
  assert.match(smoke, /\/healthz/);
  assert.match(smoke, /\/api\/content/);
  assert.match(smoke, /\/api\/admin\/content/);
  assert.match(smoke, /\/content-store\.js/);
  assert.match(smoke, /\/data\/admin-auth\.json/);
  assert.match(smoke, /\/scripts\//);
  assert.match(smoke, /\/test\//);
  assert.match(smoke, /\/homepage-critical-feedback\.html/);
  assert.match(smoke, /previousStatus/);
  assert.match(smoke, /deletedAt/);
  assert.match(smoke, /expected non-2xx/);
  assert.match(smoke, /response bodies were not printed/);

  assert.match(release, /내부 참고용/);
  assert.match(release, /homepage-critical-feedback\.html/);
  assert.match(release, /daylog\//);
  assert.match(release, /커밋 후보 분류 절차/);
  assert.match(release, /data\/admin-auth\.json/);
  assert.match(release, /password hash/);
  assert.match(release, /운영자만 실행/);
  assert.match(release, /install_node_stack\.sh/);
  assert.match(gitignore, /^daylog\/$/m);
  assert.match(gitignore, /^homepage-critical-feedback\.html$/m);
  assert.match(hardening, /Content-Security-Policy-Report-Only/);
  assert.match(hardening, /frame-src/);
  assert.match(hardening, /Node 앱을 canonical/);
  assert.match(hardening, /window export 단계적 축소 계획/);
});

test("env check script accepts sanitized fixture without printing values and reports missing keys", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "thecistus-env-"));
  const envFile = path.join(tmp, "homepage.env");
  const secretValue = "smtp-password-should-not-print";
  const envText = [
    "PORT=4173",
    "HOST=127.0.0.1",
    "APP_DATA_DIR=/var/lib/thecistus",
    "ADMIN_EMAIL=admin@example.invalid",
    "SMTP_HOST=smtp.example.invalid",
    "SMTP_PORT=465",
    "SMTP_SECURE=true",
    "SMTP_USER=mailer-user",
    `SMTP_PASS=${secretValue}`,
    "SMTP_FROM=no-reply@example.invalid",
    "CSRF_ALLOWED_ORIGINS=https://example.invalid",
    "CONTENT_PATH=/var/lib/thecistus/content.json",
    "COMMENTS_PATH=/var/lib/thecistus/comments.json",
    "AUTH_PATH=/var/lib/thecistus/admin-auth.json"
  ].join("\n");
  await fs.writeFile(envFile, `${envText}\n`);
  await fs.chmod(envFile, 0o640);

  const ok = await runScript("deploy/check_env.sh", { ENV_FILE: envFile });
  assert.match(ok.stdout, /values were not printed/);
  assert.doesNotMatch(`${ok.stdout}${ok.stderr}`, new RegExp(secretValue));
  assert.doesNotMatch(`${ok.stdout}${ok.stderr}`, /admin@example\.invalid/);

  const missingFile = path.join(tmp, "missing.env");
  await fs.writeFile(missingFile, envText.replace(/SMTP_PASS=.*\n?/, ""));
  await fs.chmod(missingFile, 0o640);
  await assert.rejects(
    runScript("deploy/check_env.sh", { ENV_FILE: missingFile }),
    (error) => {
      assert.match(error.stderr, /missing key: SMTP_PASS/);
      assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(secretValue));
      return true;
    }
  );

  const emptyFile = path.join(tmp, "empty.env");
  await fs.writeFile(emptyFile, envText.replace(`SMTP_PASS=${secretValue}`, "SMTP_PASS="));
  await fs.chmod(emptyFile, 0o640);
  await assert.rejects(
    runScript("deploy/check_env.sh", { ENV_FILE: emptyFile }),
    (error) => {
      assert.match(error.stderr, /empty value for key: SMTP_PASS/);
      assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(secretValue));
      return true;
    }
  );

  const quotedEmptyFile = path.join(tmp, "quoted-empty.env");
  await fs.writeFile(quotedEmptyFile, envText.replace(`SMTP_PASS=${secretValue}`, 'SMTP_PASS=""'));
  await fs.chmod(quotedEmptyFile, 0o640);
  await assert.rejects(
    runScript("deploy/check_env.sh", { ENV_FILE: quotedEmptyFile }),
    (error) => {
      assert.match(error.stderr, /empty value for key: SMTP_PASS/);
      assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(secretValue));
      return true;
    }
  );

  const duplicateFile = path.join(tmp, "duplicate.env");
  await fs.writeFile(duplicateFile, `${envText}\nHOST=0.0.0.0\n`);
  await fs.chmod(duplicateFile, 0o640);
  await assert.rejects(
    runScript("deploy/check_env.sh", { ENV_FILE: duplicateFile }),
    (error) => {
      assert.match(error.stderr, /duplicate key: HOST/);
      assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(secretValue));
      return true;
    }
  );

  const wrongHostFile = path.join(tmp, "wrong-host.env");
  await fs.writeFile(wrongHostFile, envText.replace("HOST=127.0.0.1", "HOST=0.0.0.0"));
  await fs.chmod(wrongHostFile, 0o640);
  await assert.rejects(
    runScript("deploy/check_env.sh", { ENV_FILE: wrongHostFile }),
    (error) => {
      assert.match(error.stderr, /HOST should be 127\.0\.0\.1/);
      assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(secretValue));
      return true;
    }
  );

  const wrongPortFile = path.join(tmp, "wrong-port.env");
  await fs.writeFile(wrongPortFile, envText.replace("PORT=4173", "PORT=3000"));
  await fs.chmod(wrongPortFile, 0o640);
  await assert.rejects(
    runScript("deploy/check_env.sh", { ENV_FILE: wrongPortFile }),
    (error) => {
      assert.match(error.stderr, /PORT should be 4173/);
      assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(secretValue));
      return true;
    }
  );

  const webRootDataFile = path.join(tmp, "web-root-data.env");
  await fs.writeFile(webRootDataFile, envText.replace("APP_DATA_DIR=/var/lib/thecistus", "APP_DATA_DIR=/var/www/thecistus.com/current/data"));
  await fs.chmod(webRootDataFile, 0o640);
  await assert.rejects(
    runScript("deploy/check_env.sh", { ENV_FILE: webRootDataFile }),
    (error) => {
      assert.match(error.stderr, /APP_DATA_DIR must not point inside the web root/);
      assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(secretValue));
      return true;
    }
  );

  const wrongDataFile = path.join(tmp, "wrong-data.env");
  await fs.writeFile(wrongDataFile, envText.replace("APP_DATA_DIR=/var/lib/thecistus", "APP_DATA_DIR=/tmp/thecistus"));
  await fs.chmod(wrongDataFile, 0o640);
  await assert.rejects(
    runScript("deploy/check_env.sh", { ENV_FILE: wrongDataFile }),
    (error) => {
      assert.match(error.stderr, /APP_DATA_DIR should be \/var\/lib\/thecistus/);
      assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(secretValue));
      return true;
    }
  );

  const unsafeContentPathFile = path.join(tmp, "unsafe-content-path.env");
  await fs.writeFile(
    unsafeContentPathFile,
    envText.replace("CONTENT_PATH=/var/lib/thecistus/content.json", "CONTENT_PATH=/var/www/thecistus.com/current/content.json")
  );
  await fs.chmod(unsafeContentPathFile, 0o640);
  await assert.rejects(
    runScript("deploy/check_env.sh", { ENV_FILE: unsafeContentPathFile }),
    (error) => {
      assert.match(error.stderr, /CONTENT_PATH must be inside APP_DATA_DIR/);
      assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(secretValue));
      assert.doesNotMatch(`${error.stdout}${error.stderr}`, /\/var\/www\/thecistus\.com\/current\/content\.json/);
      return true;
    }
  );

  const unsafeModeFile = path.join(tmp, "unsafe-mode.env");
  await fs.writeFile(unsafeModeFile, `${envText}\n`);
  await fs.chmod(unsafeModeFile, 0o644);
  await assert.rejects(
    runScript("deploy/check_env.sh", { ENV_FILE: unsafeModeFile }),
    (error) => {
      assert.match(error.stderr, /unsafe permissions/);
      assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(secretValue));
      return true;
    }
  );

  const symlinkTarget = path.join(tmp, "target.env");
  const symlinkFile = path.join(tmp, "symlink.env");
  await fs.writeFile(symlinkTarget, `${envText}\n`);
  await fs.symlink(symlinkTarget, symlinkFile);
  await assert.rejects(
    runScript("deploy/check_env.sh", { ENV_FILE: symlinkFile }),
    (error) => {
      assert.match(error.stderr, /must not be a symlink/);
      assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(secretValue));
      return true;
    }
  );
});

test("smoke script can verify a local fake app without printing response bodies", async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    if (pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok\n");
      return;
    }
    if (pathname === "/api/content") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ content: { portfolio: [{ id: "project-one", title: "Published Project" }] } }));
      return;
    }
    if (pathname === "/api/admin/content") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Authentication required" }));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const result = await runScript("deploy/smoke_check.sh", { BASE_URL: `http://127.0.0.1:${port}` });
    assert.match(result.stdout, /response bodies were not printed/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /Published Project/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("smoke script fails on public admin metadata without printing response bodies", async () => {
  const bodyOnlyForLeakCheck = "Draft Project Title Must Not Print";
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    if (pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok\n");
      return;
    }
    if (pathname === "/api/content") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ content: { portfolio: [{ id: "draft-project", title: bodyOnlyForLeakCheck, status: "draft" }] } }));
      return;
    }
    if (pathname === "/api/admin/content") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Authentication required" }));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    await assert.rejects(
      runScript("deploy/smoke_check.sh", { BASE_URL: `http://127.0.0.1:${port}` }),
      (error) => {
        assert.match(error.stderr, /exposes admin metadata key: status/);
        assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(bodyOnlyForLeakCheck));
        return true;
      }
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("smoke script fails on private 2xx and invalid JSON without printing response bodies", async () => {
  const privateBody = "private file body must not print";
  const privateServer = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    if (pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok\n");
      return;
    }
    if (pathname === "/api/content") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ content: { portfolio: [] } }));
      return;
    }
    if (pathname === "/api/admin/content") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Authentication required" }));
      return;
    }
    if (pathname === "/.env") {
      res.writeHead(204, { "Content-Type": "text/plain" });
      res.end(privateBody);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  await new Promise((resolve, reject) => {
    privateServer.once("error", reject);
    privateServer.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = privateServer.address();
    await assert.rejects(
      runScript("deploy/smoke_check.sh", { BASE_URL: `http://127.0.0.1:${port}` }),
      (error) => {
        assert.match(error.stderr, /expected non-2xx, got 204/);
        assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(privateBody));
        return true;
      }
    );
  } finally {
    await new Promise((resolve) => privateServer.close(resolve));
  }

  const invalidJsonBody = "invalid json body must not print";
  const invalidJsonServer = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    if (pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok\n");
      return;
    }
    if (pathname === "/api/content") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(invalidJsonBody);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  await new Promise((resolve, reject) => {
    invalidJsonServer.once("error", reject);
    invalidJsonServer.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = invalidJsonServer.address();
    await assert.rejects(
      runScript("deploy/smoke_check.sh", { BASE_URL: `http://127.0.0.1:${port}` }),
      (error) => {
        assert.match(error.stderr, /invalid JSON response/);
        assert.doesNotMatch(`${error.stdout}${error.stderr}`, new RegExp(invalidJsonBody));
        return true;
      }
    );
  } finally {
    await new Promise((resolve) => invalidJsonServer.close(resolve));
  }
});
