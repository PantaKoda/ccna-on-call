// electron-builder configuration for the desktop app.
//
//   npm run desktop:dist          installer for this OS in dist/ (what the release workflow builds)
//   npm run desktop:personal      the same, with your data packs inside, in dist/personal/ (never publish it)
//
// Public builds contain only what is in the repository. The data packs in data/
// (questions.js, notes.js) are personal content and go only into a personal
// build; on a public build, import them from File > Import in the app.

const { execFileSync } = require("node:child_process");

const personal = process.env.CCNA_PERSONAL === "1";

// The GitHub repository the updates come from: the one the workflow runs in, or
// this checkout's origin.
function repo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY.split("/");
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
    const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    if (m) return [m[1], m[2]];
  } catch { /* no git */ }
  throw new Error("cannot tell which GitHub repository updates come from (no GITHUB_REPOSITORY and no origin remote)");
}
const [owner, name] = repo();

module.exports = {
  appId: "app.ccna-on-call.desktop",
  productName: "CCNA On Call",
  artifactName: "CCNA-On-Call-${version}-${os}-${arch}.${ext}",
  directories: { output: personal ? "dist/personal" : "dist", buildResources: "desktop/build" },
  files: [
    "package.json",
    "index.html", "css/**", "js/**", "content/**",
    "data/none.js", "data/README.md",
    ...(personal ? ["data/questions.js", "data/notes.js"] : []),
    "desktop/main.mjs", "desktop/files.mjs", "desktop/preload.cjs",
  ],
  // per-user install: no administrator prompt, and updates install without one too
  win: { target: [{ target: "nsis", arch: ["x64"] }] },
  nsis: { oneClick: true, perMachine: false, deleteAppDataOnUninstall: false },
  // unsigned for now; the zip is what electron-updater reads on a Mac
  mac: { target: [{ target: "dmg", arch: ["arm64", "x64"] }, { target: "zip", arch: ["arm64", "x64"] }], category: "public.app-category.education", identity: null },
  linux: { target: [{ target: "AppImage", arch: ["x64"] }], category: "Education" },
  publish: [{ provider: "github", owner, repo: name, releaseType: "release" }],
};
