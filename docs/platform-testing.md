# Platform testing

Use Node 24, npm 11 and the root lockfile on every OS. Neovim 0.12.2 is the
minimum supported target; 0.12.6 is the second pinned acceptance version.
The [validation record](validation.md) distinguishes completed runs from targets.
Adding a matrix entry is not evidence that the platform works.

## Hosted checks

[Checks](../.github/workflows/checks.yml) runs the complete suite for each
combination of:

- Ubuntu 24.04, macOS 15 and Windows Server 2022.
- Neovim 0.12.2 and 0.12.6.
- Chromium and Firefox from locked Playwright 1.56.1.

Every job checks out into `plugin with spaces`, installs Node 24.12.0/npm 11.10.0,
runs `npm ci`, builds locally, installs its selected browser and runs the suite.
Jobs fail independently, with at most four running at once. No release is
published, and workflow permissions are read-only. The OS labels are explicit:
`ubuntu-latest` selected Ubuntu 26.04 in run `43882058739`, which Playwright
1.56.1 could not provision. Update the OS/browser versions together deliberately.

After a test run, the job uploads `test-results` for seven days. It contains the
environment/browser version, suite log, exit result and isolated Neovim fixture,
state, server logs, Neovim messages and stderr. Browser contexts/profiles are temporary; personal Neovim
configuration and browser profiles are not used. Diagnostics contain test-owned
document contents and local paths. Successful local runs normally remove their
temporary Neovim data; requesting a report deliberately retains it.

An earlier unexplained Firefox multi-preview timeout is documented in
[validation](validation.md). Keep its diagnostics and unique coverage if it
recurs; retries must not silently convert a failing run into a passing one.
An additional isolated macOS startup timeout is also recorded there. Hook
timeouts include Neovim diagnostics in the error, and retained session reports
write `nvim-diagnostics.json` before cleanup.

## Local native runs

These commands work in POSIX shells and PowerShell, without shell glob expansion
or POSIX environment assignment:

```sh
npm ci
npm run build
npx playwright install --with-deps chromium firefox
npm test -- --report-dir test-results/chromium
npm run test:firefox -- --report-dir test-results/firefox
```

The runner enumerates `.test.cjs` files and validates the requested browser. It
accepts `--browser chromium|firefox` and `--report-dir <path>`; unknown options
fail rather than running a different suite. Reports are ignored by Git.

To select a Neovim binary, set `NVIM` to its executable path. For example:

```sh
NVIM=/path/to/nvim npm test
```

In PowerShell:

```powershell
$env:NVIM = 'C:\tools\nvim\bin\nvim.exe'
npm test
Remove-Item Env:NVIM
```

The existing `MKDP_TEST_BROWSER=firefox` environment selection remains supported.
`MKDP_TEST_BROWSER_EXECUTABLE` overrides the selected Playwright browser binary;
it must be compatible with Playwright. The optional system Firefox/Marionette
smoke in [validation](validation.md#actual-personal-firefox-launcher) is a separate
launcher check. Headless suite success does not validate desktop focus or the
default OS browser launcher.

## Isolated Linux container

The [test Dockerfile](../test/platform/linux.Dockerfile) pins the official
Playwright Ubuntu 24.04 image by digest and verifies fixed Node 24.12.0 and
Neovim 0.12.2 download hashes for Linux ARM64 and x86-64. It installs npm 11.10.0
and the plugin's locked dependencies, then builds from source inside a directory
with spaces. Host dependencies, generated output, Git metadata and test reports
are excluded. The image is for tests, not a plugin installation or executable
release. Runtime inputs are pinned; image byte reproducibility is not claimed.

```sh
docker build -f test/platform/linux.Dockerfile -t markdown-preview-platform-check:local .
docker run --rm --shm-size=1g markdown-preview-platform-check:local
docker run --rm --shm-size=1g markdown-preview-platform-check:local \
  npm run test:firefox -- --report-dir /checks/results/firefox
```

For retained host reports, create a directory and bind it to `/checks/results`.
Use a test-owned directory only; the container runs as root. The default command
writes `/checks/results/chromium`, and the second writes `/checks/results/firefox`.
No host Neovim state, browser profile, Docker socket or service ports are mounted.
Testing this image on ARM64 does not establish an x86-64 result.

## WSL and desktop acceptance

WSL is a separate target from native Windows and ordinary Linux. In an Ubuntu
24.04 WSL distro, keep the checkout and Node/Neovim installations in the Linux
filesystem and run the local commands above. `playwright install --with-deps`
may need sudo for system libraries. Headless Linux browsers do not require WSLg.
The suite then checks Linux-side rendering, navigation and lifecycle only.

A WSL result also needs a desktop check from the actual Windows browser, because
the default opener hands off through `cmd.exe`. Use an isolated browser profile
through `g:mkdp_browserfunc`, forwarding the URL as a separate argument and
converting any Linux profile path with `wslpath -w`. Verify:

1. A preview URL is reachable from Windows and the configured hook launches it.
2. Encoded/reference links and native new-tab/window actions open the right
   document without moving the editor; heading fragments scroll to their target.
3. Unsaved edits reach every preview of that buffer; another buffer stays open
   when the first buffer is stopped or deleted.
4. Manually closed previews reopen, and Neovim shutdown closes its previews where
   browser policy permits script-initiated closure.

Record the Windows/WSL version, distro/kernel, Node/npm/Neovim/browser versions,
networking mode and exact launch hook with the result. Container Linux runs and
native Windows CI do not substitute for this interoperability check. No WSL
desktop result is claimed yet.
