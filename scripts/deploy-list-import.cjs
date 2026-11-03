// Deploy only the list-import nodes and the worker that preserves confirmed times.
// Existing credentials, webhook IDs, configuration and other nodes are retained.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const workflowId = 'seKtuQgWny3K7y5m';
const docker = (args, options = {}) => execFileSync('docker', ['compose', ...args], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000, ...options });
const prefix = code => code.match(/^const publisherConfig = .*;\r?\n/)?.[0];

(async () => {
  const built = JSON.parse(fs.readFileSync(path.join(root, 'workflows/telegram-publisher.json'), 'utf8'));
  docker(['exec', '-T', 'n8n', 'n8n', 'export:workflow', '--id=' + workflowId, '--output=/tmp/list-import-before.json']);
  const before = docker(['exec', '-T', 'n8n', 'cat', '/tmp/list-import-before.json']);
  const [workflow] = JSON.parse(before);
  if (!workflow.active || workflow.versionId !== workflow.activeVersionId) throw new Error('Workflow must be published with no unpublished changes before deployment.');
  const configPrefix = prefix(workflow.nodes.find(node => node.name === 'Telegram Intake').parameters.jsCode);
  const downloadCredential = workflow.nodes.find(node => node.name === 'Download Crop Image').credentials;
  if (!configPrefix || !downloadCredential?.telegramApi) throw new Error('Live configuration or bounded download credential is missing.');
  fs.writeFileSync(path.join(root, 'temp/list-import-deploy-before.json'), before);
  for (const name of ['Telegram Intake', 'Handle Queue Command', 'Next Queue Work']) {
    const current = workflow.nodes.find(node => node.name === name);
    const replacement = built.nodes.find(node => node.name === name);
    if (!current || !replacement || !prefix(current.parameters.jsCode)) throw new Error('Cannot safely replace node: ' + name);
    current.parameters.jsCode = replacement.parameters.jsCode.replace(/^const publisherConfig = .*;\r?\n/, () => prefix(current.parameters.jsCode));
  }
  for (const name of ['Is Import Request', 'Download Import File', 'Store Import File']) {
    const replacement = structuredClone(built.nodes.find(node => node.name === name));
    if (!replacement) throw new Error('Build list-import workflow before deploying.');
    const existing = workflow.nodes.find(node => node.name === name);
    if (replacement.parameters.jsCode) replacement.parameters.jsCode = replacement.parameters.jsCode.replace(/^const publisherConfig = .*;\r?\n/, () => existing ? prefix(existing.parameters.jsCode) : configPrefix);
    if (name === 'Download Import File') replacement.credentials = structuredClone(downloadCredential);
    if (existing) Object.assign(existing, { parameters: replacement.parameters, ...(replacement.credentials ? { credentials: replacement.credentials } : {}) });
    else workflow.nodes.push(replacement);
  }
  for (const name of ['Telegram Reply', 'Queue Notification']) {
    const current = workflow.nodes.find(node => node.name === name);
    const replacement = built.nodes.find(node => node.name === name);
    if (!current || !replacement) throw new Error('Missing Telegram reply node: ' + name);
    current.type = replacement.type;
    current.typeVersion = replacement.typeVersion;
    current.parameters = structuredClone(replacement.parameters);
    current.credentials = { httpHeaderAuth: { id: 'telegramReplyGateway', name: 'Telegram Reply Gateway' } };
    current.retryOnFail = false;
  }
  for (const name of ['Telegram Intake', 'Is Import Request', 'Download Import File', 'Store Import File']) workflow.connections[name] = structuredClone(built.connections[name]);
  workflow.versionId = crypto.randomUUID();
  const after = JSON.stringify([workflow]);
  fs.writeFileSync(path.join(root, 'temp/list-import-deploy-after.json'), after);
  docker(['exec', '-T', 'n8n', 'node', '-e', "require('fs').writeFileSync('/tmp/list-import-deploy.json',require('fs').readFileSync(0))"], { input: after });
  const running = docker(['exec', '-T', 'n8n', 'node', '-e', "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/home/node/.n8n/database.sqlite',{readOnly:true});process.stdout.write(String(db.prepare(\"SELECT count(*) AS count FROM execution_entity WHERE status='running'\").get().count));"]);
  if (running.trim() !== '0') throw new Error('Active executions must finish before deploying. Prepared deployment is saved in temp/list-import-deploy-after.json.');
  docker(['exec', '-T', 'n8n', 'n8n', 'export:credentials', '--id=' + downloadCredential.telegramApi.id, '--decrypted', '--output=/tmp/list-import-telegram-private.json']);
  docker(['exec', '-T', 'n8n', 'node', '-e', "const fs=require('fs');const source=JSON.parse(fs.readFileSync('/tmp/list-import-telegram-private.json'))[0].data;fs.writeFileSync('/tmp/list-import-reply-credential.json',JSON.stringify([{id:'telegramReplyGateway',name:'Telegram Reply Gateway',type:'httpHeaderAuth',data:{name:'X-Telegram-Token',value:source.accessToken}}]),{mode:0o600});fs.unlinkSync('/tmp/list-import-telegram-private.json');"]);
  docker(['exec', '-T', 'n8n', 'n8n', 'import:credentials', '--input=/tmp/list-import-reply-credential.json']);
  docker(['exec', '-T', 'n8n', 'node', '-e', "require('fs').unlinkSync('/tmp/list-import-reply-credential.json')"]);
  docker(['exec', '-T', 'n8n', 'n8n', 'import:workflow', '--input=/tmp/list-import-deploy.json']);
  docker(['exec', '-T', 'n8n', 'n8n', 'publish:workflow', '--id=' + workflowId]);
  docker(['up', '-d', '--build', 'image-tools'], { stdio: 'inherit' });
  docker(['restart', 'n8n'], { stdio: 'inherit' });
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:5678/healthz', { signal: AbortSignal.timeout(2000) });
      if (response.ok) { console.log('Published /import and locked-schedule worker; n8n is healthy.'); return; }
    } catch { /* Wait for the restarted container. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Deployment published, but n8n health has not been confirmed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
