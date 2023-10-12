#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expressHandler = void 0;
const dayjs_1 = __importDefault(require("dayjs"));
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const glob_1 = __importDefault(require("glob"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const http_1 = __importDefault(require("http"));
const lodash_1 = __importDefault(require("lodash"));
const marked_1 = __importDefault(require("marked"));
const morgan_1 = __importDefault(require("morgan"));
const nunjucks_1 = __importDefault(require("nunjucks"));
const path_1 = require("path");
const IS_DEV = process.env.NODE_ENV === "development";
const cwd = (0, path_1.resolve)(process.env.TOOR_BASE || ".");
console.log(cwd);
let data = {};
if (fs_1.default.existsSync(`${cwd}/toor-data.js`) ||
    fs_1.default.existsSync(`${cwd}/toor-data.json`)) {
    data = require(`${cwd}/toor-data`);
}
function formatDate(date, format) {
    return (0, dayjs_1.default)(date).format(format || "MMM DD YYYY");
}
const njk = nunjucks_1.default.configure(`${cwd}/templates`, {
    autoescape: true,
    watch: true,
});
njk.addGlobal("STATIC_URL", process.env.STATIC_URL || "");
njk.addGlobal("UGC_CDN", process.env.UGC_CDN || "");
njk.addGlobal("TODAY", new Date());
njk.addFilter("date", formatDate);
njk.addFilter("take", lodash_1.default.take);
njk.addFilter("vite", function viteInject(script) {
    if (IS_DEV)
        return `<script async type="module" src="${process.env.STATIC_URL}/${script}"></script>`;
    const MANIFEST = require(process.env.MANIFEST || `${cwd}/manifest.json`);
    const mf = MANIFEST[script];
    if (!mf)
        return "";
    return `${lodash_1.default.map(mf.css, (css) => `<link rel="stylesheet" crossorigin="anonymous" href="${process.env.STATIC_URL}/${css}"/>`).join("")}<script async type="module" crossorigin="anonymous" src="${process.env.STATIC_URL}/${mf.file}"></script>`;
});
Object.keys(process.env).forEach((k) => {
    if (k.startsWith("GLOBAL_")) {
        console.log(k.replace("GLOBAL_", ""), process.env[k]);
        njk.addGlobal(k.replace("GLOBAL_", ""), process.env[k]);
    }
});
function writeFileSyncRecursive(filename, content, charset) {
    filename
        .split("/")
        .slice(0, -1)
        .reduce((last, folder) => {
        const folderPath = last ? last + "/" + folder : folder;
        if (!fs_1.default.existsSync(folderPath))
            fs_1.default.mkdirSync(folderPath);
        return folderPath;
    });
    fs_1.default.writeFileSync(filename, content, charset);
}
function renderMD(path) {
    var _a;
    const content = fs_1.default.readFileSync(path, "utf8");
    const parsed = (0, gray_matter_1.default)(content);
    const html = marked_1.default.parse(parsed.content);
    return njk.render((_a = parsed.data.template) !== null && _a !== void 0 ? _a : "_layout.html", Object.assign({ __html: html }, parsed.data));
}
function build(argv) {
    let filename = "";
    const templates = glob_1.default.sync("**/[^_]*.{html,xml,txt,md}", {
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
function expressHandler(req, res, next) {
    const base = req.path.substring(1) || "index.html";
    let safepath = base;
    if (/.*\/$/i.test(base)) {
        console.log("Serving index %s", req.path);
        safepath += `index.html`;
    }
    if (fs_1.default.statSync(`${cwd}/templates/${safepath}`, {
        throwIfNoEntry: false,
    })) {
        return res.send(njk.render(safepath, { data }));
    }
    const exists = fs_1.default.statSync(`${cwd}/templates/${safepath.replace(".html", ".md")}`, { throwIfNoEntry: false });
    if (exists) {
        const html = renderMD(`${cwd}/templates/${safepath.replace(".html", ".md")}`);
        return res.send(html);
    }
    return next();
}
exports.expressHandler = expressHandler;
if (require.main === module) {
    require("yargs")
        .scriptName("toor.js")
        .usage("$0 <cmd> [args]")
        .command("$0", "Build the project", (yargs) => {
        yargs.positional("outDir", {
            type: "string",
            default: "./dist",
            describe: "Output directory",
        });
    }, build)
        .command("serve [port]", "Serves the dev site!", (yargs) => {
        yargs.positional("port", {
            type: "integer",
            default: "5050",
            describe: "the port to run webserver on",
        });
    }, function (argv) {
        const app = (0, express_1.default)();
        njk.express(app);
        app.engine("html", njk.render);
        app.set("view engine", "html");
        app.use(express_1.default.static(cwd + "/public"));
        app.use((0, morgan_1.default)("short"));
        app.use(expressHandler);
        http_1.default
            .createServer(app)
            .on("listening", () => {
            console.log("Running on http://127.0.0.1:%s", argv.port);
        })
            .listen(argv.port);
    })
        .help().argv;
}
//# sourceMappingURL=toor.js.map
