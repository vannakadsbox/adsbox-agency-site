// Roles and what each role may do in each section of the admin panel.
// E = edit, V = view, N = hidden. Checked on the server for every request.

export const ROLES = ["owner", "admin", "sales", "writer", "designer", "viewer"];

export const ROLE_INFO = {
  owner:    { emoji: "👑", km: "ម្ចាស់", en: "Owner" },
  admin:    { emoji: "🛡️", km: "Admin", en: "Admin" },
  sales:    { emoji: "💼", km: "លក់", en: "Sales" },
  writer:   { emoji: "✍️", km: "អ្នកសរសេរ", en: "Writer" },
  designer: { emoji: "🎨", km: "អ្នករចនា", en: "Designer" },
  viewer:   { emoji: "👀", km: "មើលប៉ុណ្ណោះ", en: "Viewer" },
};

//                       owner admin sales writer designer viewer
const MATRIX = {
  services: "EEEVVV",
  accounts: "EEEVNV",
  promos:   "EEEVEV",
  clients:  "EEVVEV",
  articles: "EEVEVV",
  autopost: "EENVNV",   // Admin edits times and settings; only the Owner switches Live / Dry run (checked in worker.js)
  history:  "VVNVNV",
  team:     "EENNNN",   // Admin can add and manage members; nobody can change the Owner
};

export const SECTIONS = Object.keys(MATRIX);

export function access(role, section) {
  const i = ROLES.indexOf(role);
  const row = MATRIX[section];
  if (i < 0 || !row) return "N";
  return row[i];
}

export const canView = (role, section) => access(role, section) !== "N";
export const canEdit = (role, section) => access(role, section) === "E";

export function permsFor(role) {
  const out = {};
  for (const s of SECTIONS) out[s] = access(role, s);
  return out;
}
