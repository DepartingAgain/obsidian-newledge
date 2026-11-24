const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

// 使用真实插件实现，替换 Obsidian 宿主；不发网络请求或写入真实 vault。
const bundle = buildSync({
  entryPoints: ['src/main.ts'], bundle: true, platform: 'browser',
  format: 'cjs', external: ['obsidian'], write: false,
}).outputFiles[0].text;

function createPlugin(saved = {}) {
  const callbacks = [];
  class Plugin {
    app = { workspace: { onLayoutReady: callback => { this.layoutReady = callback; } } };
    async loadData() { return saved; }
    async saveData() {}
    addSettingTab() {}
    registerInterval() {}
  }
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports,
    require: name => {
      assert.equal(name, 'obsidian');
      return { Plugin, PluginSettingTab: class {}, normalizePath: value => value };
    },
    window: { setInterval: (callback, delay) => {
      assert.equal(delay, 60000);
      callbacks.push(callback);
      return callbacks.length;
    } },
    Date, console, setTimeout,
  });
  return { plugin: new module.exports.default(), callbacks };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('首次未绑定启动，绑定后无需重启即可定时同步', async () => {
  const { plugin, callbacks } = createPlugin();
  plugin.checkAccount = async () => ({ valid: false });
  let syncCount = 0;
  plugin.sync = async () => { syncCount++; };
  await plugin.onload();
  plugin.layoutReady();
  await flush();
  assert.equal(callbacks.length, 1);
  callbacks[0]();
  await flush();
  assert.equal(syncCount, 0);
  // 模拟扫码完成并完成首次同步后的状态。
  plugin.settings.token = 'bound-token';
  plugin.settings.lastSyncTime = new Date(Date.now() - 61 * 60000);
  callbacks[0]();
  await flush();
  assert.equal(syncCount, 1);
  plugin.settings.syncing = true;
  callbacks[0]();
  await flush();
  assert.equal(syncCount, 1);
  plugin.settings.syncing = false;
  plugin.onunload();
  callbacks[0]();
  await flush();
  assert.equal(syncCount, 1);
});

test('重启读取 JSON 日期后，不依赖启动同步即可检查到期时间', async () => {
  const saved = JSON.parse(JSON.stringify({
    token: 'bound-token', lastSyncTime: new Date(Date.now() - 61 * 60000),
  }));
  const { plugin } = createPlugin(saved);
  await plugin.loadSettings();
  assert.ok(plugin.settings.lastSyncTime instanceof Date);
  let syncCount = 0;
  plugin.sync = async () => { syncCount++; };
  await plugin._timingSync();
  assert.equal(syncCount, 1);
  plugin.settings.lastSyncTime = new Date();
  await plugin._timingSync();
  assert.equal(syncCount, 1);
});

test('无效或缺失的同步时间安全恢复为 null', async () => {
  for (const lastSyncTime of [null, undefined, 'invalid-date']) {
    const { plugin } = createPlugin({ lastSyncTime });
    await plugin.loadSettings();
    assert.equal(plugin.settings.lastSyncTime, null);
  }
});
