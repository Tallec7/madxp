/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-direct-db-in-controllers",
      comment: "Controllers must use repositories — never import config/database directly",
      severity: "error",
      from: { path: "^src/controllers" },
      to: { path: "^src/config/database" },
    },
    {
      name: "no-circular",
      severity: "warn",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "info",
      from: { orphan: true, pathNot: ["^src/scripts/", "^src/types/", "\\.d\\.ts$", "\\.test\\.ts$"] },
      to: {},
    },
  ],

  options: {
    doNotFollow: {
      path: ["node_modules", "__tests__", "__mocks__", "\\.test\\.ts$", "\\.spec\\.ts$"],
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { exportsFields: ["exports"] },
    reporterOptions: {
      dot: {
        collapsePattern: "^node_modules/[^/]+",
        theme: {
          graph: { bgcolor: "#1e1e2e", rankdir: "LR" },
          node: { color: "#89b4fa", fontcolor: "#cdd6f4", fillcolor: "#313244", style: "filled,rounded", fontname: "monospace", fontsize: 10 },
          edge: { color: "#6c7086", arrowhead: "open" },
          modules: [
            { criteria: { source: "^src/controllers" }, attributes: { fillcolor: "#45475a", color: "#cba6f7" } },
            { criteria: { source: "^src/services" }, attributes: { fillcolor: "#45475a", color: "#a6e3a1" } },
            { criteria: { source: "^src/repositories" }, attributes: { fillcolor: "#45475a", color: "#fab387" } },
            { criteria: { source: "^src/middleware" }, attributes: { fillcolor: "#45475a", color: "#f9e2af" } },
            { criteria: { source: "^src/routes" }, attributes: { fillcolor: "#45475a", color: "#89dceb" } },
          ],
        },
      },
      archi: {
        collapsePattern: "^src/(?:controllers|services|repositories|middleware|routes|handlers|scripts|config|types|utils)[^/]*",
        theme: {
          graph: { bgcolor: "#1e1e2e", rankdir: "LR" },
          node: { color: "#89b4fa", fontcolor: "#cdd6f4", fillcolor: "#313244", style: "filled,rounded", fontname: "monospace" },
          edge: { color: "#6c7086", arrowhead: "open" },
        },
      },
    },
  },
};
