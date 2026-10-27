// Uses the workspace's existing Playwright install. Fixture state never touches the real board.
const { chromium, expect } = require('../../manufacturing-execution-admin/node_modules/@playwright/test');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const script = path.resolve(__dirname, '../dashboard.py');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'manu-dashboard-browser-'));
const errors = [];
const cli = (...args) => {
  const result = spawnSync('python', ['-B', '-X', 'utf8', script, '--root', temporary, ...args], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
};

(async () => {
  let browser;
  const server = spawn('python', ['-B', '-X', 'utf8', script, '--root', temporary, 'serve', '--port', '0']);
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
      server.once('error', reject);
      server.stdout.on('data', (data) => {
        const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      server.once('exit', (code) => reject(new Error(`Server exited: ${code}`)));
    });
    browser = await chromium.launch({channel: 'chrome', headless: true});
    const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    await expect(page.locator('#task-title')).toHaveText('Chưa khởi tạo nhiệm vụ');
    await expect(page.locator('.role-card')).toHaveCount(3);
    await expect(page.locator('#roles')).toContainText('Chưa báo cáo');
    fs.writeFileSync(path.join(temporary, 'sample.py'), 'print("source evidence")\n');
    cli('task', '--id', 'browser-test', '--title', 'Kiểm tra dashboard', '--goal', 'Theo dõi trạng thái thật');
    cli('update', '--task-id', 'browser-test', '--role', 'implement', '--status', 'working', '--action', '<img src=x onerror=alert(1)> là văn bản báo cáo', '--file', 'sample.py', '--check', 'PASS|Fixture check', '--artifact', 'https://example.com/demo');
    await expect(page.locator('#task-title')).toHaveText('Kiểm tra dashboard', {timeout: 10000});
    await expect(page.locator('#pass-count')).toHaveText('1');
    await expect(page.locator('#roles img')).toHaveCount(0);
    await page.getByRole('button', {name: 'File phụ trách', exact: true}).click();
    await page.getByRole('button', {name: 'sample.py', exact: true}).click();
    await expect(page.locator('#file-content')).toContainText('source evidence');
    await page.getByRole('button', {name: 'Đóng file', exact: true}).click();
    await page.getByRole('button', {name: 'Demo / liên kết', exact: true}).click();
    await expect(page.locator('#evidence-list a')).toHaveAttribute('href', 'https://example.com/demo');
    await page.getByRole('button', {name: 'Xem note ↓', exact: true}).click();
    await expect(page.locator('#note-content')).toBeVisible();
    await expect(page.locator('#note-content')).toContainText('Chưa có note');
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile must not overflow');
    cli('update', '--task-id', 'browser-test', '--role', 'implement', '--status', 'blocked', '--action', 'Chờ API', '--blocker', 'Thiếu API thử nghiệm');
    await expect(page.locator('#blocked-count')).toHaveText('1', {timeout: 10000});
    await expect(page.locator('#roles')).toContainText('Thiếu API thử nghiệm');
    await page.route('**/api/state', (route) => route.abort());
    await page.getByRole('button', {name: 'Làm mới ↻', exact: true}).click();
    await expect(page.locator('#error')).toBeVisible();
    await expect(page.locator('#connection')).toHaveText('Mất kết nối');
    assert.deepEqual(errors, []);
    console.log('PASS: empty state, live polling, safe text, source viewer, demo link, note, mobile, blocked state, disconnection.');
  } finally {
    if (browser) await browser.close();
    const exited = new Promise((resolve) => server.once('exit', resolve));
    if (server.exitCode === null) { server.kill(); await exited; }
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith('manu-dashboard-browser-'));
    fs.rmSync(temporary, {recursive: true, force: true});
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
