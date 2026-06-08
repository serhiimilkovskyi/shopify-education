#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const SNIPPET_PATH = path.join(ROOT, 'snippets', 'customer-storefront-config.liquid');

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

const token = loadEnv(ENV_PATH).SHOPIFY_STOREFRONT_ACCESS_TOKEN;

if (!token) {
  console.error('SHOPIFY_STOREFRONT_ACCESS_TOKEN is empty in .env');
  process.exit(1);
}

const snippet = `{%- comment -%}
  Auto-generated from .env by scripts/sync-env.js
  Run: npm run sync-env
  Outputs the raw Storefront API token. Consumers capture it:
  {% capture storefront_access_token %}{% render 'customer-storefront-config' %}{% endcapture %}
{%- endcomment -%}
${token}`;

fs.writeFileSync(SNIPPET_PATH, snippet, 'utf8');
console.log('Updated snippets/customer-storefront-config.liquid from .env');

const env = loadEnv(ENV_PATH);
if (env.SHOPIFY_API_KEY || env.SHOPIFY_API_SECRET) {
  console.log('Admin API keys loaded in .env (not written to theme — server-side only).');
}
