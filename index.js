require("dotenv").config();

const express = require("express");
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;

// =========================
// STATE
// =========================

let agents = {};
let dashboardMsg = null;

// =========================
// DISCORD CLIENT
// =========================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// =========================
// COMMANDS
// =========================

const commands = [
    new SlashCommandBuilder()
        .setName("online")
        .setDescription("Set yourself online"),

    new SlashCommandBuilder()
        .setName("offline")
        .setDescription("Set yourself offline")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
    await rest.put(
        Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            process.env.GUILD_ID
        ),
        { body: commands }
    );

    console.log("Slash commands registered");
}

// =========================
// HELPERS
// =========================

function getAgent(name) {
    const safe = name?.trim() || "Unknown Agent";

    if (!agents[safe]) {
        agents[safe] = {
            presence: "offline",
            call: false,
            callStartTime: null
        };
    }

    return agents[safe];
}

function normalize(body) {
    return body?.body || body || {};
}

function parseGHL(body) {
    const payload = normalize(body);

    // GHL sometimes nests our custom JSON as a stringified value
    // inside customData.status instead of sending it at the root.
    let embedded = {};
    try {
        embedded = JSON.parse(payload?.customData?.status);
    } catch (err) {
        embedded = {};
    }

    const event =
        embedded?.event ||
        payload?.event ||
        payload?.type ||
        payload?.call_status ||
        "unknown";

    // Prefer real first/last name fields from the contact's user object,
    // since merge tags like {{user.name}} don't always resolve.
    const firstLast = [payload?.user?.firstName, payload?.user?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

    const agent =
        firstLast ||
        (embedded?.agent_name && embedded.agent_name.trim()) ||
        payload?.agent_name ||
        payload?.agent?.name ||
        payload?.user?.name ||
        "Unknown Agent";

    return { event, agent };
}

// =========================
// WEBHOOK
// =========================

app.post("/ghl-webhook", (req, res) => {
    try {
        console.log("Incoming GHL payload:", JSON.stringify(req.body, null, 2));

        const { event, agent } = parseGHL(req.body);
        console.log("Parsed event/agent:", event, agent);

        const data = getAgent(agent);

        if (event === "call_started") {
            data.presence = "online"; // trust GHL as the source of truth
            data.call = true;
            data.callStartTime = Date.now();
        }

        if (event === "call_ended") {
            data.call = false;
            data.callStartTime = null;
        }

        res.sendStatus(200);
    } catch (err) {
        console.log(err.message);
        res.sendStatus(200);
    }
});

// =========================
// INTERACTIONS
// =========================

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const member = interaction.member;
    const allowed = member?.roles?.cache?.some(r => r.name === "Agents");

    try {
        await interaction.deferReply({ flags: 64 });
    } catch (err) {
        console.log("interaction expired:", err.message);
        return;
    }

    if (!allowed) {
        return interaction.editReply("❌ Agents only.");
    }

    const name = member?.displayName || "Unknown Agent";
    const data = getAgent(name);

    if (interaction.commandName === "online") {
        data.presence = "online";
        return interaction.editReply("🟢 You are now online");
    }

    if (interaction.commandName === "offline") {
        data.presence = "offline";
        return interaction.editReply("⚫ You are now offline");
    }
});

// =========================
// DASHBOARD
// =========================

function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildDashboard() {
    const output = [];

    for (const [name, data] of Object.entries(agents)) {

        // ONLY show agents who used /online OR who GHL reported as active
        if (data.presence !== "online") continue;

        let status;

        if (data.call) {
            const duration = data.callStartTime
                ? formatTime(Date.now() - data.callStartTime)
                : "0:00";

            status = `🔴 On Call (${duration})`;
        } else {
            status = "🟢 Online";
        }

        output.push(`${name} — ${status}`);
    }

    return `📞 Live Agent Dashboard\n\n${output.join("\n") || "No active agents"}`;
}

// =========================
// READY
// =========================

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    await registerCommands();

    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    dashboardMsg = await channel.send(buildDashboard());

    let lastDashboard = "";
    setInterval(() => {
        if (!dashboardMsg) return;

        const next = buildDashboard();
        if (next === lastDashboard) return;
        lastDashboard = next;

        dashboardMsg.edit(next).catch(() => {});
    }, 5000);
});

// =========================
// START
// =========================

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error("Failed to log in:", err.message);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
