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
const sass = require("sass");
const _ = require("lodash");
const matter = require("gray-matter");
const marked = require("marked");

let data = {};
try {
  data = require("./toor-data");
} catch (err) {
  /* do nothing */
}

function formatDate(date, format) {
  return dayjs(date).format(format || "MMM DD YYYY");
}

const njk = nunjucks.configure("templates", {
  autoescape: true,
  watch: true,
});

njk.addGlobal("STATIC_URL", process.env.STATIC_URL || "");
njk.addGlobal("UGC_CDN", process.env.UGC_CDN || "");
njk.addGlobal("TODAY", new Date());
njk.addFilter("date", formatDate);
njk.addFilter("take", _.take);

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
  return njk.render("_layout.html", { __html: html, ...parsed.data });
}

function build(argv) {
  let filename = "";
  const templates = glob.sync("**/[^_]*.{html,xml,txt,md}", {
    cwd: "./templates",
  });
  templates.forEach((tmpl) => {
    const html = tmpl.endsWith(".md")
      ? renderMD("./templates/" + tmpl.replace(".html", ".md"))
      : njk.render(tmpl, data);
    filename = argv.outDir + "/" + tmpl.replace(".md", ".html");
    writeFileSyncRecursive(filename, html, { encoding: "utf-8" });
    console.log("Writing:", filename);
  });
  process.exit();
}

function init() {
  try {
    fs.mkdirSync("css");
    fs.mkdirSync("templates");
    fs.mkdirSync("templates/blog");
    fs.writeFileSync(
      "toor-data.js",
      `module.exports = {
    blogs: [{}],
  };`
    );
    fs.writeFileSync(
      "css/style.scss",
      `body{
  font-family:sans-serif;
}`
    );
    fs.writeFileSync(
      "templates/_layout.html",
      `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Document</title>
      <link rel='stylesheet' href='/css/style.css'/>
  </head>
  <body>
      {% block body %}{% endblock %}
  </body>
</html>`
    );
    fs.writeFileSync(
      "templates/index.html",
      `{% extends "_layout.html" %}
<h1>This is index, edit me in templates/index.html</h1>`
    );
    fs.writeFileSync(
      "templates/blog/hello.md",
      `---
title: Hello
slug: home
---
# Hello World
    `
    );
  } catch {
    console.error("Failed to initialize.. check if directrory is not empty");
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
  .command("init", "Intialize the template directory", (yargs) => {}, init)
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

      app.use(express.static("public"));
      app.use(morgan("short"));

      app.use("/*.css", (req, res) => {
        const cssPath = req.params[0];
        const scssPath = cssPath + ".scss";
        console.log("Serving scss %s at %s", cssPath, scssPath);

        const result = sass.compile(scssPath);
        res.type("text/css").send(result.css);
      });

      app.use((req, res, next) => {
        const base = req.path.substring(1) || "index.html";
        let safepath = base;
        if (/.*\/$/i.test(base)) {
          console.log("Serving index %s", req.path);
          safepath = base + "index.html";
        }

        if (fs.statSync("templates/" + safepath, { throwIfNoEntry: false })) {
          return res.render(safepath, data);
        }
        if (
          (fs.statSync("templates/" + safepath.replace(".html", ".md")),
          { throwIfNoEntry: false })
        ) {
          const html = renderMD(
            "templates/" + safepath.replace(".html", ".md")
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
