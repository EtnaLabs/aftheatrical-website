const express = require("express");
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

// Load .env from project root
const envPath = path.join(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const eq = line.indexOf("=");
    if (eq > 0) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  });
}

const app = express();
app.use(express.json({ limit: "5mb" }));

const CSV_PATH = path.join(__dirname, "peppino-guests-italians.csv");
const DATA_PATH = path.join(__dirname, "guests-data.json");
const TEMPLATE_PATH = path.join(__dirname, "peppino-impastato-email.html");
const DEFAULT_SUBJECT = "INVITO: Peppino Impastato — una serata culturale all'Italian American Museum";
const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_TOKEN;
const FROM_EMAIL = '"Anissa Felix" <anissa@aftheatricals.com>';

// Send email via Postmark
async function sendEmail(to, subject, htmlBody) {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": POSTMARK_TOKEN,
    },
    body: JSON.stringify({ From: FROM_EMAIL, To: to, Subject: subject, HtmlBody: htmlBody }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.Message || "Postmark error");
  return data;
}

// Load or initialize guest data
function loadGuests() {
  if (fs.existsSync(DATA_PATH)) {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  }

  const csv = fs.readFileSync(CSV_PATH, "utf-8");
  const records = parse(csv, { columns: true, skip_empty_lines: true });

  const guests = records.map((r, i) => {
    const email = r.personal_email || r.work_email || "";
    return {
      id: i,
      name: r.name,
      email: email.trim(),
      title: r.title,
      company: r.company_pdl,
      subject: "", // empty = use default subject
      body: "", // empty = use default template
      schedule: "", // empty = not scheduled
      status: "pending", // pending | scheduled | sent
      sent_at: "", // ISO timestamp when sent
    };
  });

  saveGuests(guests);
  return guests;
}

function saveGuests(guests) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(guests, null, 2));
}

function getDefaultTemplate() {
  return fs.readFileSync(TEMPLATE_PATH, "utf-8");
}

function renderBody(guest) {
  const template = getDefaultTemplate();
  if (guest.body) return guest.body;
  const firstName = guest.name.split(" ")[0].replace(/[,"]/g, "");
  return template.replace("[name]", firstName);
}

// Serve UI
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "ui.html"));
});

// API: list all guests
app.get("/api/guests", (req, res) => {
  const guests = loadGuests();
  res.json(guests);
});

// API: get single guest with rendered body
app.get("/api/guests/:id", (req, res) => {
  const guests = loadGuests();
  const guest = guests[Number(req.params.id)];
  if (!guest) return res.status(404).json({ error: "Not found" });
  res.json({ ...guest, renderedBody: renderBody(guest), defaultSubject: DEFAULT_SUBJECT });
});

// API: update guest (body, schedule, status)
app.patch("/api/guests/:id", (req, res) => {
  const guests = loadGuests();
  const guest = guests[Number(req.params.id)];
  if (!guest) return res.status(404).json({ error: "Not found" });

  if (req.body.subject !== undefined) guest.subject = req.body.subject;
  if (req.body.body !== undefined) guest.body = req.body.body;
  if (req.body.schedule !== undefined) guest.schedule = req.body.schedule;
  if (req.body.status !== undefined) guest.status = req.body.status;

  saveGuests(guests);
  res.json(guest);
});

// API: bulk update schedule for selected guests
app.post("/api/guests/schedule", (req, res) => {
  const { ids, schedule } = req.body;
  const guests = loadGuests();

  ids.forEach((id) => {
    if (guests[id]) {
      guests[id].schedule = schedule;
      guests[id].status = schedule ? "scheduled" : "pending";
    }
  });

  saveGuests(guests);
  res.json({ updated: ids.length });
});

// API: get default template
app.get("/api/template", (req, res) => {
  res.json({ html: getDefaultTemplate(), defaultSubject: DEFAULT_SUBJECT });
});

// API: send emails to selected guests
app.post("/api/send", async (req, res) => {
  const { ids } = req.body;
  const guests = loadGuests();
  const results = [];

  for (const id of ids) {
    const guest = guests[id];
    if (!guest || !guest.email) continue;
    const subject = guest.subject || DEFAULT_SUBJECT;
    const body = renderBody(guest);
    try {
      await sendEmail(guest.email, subject, body);
      guest.status = "sent";
      guest.sent_at = new Date().toISOString();
      results.push({ id, email: guest.email, success: true });
    } catch (err) {
      results.push({ id, email: guest.email, success: false, error: err.message });
    }
  }

  saveGuests(guests);
  res.json({ results });
});

// API: send preview to test emails
app.post("/api/preview", async (req, res) => {
  const { guestId } = req.body;
  const guests = loadGuests();
  const guest = guestId != null ? guests[guestId] : null;
  const subject = `[PREVIEW] ${guest ? (guest.subject || DEFAULT_SUBJECT) : DEFAULT_SUBJECT}`;
  const body = guest ? renderBody(guest) : getDefaultTemplate();
  const testEmails = ["fed@aisocratic.org", "anissafelix@gmail.com"];
  const results = [];

  for (const email of testEmails) {
    try {
      await sendEmail(email, subject, body);
      results.push({ email, success: true });
    } catch (err) {
      results.push({ email, success: false, error: err.message });
    }
  }

  res.json({ results });
});

const PORT = 3456;
app.listen(PORT, () => {
  console.log(`Mailer UI running at http://localhost:${PORT}`);
});
