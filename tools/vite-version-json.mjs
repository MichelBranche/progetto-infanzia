import fs from "node:fs";
import path from "node:path";

export function branchefyVersionJson(repoRoot) {
  const pkgPath = path.join(repoRoot, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const version = String(pkg.version ?? "0.0.0");

  return {
    name: "branchefy-version-json",
    config() {
      return {
        define: {
          "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
        },
      };
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify(
          {
            version,
            essential: false,
            title: "Nuovo aggiornamento disponibile",
          },
          null,
          2,
        ),
      });
    },
  };
}
