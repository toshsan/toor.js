#!/usr/bin/env node

import dayjs from "dayjs";
import express from "express";
import fs from "fs";
import * as glob from "glob";
import matter from "gray-matter";
import http from "http";
import _ from "lodash";
import { marked } from "marked";
import morgan from "morgan";
import nunjucks from "nunjucks";
import { resolve } from "path";

const IS_DEV = process.env.NODE_ENV === "development";
const cwd = resolve(process.env.TOOR_BASE || ".");

let data = {};
if (
    fs.existsSync(`${cwd}/.toor/data.js`) ||
    fs.existsSync(`${cwd}/.toor/data.json`)
) {
    data = require(`${cwd}/.toor/data`);
}

function formatDate(date, format) {
    return dayjs(date).format(format || "MMM DD YYYY");
}

const njk = nunjucks.configure(cwd, {
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
        return `<script async type="module" src="${process.env.STATIC_URL}/${script}"></script>`;
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const MANIFEST = require(process.env.MANIFEST || `${cwd}/manifest.json`);
    const mf = MANIFEST[script];
    if (!mf) return "";
    return `${_.map(
        mf.css,
        (css) =>
            `<link rel="stylesheet" crossorigin="anonymous" href="${process.env.STATIC_URL}/${css}"/>`
    ).join("")}<script async type="module" crossorigin="anonymous" src="${process.env.STATIC_URL
        }/${mf.file}"></script>`;
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
    return njk.render(parsed.data.template ?? "_layout.html", {
        __html: html,
        ...parsed.data,
    });
}

function build(argv) {
    let filename = "";
    const templates = glob.sync("**/[^_]*.{html,xml,txt,md}", {
        dot: false,
        ignore: ["public/*", ".toor/*"],
        cwd,
    });
    templates.forEach((tmpl) => {
        const html = tmpl.endsWith(".md")
            ? renderMD(`${cwd}/` + tmpl.replace(".html", ".md"))
            : njk.render(tmpl, { data });
        filename = argv.outDir + "/" + tmpl.replace(".md", ".html");
        writeFileSyncRecursive(filename, html, { encoding: "utf-8" });
        console.log("Writing:", filename);
    });
    process.exit();
}

export function useToorMiddleware(req, res, next) {
    const base = req.path.substring(1) || "index.html";
    let safepath = base;
    if (/.*\/$/i.test(base)) {
        console.log("Serving index %s", req.path);
        safepath += "index.html";
    }

    if (fs.statSync(`${cwd}/${safepath}`, { throwIfNoEntry: false })) {
        return res.send(njk.render(safepath, { data }));
    }
    if (fs.statSync(`${cwd}/${safepath}.html`, { throwIfNoEntry: false })) {
        return res.send(njk.render(safepath + ".html", { data }));
    }
    if (fs.statSync(`${cwd}/${safepath}.md`, { throwIfNoEntry: false })) {
        const html = renderMD(`${cwd}/${safepath}.md`);
        return res.send(html);
    }
    return next();
}


import("yargs").then(({ default: yargs }) => {
    yargs.scriptName("toor.js")
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
            function (argv) {
                const app = express();
                njk.express(app);

                app.engine("html", njk.render);
                app.set("view engine", "html");

                app.use(express.static(cwd + "/public"));
                app.use(morgan("short"));

                app.use(useToorMiddleware);

                http
                    .createServer(app)
                    .on("listening", () => {
                        console.log("Running on http://127.0.0.1:%s", argv.port);
                    })
                    .listen(argv.port);
            }
        )
        .help().argv;
})