#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const TOKEN_SNIPPET_PATH = path.join(ROOT, 'snippets', 'customer-storefront-config.liquid');
const API_URL_SNIPPET_PATH = path.join(ROOT, 'snippets', 'storefront-api-url.liquid');

const DEFAULT_API_URL = '/api/2024-10/graphql.json';

function loadEnv(filePath) {
  const env = {};

  if (!fs.existsSync(filePath)) {
    console.error('Missing .env file. Copy .env.example to .env and add your tokens.');
    process.exit(1);
  }

  fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const index = trimmed.indexOf('=');
      if (index === -1) return;

      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      env[key] = value;
    });

  return env;
}

function writeSnippet(filePath, comment, outputDescription, value) {
  const snippet = `{%- comment -%}
  Auto-generated from .env by scripts/sync-env.js
  Run: npm run sync-env
  ${outputDescription}
{%- endcomment -%}
${value}`;

  fs.writeFileSync(filePath, snippet, 'utf8');
}

const env = loadEnv(ENV_PATH);
const token = env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
const apiUrl = env.SHOPIFY_STOREFRONT_API_URL || DEFAULT_API_URL;

if (!token) {
  console.error('SHOPIFY_STOREFRONT_ACCESS_TOKEN is empty in .env');
  process.exit(1);
}

writeSnippet(
  TOKEN_SNIPPET_PATH,
  'token',
  'Outputs the raw Storefront API token. Consumers capture it:\n  {% capture storefront_access_token %}{% render \'customer-storefront-config\' %}{% endcapture %}',
  token
);

writeSnippet(
  API_URL_SNIPPET_PATH,
  'api url',
  'Outputs the Storefront API URL. Consumers capture it:\n  {% capture storefront_api_url %}{% render \'storefront-api-url\' %}{% endcapture %}',
  apiUrl
);

console.log('Updated snippets/customer-storefront-config.liquid from .env');
console.log('Updated snippets/storefront-api-url.liquid from .env');

if (env.SHOPIFY_API_KEY || env.SHOPIFY_API_SECRET) {
  console.log('Admin API keys loaded in .env (not written to theme — server-side only).');
}
