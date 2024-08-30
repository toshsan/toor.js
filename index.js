#!/usr/bin/env node

const dayjs = require("dayjs");
const express = require("express");
const fs = require("fs");
const glob = require("glob");
const matter = require("gray-matter");
const http = require("http");
const _ = require("lodash");
const { marked } = require("marked");
const morgan = require("morgan");
const nunjucks = require("nunjucks");
const { resolve } = require("path");

const IS_DEV = process.env.NODE_ENV === "development";
const tmplDir = resolve(process.env.TOOR_BASE || "templates/");

let data = {};
if (fs.existsSync(`.toor/data.js`) || fs.existsSync(`.toor/data.json`)) {
  data = JSON.parse(fs.readFileSync(`.toor/data`, "ro"));
}

function formatDate(date, format) {
  return dayjs(date).format(format || "MMM DD YYYY");
}

const njk = nunjucks.configure(tmplDir, {
  autoescape: true,
  watch: true,
});

njk.addGlobal("STATIC_URL", process.env.STATIC_URL || "");
njk.addGlobal("UGC_CDN", process.env.UGC_CDN || "");
njk.addGlobal("TODAY", new Date());
njk.addFilter("date", formatDate);
njk.addFilter("take", _.take);
njk.addFilter("vite", function viteInject(script) {
  if (IS_DEV) {
    return `<script async type="module" src="${
      process.env.STATIC_URL || ""
    }/${script}"></script>`;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const MANIFEST = JSON.parse(
    fs.readFileSync(process.env.MANIFEST || `./dist/.vite/manifest.json`)
  );
  const mf = MANIFEST[script];
  if (!mf) return "";
  return `${_.map(
    mf.css,
    (css) =>
      `<link rel="stylesheet" crossorigin="anonymous" href="${
        process.env.STATIC_URL || ""
      }/${css}"/>`
  ).join(
    ""
  )}<script async type="module" crossorigin="anonymous" src="${process.env.STATIC_URL || ""}/${mf.file}"></script>`;
});

Object.keys(process.env).forEach((k) => {
  if (k.startsWith("GLOBAL_")) {
    console.log(k.replace("GLOBAL_", ""), process.env[k]);
    njk.addGlobal(k.replace("GLOBAL_", ""), process.env[k]);
  }
});

// create folder path if not exists
function writeFileSyncRecursive(filename, content, charset) {
  filename
    .split("/")
    .slice(0, -1)
    .reduce((last, folder) => {
      const folderPath = last ? last + "/" + folder : folder;
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);
      return folderPath;
    });

  fs.writeFileSync(filename, content, charset);
}

function renderMD(path) {
  const content = fs.readFileSync(path, "utf8");
  const parsed = matter(content);
  const html = marked.parse(parsed.content);
  return njk.render(parsed.data.template ?? "_theme/layout.html", {
    __html: html,
    ...parsed.data,
  });
}

function build(argv) {
  let filename = "";
  const templates = glob.sync("**/[^_]*.{html,xml,txt,md}", {
    dot: false,
    ignore: ["public/*", ".toor/*", "node_modules/*", "_*", "_*/**/*"],
    cwd: tmplDir,
  });
  templates.forEach((tmpl) => {
    const html = tmpl.endsWith(".md")
      ? renderMD(`${tmplDir}/` + tmpl.replace(".html", ".md"))
      : njk.render(tmpl, { data });
    filename = argv.outDir + "/" + tmpl.replace(".md", ".html");
    writeFileSyncRecursive(filename, html, { encoding: "utf-8" });
    console.log("Writing:", filename);
  });
  process.exit();
}

function useToorMiddleware(req, res, next) {
  const base = req.path.substring(1) || "index.html";
  let safepath = base;
  if (/.*\/$/i.test(base)) {
    console.log("Serving index %s", req.path);
    safepath += "index";
  }

  if (fs.statSync(`${tmplDir}/${safepath}`, { throwIfNoEntry: false })) {
    return res.send(njk.render(safepath, { data }));
  }
  if (fs.statSync(`${tmplDir}/${safepath}.html`, { throwIfNoEntry: false })) {
    return res.send(njk.render(safepath + ".html", { data }));
  }
  if (fs.statSync(`${tmplDir}/${safepath}.md`, { throwIfNoEntry: false })) {
    const html = renderMD(`${tmplDir}/${safepath}.md`);
    return res.send(html);
  }
  return next();
}

module.exports.useToorMiddleware = useToorMiddleware;

function main() {
  const yargs = require("yargs/yargs");
  const { hideBin } = require("yargs/helpers");
  yargs(hideBin(process.argv))
    .usage("$0 <cmd> [args]")
    .command(
      "build [outdir]",
      "Build the project",
      (yargs) => {
        yargs.positional("outDir", {
          type: "string",
          default: "./dist",
          describe: "Output directory",
        });
      },
      build
    )
    .command(
      "serve [port]",
      "Serves the dev site!",
      (yargs) => {
        yargs.positional("port", {
          type: "integer",
          default: "5050",
          describe: "the port to run webserver on",
        });
      },
      async function (argv) {
        const app = express();
        njk.express(app);

        app.engine("html", njk.render);
        app.set("view engine", "html");

        app.use(express.static("public"));
        app.use(morgan("short"));

        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "custom",
        });

        app.use(useToorMiddleware);
        app.use(vite.middlewares);

        http
          .createServer(app)
          .on("listening", () => {
            console.log("Running on http://127.0.0.1:%s", argv.port);
          })
          .listen(argv.port);
      }
    )
    .help().argv;
}

main();
