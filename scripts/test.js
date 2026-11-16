// Enumerate files ourselves so Windows and POSIX shells run the same suite.
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
let browser = process.env.MKDP_TEST_BROWSER || 'chromium'
let reportDir
const args = process.argv.slice(2)
while (args.length) {
  const option = args.shift()
  const value = args.shift()
  if (!value) throw new Error('Missing value for ' + option)
  if (option === '--browser') browser = value
  else if (option === '--report-dir') reportDir = path.resolve(value)
  else throw new Error('Unknown test option: ' + option)
}
if (!['chromium', 'firefox'].includes(browser))
  throw new Error('Choose --browser chromium or --browser firefox.')

const env = { ...process.env, MKDP_TEST_BROWSER: browser }
if (reportDir) {
  fs.mkdirSync(reportDir, { recursive: true })
  env.MKDP_TEST_DATA_DIR = path.join(reportDir, 'sessions')
  env.MKDP_KEEP_TEST_DATA = '1'
}
const nvim = spawnSync(env.NVIM || 'nvim', ['--version'], { encoding: 'utf8' })
if (nvim.error || nvim.status !== 0)
  throw new Error('Cannot run Neovim: ' + (nvim.error?.message || nvim.stderr))
const playwright = require('playwright')
const executable =
  env.MKDP_TEST_BROWSER_EXECUTABLE || playwright[browser].executablePath()
const environment = {
  node: process.version,
  npm: process.env.npm_config_user_agent || 'not invoked through npm',
  platform: process.platform,
  release: os.release(),
  arch: process.arch,
  neovim: nvim.stdout.trim(),
  playwright: require('playwright/package.json').version,
  browser,
  browserExecutable: executable
}
async function run() {
  const probe = await playwright[browser].launch({
    headless: true,
    executablePath: executable
  })
  try {
    environment.browserVersion = probe.version()
  } finally {
    await probe.close()
  }
  console.log(JSON.stringify(environment, null, 2))
  if (reportDir)
    fs.writeFileSync(
      path.join(reportDir, 'environment.json'),
      JSON.stringify(environment, null, 2) + '\n'
    )
  const tests = fs
    .readdirSync(path.join(root, 'test'))
    .filter((name) => name.endsWith('.test.cjs'))
    .sort()
    .map((name) => path.join(root, 'test', name))
  const child = spawn(
    process.execPath,
    ['--test', '--test-concurrency=1', ...tests],
    {
      cwd: root,
      env,
      stdio: ['inherit', 'pipe', 'pipe']
    }
  )
  const log =
    reportDir && fs.createWriteStream(path.join(reportDir, 'suite.log'))
  child.stdout.on('data', (data) => {
    process.stdout.write(data)
    if (log) log.write(data)
  })
  child.stderr.on('data', (data) => {
    process.stderr.write(data)
    if (log) log.write(data)
  })
  child.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })
  child.on('close', (code, signal) => {
    if (log) log.end()
    process.exitCode = code || (signal ? 1 : process.exitCode || 0)
    if (reportDir)
      fs.writeFileSync(
        path.join(reportDir, 'result.json'),
        JSON.stringify({ exitCode: process.exitCode, signal }, null, 2) + '\n'
      )
  })
}
run().catch((error) => {
  console.error(error)
  process.exitCode = 1
  if (reportDir) {
    fs.writeFileSync(
      path.join(reportDir, 'bootstrap-error.log'),
      String(error.stack || error) + '\n'
    )
    fs.writeFileSync(
      path.join(reportDir, 'result.json'),
      JSON.stringify({ exitCode: 1, phase: 'bootstrap' }, null, 2) + '\n'
    )
  }
})
