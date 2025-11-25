// ===================== CONFIG =====================
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const csvParse = require("papaparse");

// Load environment variables
const SHOP_DOMAIN = process.env.SHOP_DOMAIN || "london-store-napoli.myshopify.com";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const API_VERSION = process.env.API_VERSION || "2025-10";

// Validate required environment variables
if (!ADMIN_TOKEN) {
  console.error("❌ ERROR: ADMIN_TOKEN environment variable is required!");
  console.error("💡 Create a .env file with: ADMIN_TOKEN=your_token_here");
  process.exit(1);
}

const CSV_FILE = "./size_chart.csv"; 

// ===================== CSV LOAD =====================
console.log("📄 Loading CSV…");

const csvRaw = fs.readFileSync(CSV_FILE, "utf8");
const parsed = csvParse.parse(csvRaw, { header: true });

const sizeChart = parsed.data.filter(r => r.Brand);
console.log("📦 CSV rows loaded:", sizeChart.length);

// ===================== HELPERS =====================
function normalize(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

function extractNumericVariantId(gid) {
  if (!gid) return null;
  const match = gid.match(/\/ProductVariant\/(\d+)/);
  return match ? match[1] : null;
}

function getGenderFromTags(tags) {
  const lower = tags.map(t => t.toLowerCase());
  if (lower.includes("uomo") || lower.includes("man")) return "UOMO";
  if (lower.includes("donna") || lower.includes("woman")) return "DONNA";
  return null;
}

// ===================== FIND SIZE ROW =====================
function findSizeRow(brand, gender, sizeNumeric) {
  console.log("🔍 findSizeRow brand=", brand, "gender=", gender, "size=", sizeNumeric);

  for (const row of sizeChart) {
    if (normalize(row.Brand) !== normalize(brand)) continue;

    const scale = row[gender] || "US"; // UOMO or DONNA contains scale: US/UK/EUR

    const rowScale = scale.toUpperCase();
    const rowSize =
      row[rowScale] && String(row[rowScale]).trim() !== ""
        ? parseFloat(row[rowScale])
        : null;

    if (!rowSize) continue;

    console.log(
      "  Row brand=",
      row.Brand,
      "scale=",
      rowScale,
      "rowSize=",
      row[rowScale]
    );

    if (Number(rowSize) === Number(sizeNumeric)) {
      console.log("✅ MATCH FOUND:", row);

      return {
        scale: rowScale,
        us: row.US,
        usw: row.USW,
        uk: row.UK,
        eur: row.EUR,
        cm: row.CM
      };
    }
  }

  console.log("❌ No match found in CSV!");
  return null;
}

// ===================== GET METAFIELDS =====================
async function getVariantMetafields(variantId) {
  const url = `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/variants/${variantId}/metafields.json`;

  console.log("📥 GET variant metafields:", url);

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": ADMIN_TOKEN,
      Accept: "application/json"
    }
  });

  const text = await resp.text();
  console.log("📥 GET metafields response:", resp.status, text);

  try {
    const json = JSON.parse(text);
    return json.metafields || [];
  } catch (e) {
    console.log("❌ Error parsing metafields JSON:", e);
    return [];
  }
}

// ===================== CREATE / UPDATE METAFIELDS =====================
async function updateVariantMetafields(variantGid, mapping) {
  const variantId = extractNumericVariantId(variantGid);
  if (!variantId) {
    console.log("❌ Could not extract numeric id:", variantGid);
    return;
  }

  console.log("📝 Updating metafields for variant", variantId, mapping);

  const existing = await getVariantMetafields(variantId);

  const desired = [
    { key: "us_size", value: mapping.us },
    { key: "usw_size", value: mapping.usw },
    { key: "uk_size", value: mapping.uk },
    { key: "eur_size", value: mapping.eur },
    { key: "cm_size", value: mapping.cm }
  ];

  for (const d of desired) {
    if (!d.value) {
      console.log(`↷ Skip ${d.key} (empty value)`);
      continue;
    }

    const current = existing.find(
      mf => mf.key === d.key && mf.namespace === "custom"
    );

    if (!current) {
      console.log(`➕ Creating metafield ${d.key} for variant ${variantId}`);

      const createUrl = `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/variants/${variantId}/metafields.json`;

      const body = {
        metafield: {
          namespace: "custom",
          key: d.key,
          type: "single_line_text_field",
          value: String(d.value)
        }
      };

      const resp = await fetch(createUrl, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": ADMIN_TOKEN,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(body)
      });

      console.log("⬅️ CREATE response:", await resp.text());
      continue;
    }

    if (current.value == d.value) {
      console.log(`✔ ${d.key} already correct, skipping PUT`);
      continue;
    }

    console.log(`✏️ Updating metafield ${d.key} for variant ${variantId}`);

    const updateUrl = `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/metafields/${current.id}.json`;

    const body = {
      metafield: {
        id: current.id,
        value: String(d.value)
      }
    };

    const resp = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": ADMIN_TOKEN,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    });

    console.log("⬅️ PUT response:", await resp.text());
  }
}

// ===================== EXPRESS WEBHOOK =====================
const app = express();
app.use(bodyParser.json({ limit: "2mb" }));

app.post("/product-created", async (req, res) => {
  console.log("====== 🔔 PRODUCT CREATED WEBHOOK ======");

  const product = req.body;

  console.log("📌 Product:", product.title);
  console.log("📦 Vendor:", product.vendor);

  const tags = product.tags || [];
  console.log("🏷 Tags:", tags);

  if (!tags.includes("footwear")) {
    console.log("⛔ Not footwear → stop");
    return res.send("ignored");
  }

  const gender = getGenderFromTags(tags);
  if (!gender) {
    console.log("⛔ No uomo/donna → stop");
    return res.send("ignored");
  }

  const mappedVariants = [];

  for (const v of product.variants) {
    const opt = v.options?.[0];
    const raw = opt?.value || "";
    console.log("👟 Raw size:", raw);

    const sizeNum = parseFloat(raw.replace(/[^\d.]/g, ""));
    if (!sizeNum) continue;

    const mapping = findSizeRow(product.vendor, gender, sizeNum);
    if (!mapping) continue;

    mappedVariants.push({
      variantId: v.id,
      mapping
    });

    await updateVariantMetafields(v.id, mapping);
  }

  console.log("Final variants mapped:", mappedVariants.length);

  res.send("OK");
});

// ===================== START SERVER =====================
app.listen(3000, () => console.log("🚀 Server running on port 3000"));
