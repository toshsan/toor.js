module.exports = [
  { dir: "css" },
  { dir: "templates" },
  { dir: "templates/theme" },
  { dir: "templates/blog" },
  {
    file: "toor-data.js",
    content: `module.exports = {
    blogs: [{}],
  };`,
  },
  {
    file: "css/style.scss",
    content: `body{
  font-family:sans-serif;
}`,
  },
  {
    file: "templates/_theme/layout.html",
    content: `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>{{ title }}</title>
      <link rel='stylesheet' href='/css/style.css'/>
  </head>
  <body>
      {% block body %}{{ __html | safe }}{% endblock %}
  </body>
</html>`,
  },
  {
    file: "templates/index.html",
    content: `{% extends "_layout.html" %}
{% set title = 'Welcome' %}
{% block body %}
  <h1>This is index, edit me in templates/index.html</h1>
  <a href="/blog/hello.html">Blog / hello</a>
{% endblock %}
      `,
  },
  {
    file: "templates/blog/hello.md",
    content: `---
title: Hello
---
# Hello World
this page in from templates/blog/hello.md 

[home](/)`,
  },
];
