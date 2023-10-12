#!/usr/bin/env node

"use strict";
require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH });

const fs = require("fs");
const glob = require("glob");
const nunjucks = require("nunjucks");
const dayjs = require("dayjs");
const http = require("http");
const express = require("express");
const morgan = require("morgan");
const _ = require("lodash");
const matter = require("gray-matter");
const marked = require("marked");
const sass = require("sass");
const { resolve } = require("path");
const tmplfiles = require("./init");

const IS_DEV = process.env.NODE_ENV === "development";
const cwd = resolve(process.env.BASE || ".");
console.log(cwd);

let data = {};
if (
  fs.existsSync(`${cwd}/toor-data.js`) ||
  fs.existsSync(`${cwd}/toor-data.json`)
) {
  data = require(`${cwd}/toor-data`);
}

function formatDate(date, format) {
  return dayjs(date).format(format || "MMM DD YYYY");
}

const njk = nunjucks.configure(`${cwd}/templates`, {
  autoescape: true,
  watch: true,
});

njk.addGlobal("STATIC_URL", process.env.STATIC_URL || "");
njk.addGlobal("UGC_CDN", process.env.UGC_CDN || "");
njk.addGlobal("TODAY", new Date());
njk.addFilter("date", formatDate);
njk.addFilter("take", _.take);
njk.addFilter("vite", function viteInject(script) {
  const MANIFEST = require(process.env.MANIFEST || `${cwd}/manifest.json`);
  if (IS_DEV)
    return `<script async type="module" src="${process.env.STATIC_URL}/${script}"></script>`;
  const mf = MANIFEST[script];
  if (!mf) return "";
  return `${_.map(
    mf.css,
    (css) =>
      `<link rel="stylesheet" crossorigin="anonymous" href="${process.env.STATIC_URL}/${css}"/>`
  ).join(
    ""
  )}<script async type="module" crossorigin="anonymous" src="${process.env.STATIC_URL}/${mf.file
    }"></script>`;
})

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
      let folderPath = last ? last + "/" + folder : folder;
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);
      return folderPath;
    });

  fs.writeFileSync(filename, content, charset);
}

function renderMD(path) {
  const content = fs.readFileSync(path, "utf8");
  const parsed = matter(content);
  const html = marked.parse(parsed.content);
  return njk.render(parsed.data.template ?? "_layout.html", {
    __html: html,
    ...parsed.data,
  });
}

function build(argv) {
  let filename = "";
  const templates = glob.sync("**/[^_]*.{html,xml,txt,md}", {
    cwd: `${cwd}/templates`,
  });
  templates.forEach((tmpl) => {
    const html = tmpl.endsWith(".md")
      ? renderMD(`${cwd}/templates/` + tmpl.replace(".html", ".md"))
      : njk.render(tmpl, { data });
    filename = argv.outDir + "/" + tmpl.replace(".md", ".html");
    writeFileSyncRecursive(filename, html, { encoding: "utf-8" });
    console.log("Writing:", filename);
  });
  process.exit();
}

function init() {
  try {
    tmplfiles.forEach((f) => {
      if (f.dir) {
        fs.mkdirSync(f);
      } else {
        fs.writeFileSync(f.file, f.content);
      }
    });
  } catch {
    console.error("Failed to initialize.. check if directrory is not empty");
    process.exit();
  }
}

require("yargs")
  .scriptName("toor.js")
  .usage("$0 <cmd> [args]")
  .command(
    "$0",
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
  .command("init", "Intialize the template directory", () => { }, init)
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
    function (argv) {
      const app = express();
      njk.express(app);

      app.engine("html", njk.render);
      app.set("view engine", "html");

      app.use(express.static(cwd + "/public"));
      app.use(morgan("short"));

      app.use("/*.css", (req, res) => {
        const cssPath = req.params[0];
        const scssPath = `${cwd}/${cssPath}.scss`;
        console.log("Serving scss %s at %s", cssPath, scssPath);
        const css = sass.compile(scssPath, {
          sourceMap: "inline",
        });
        res.type("text/css").send(css.css);
      });

      app.use((req, res) => {
        const base = req.path.substring(1) || "index.html";
        let safepath = base;
        if (/.*\/$/i.test(base)) {
          console.log("Serving index %s", req.path);
          safepath = `index.html`;
        }

        if (fs.statSync(`${cwd}/templates/${safepath}`, {
          throwIfNoEntry: false
        })) {
          return res.render(safepath, { data });
        }
        const exists = fs.statSync(
          `${cwd}/templates/${safepath.replace(".html", ".md")}`,
          { throwIfNoEntry: false }
        );
        if (exists) {
          const html = renderMD(
            `${cwd}/templates/${safepath.replace(".html", ".md")}`
          );
          return res.send(html);
        }
        return res.sendStatus(404);
      });

      http
        .createServer(app)
        .on("listening", () => {
          console.log("Running on http://127.0.0.1:%s", argv.port);
        })
        .listen(argv.port);
    }
  )
  .help().argv;
