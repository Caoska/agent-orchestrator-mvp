// lib/templating.js
export function renderTemplate(str = "", ctx = {}) {
if (typeof str !== "string") return str;
return str.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
const parts = key.trim().split(".");
let val = ctx;
for (const p of parts) {
if (val == null) return "";
val = val[p];
}
if (val === undefined || val === null) return "";
if (typeof val === "object") return JSON.stringify(val);
return String(val);
});
}
