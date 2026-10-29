const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const workflowId = 'seKtuQgWny3K7y5m';
const temporaryDirectory = path.join(root, 'temp');
const envFile = path.join(root, '.env');
const tunnelExecutable = path.join(root, 'tools/cloudflared.exe');
const tunnelLog = path.join(temporaryDirectory, 'tunnel-startup.log');
const tunnelPidFile = path.join(temporaryDirectory, 'tunnel.pid');
const pause = () => new Promise(resolve => setTimeout(resolve, 1000));
const docker = (args, options = {}) => execFileSync('docker', ['compose', ...args], {
  cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000, ...options,
});
const powershell = source => execFileSync('powershell.exe', [
  '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ProgressPreference = 'SilentlyContinue'; " + source, 'utf16le').toString('base64'),
], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 }).trim();
const quote = value => "'" + value.replaceAll("'", "''") + "'";

async function healthy(base) {
  try {
    const response = await fetch(new URL('healthz', base + '/'), { signal: AbortSignal.timeout(5000) });
    return response.ok && (await response.json()).status === 'ok';
  } catch { return false; }
}

async function waitHealthy(base) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await healthy(base)) return;
    await pause();
  }
  throw new Error('n8n chua san sang tai ' + base);
}

function updateMediaUrl(workflow, url) {
  let changed = false;
  for (const node of workflow.nodes) {
    if (!node.parameters.jsCode?.startsWith('const publisherConfig = ')) continue;
    node.parameters.jsCode = node.parameters.jsCode.replace(/^const publisherConfig = (.+);\r?\n/, (line, json) => {
      const config = JSON.parse(json);
      if (config.publicBaseUrl === url) return line;
      config.publicBaseUrl = url;
      changed = true;
      return 'const publisherConfig = ' + JSON.stringify(config) + ';\n';
    });
  }
  return changed;
}

// Credentials stay inside the container and are removed immediately after reading.
const registerWebhook = `
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
(async () => {
  const workflow = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'))[0];
  const trigger = workflow.nodes.find(node => node.name === 'Telegram Trigger');
  const file = '/tmp/telegram-startup-credential-' + process.pid + '.json';
  try {
    execFileSync('n8n', ['export:credentials', '--id=' + trigger.credentials.telegramApi.id, '--decrypted', '--output=' + file], { stdio: 'pipe' });
    const [credential] = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.unlinkSync(file);
    const base = 'https://api.telegram.org/bot' + credential.data.accessToken + '/';
    const call = async (method, body) => {
      const response = await fetch(base + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!data.ok) throw new Error();
      return data.result;
    };
    const url = process.env.N8N_WEBHOOK_URL + 'webhook/' + trigger.webhookId + '/webhook';
    let info = await call('getWebhookInfo', {});
    if (info.url !== url) {
      const updates = [...trigger.parameters.updates];
      if (updates.includes('message') && !updates.includes('callback_query')) updates.push('callback_query');
      await call('setWebhook', {
        url, allowed_updates: updates, drop_pending_updates: false,
        secret_token: (workflow.id + '_' + trigger.id).replace(/[^a-zA-Z0-9_-]+/g, ''),
      });
      info = await call('getWebhookInfo', {});
    }
    if (info.url !== url) throw new Error();
    console.log('Telegram webhook OK. Tin dang cho: ' + info.pending_update_count);
  } finally { if (fs.existsSync(file)) fs.unlinkSync(file); }
})().catch(() => { console.error('Khong xac nhan duoc webhook Telegram. Kiem tra credential va ket noi mang.'); process.exitCode = 1; });
`;

async function main() {
  if (process.platform !== 'win32') throw new Error('Lenh nay danh cho Windows.');
  if (!fs.existsSync(envFile) || !fs.existsSync(tunnelExecutable)) {
    throw new Error('Can .env va tools/cloudflared.exe cua du an da thiet lap.');
  }
  fs.mkdirSync(temporaryDirectory, { recursive: true });
  console.log('Khoi dong n8n...');
  docker(['up', '-d', 'n8n', 'image-tools'], { stdio: 'inherit' });
  await waitHealthy('http://localhost:5678');

  const containerWorkflowFile = '/tmp/telegram-startup-workflow.json';
  docker(['exec', '-T', 'n8n', 'n8n', 'export:workflow', '--id=' + workflowId, '--output=' + containerWorkflowFile]);
  const exported = docker(['exec', '-T', 'n8n', 'cat', containerWorkflowFile]);
  const [workflow] = JSON.parse(exported);
  if (!workflow.active || workflow.versionId !== workflow.activeVersionId) {
    throw new Error('Workflow can o trang thai Published va khong co thay doi chua publish.');
  }

  let env = fs.readFileSync(envFile, 'utf8');
  let url = env.match(/^N8N_WEBHOOK_URL=(.+)/m)?.[1].trim().replace(/\/$/, '');
  let processId = fs.existsSync(tunnelPidFile) ? fs.readFileSync(tunnelPidFile, 'utf8').trim() : '';
  const existingTunnel = /^\d+$/.test(processId) && powershell(
    `$task = Get-CimInstance Win32_Process -Filter "ProcessId = ${processId}"; if ($task.ExecutablePath -eq ${quote(tunnelExecutable)} -and $task.CommandLine -like '*--url http://localhost:5678*') { 'yes' }`,
  ) === 'yes';

  if (!existingTunnel || !url || !await healthy(url)) {
    fs.writeFileSync(path.join(temporaryDirectory, 'telegram-startup-before.json'), exported);
    fs.writeFileSync(path.join(temporaryDirectory, 'telegram-startup-before.env'), env);
    if (existingTunnel) powershell(`Stop-Process -Id ${processId} -ErrorAction Stop`);
    console.log('Mo Cloudflare Tunnel...');
    processId = powershell(
      `$task = Start-Process -FilePath ${quote(tunnelExecutable)} -ArgumentList @('tunnel','--url','http://localhost:5678','--no-autoupdate') -WindowStyle Hidden -RedirectStandardError ${quote(tunnelLog)} -RedirectStandardOutput ${quote(path.join(temporaryDirectory, 'tunnel-startup-output.log'))} -PassThru; $task.Id`,
    );
    fs.writeFileSync(tunnelPidFile, processId);
    url = undefined;
    for (let attempt = 0; attempt < 60; attempt++) {
      url = fs.existsSync(tunnelLog) && fs.readFileSync(tunnelLog, 'utf8').match(/https:\/\/[a-z-]+\.trycloudflare\.com/)?.[0];
      if (url) break;
      await pause();
    }
    if (!url) throw new Error('Khong lay duoc URL tunnel. Xem temp/tunnel-startup.log.');
    await waitHealthy(url);
  } else {
    console.log('Dung lai tunnel dang chay.');
  }

  const changed = updateMediaUrl(workflow, url);
  if (changed) {
    fs.writeFileSync(path.join(temporaryDirectory, 'telegram-startup-before.json'), exported);
    workflow.versionId = crypto.randomUUID();
    docker(['exec', '-T', 'n8n', 'node', '-e', "require('fs').writeFileSync(process.argv[1],require('fs').readFileSync(0))", containerWorkflowFile], { input: JSON.stringify([workflow]) });
    docker(['exec', '-T', 'n8n', 'n8n', 'import:workflow', '--input=' + containerWorkflowFile]);
    docker(['exec', '-T', 'n8n', 'n8n', 'publish:workflow', '--id=' + workflowId]);
  }
  const nextEnv = /^N8N_WEBHOOK_URL=.+/m.test(env)
    ? env.replace(/^N8N_WEBHOOK_URL=.+/m, 'N8N_WEBHOOK_URL=' + url + '/')
    : env + '\nN8N_WEBHOOK_URL=' + url + '/\n';
  if (nextEnv !== env) fs.writeFileSync(envFile, nextEnv);
  for (const file of ['temp/telegram-publisher-config.json', 'workflows/telegram-publisher.json']) {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) continue;
    const content = fs.readFileSync(target, 'utf8');
    const data = JSON.parse(content);
    if (data.nodes ? updateMediaUrl(data, url) : data.publicBaseUrl !== url) {
      if (!data.nodes) data.publicBaseUrl = url;
      fs.writeFileSync(target, JSON.stringify(data, null, 2) + (content.endsWith('\n') ? '\n' : ''));
    }
  }
  if (changed || nextEnv !== env) {
    console.log('Ap dung URL moi...');
    docker(['up', '-d', '--force-recreate', 'n8n'], { stdio: 'inherit' });
    await waitHealthy('http://localhost:5678');
  }
  await waitHealthy(url);
  docker(['exec', '-T', 'n8n', 'node', '-e', registerWebhook, containerWorkflowFile], { stdio: 'inherit' });
  console.log('Kiem tra link media cua cac bai da xep lich tren Buffer...');
  docker(['cp', 'scripts/repair-buffer-media.cjs', 'n8n:/tmp/repair-buffer-media.cjs']);
  docker(['exec', '-T', 'n8n', 'node', '/tmp/repair-buffer-media.cjs', containerWorkflowFile], { stdio: 'inherit' });
  console.log('San sang. Mo http://localhost:5678 va gui /queue cho bot.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
