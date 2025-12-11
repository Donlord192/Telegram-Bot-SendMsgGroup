import { Telegraf, Markup } from "telegraf";
import fs from "fs-extra";
import LocalSession from "telegraf-session-local";

const bot = new Telegraf("Token_here");
const ADMIN_ID = 123456;

bot.use(new LocalSession({ database: "sessions.json" }).middleware());

const chatsFile = "chats.json";
const configFile = "config.json";

// ---- utils ----
function loadChats() {
  try {
    const data = fs.readFileSync(chatsFile, "utf8");
    return JSON.parse(data);
  } catch {
    fs.writeFileSync(chatsFile, "[]");
    return [];
  }
}

function saveChats(v) {
  fs.writeFileSync(chatsFile, JSON.stringify(v, null, 2));
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch {
    const def = { lastBroadcast: "" };
    fs.writeFileSync(configFile, JSON.stringify(def, null, 2));
    return def;
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
}

// ---- START ----
bot.start((ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Доступ запрещён.");

  ctx.reply(
    "Добро пожаловать в админ-панель!",
    Markup.inlineKeyboard([
      [Markup.button.callback("📨 Разослать", "broadcast_menu")],
      [Markup.button.callback("📌 Последний текст", "show_last")],
      [Markup.button.callback("➕ Добавить чат", "add_chat_menu")],
      [Markup.button.callback("❌ Удалить чат", "remove_chat_menu")],
      [Markup.button.callback("📋 Список чатов", "list_chats")]
    ])
  );
});

// ---- last text ----
bot.action("show_last", (ctx) => {
  const cfg = loadConfig();
  if (!cfg.lastBroadcast) return ctx.reply("Последний текст пуст.");
  ctx.reply(`📝 Последний текст:\n\n${cfg.lastBroadcast}`);
});

// ---- список чатов ----
bot.action("list_chats", (ctx) => {
  const chats = loadChats();
  if (chats.length === 0) return ctx.reply("Список пуст.");

  let out = "📋 Подключённые чаты:\n\n";
  chats.forEach((c, i) => (out += `${i + 1}. \`${c}\`\n`));

  ctx.reply(out, { parse_mode: "Markdown" });
});

// ---- меню добавления ----
bot.action("add_chat_menu", (ctx) => {
  ctx.session.mode = "add";
  ctx.reply("Введи chat_id для добавления:");
});

// ---- меню удаления ----
bot.action("remove_chat_menu", (ctx) => {
  ctx.session.mode = "remove";
  ctx.reply("Введи chat_id для удаления:");
});

// ---- рассылка ----
bot.action("broadcast_menu", (ctx) => {
  ctx.session.mode = "broadcast";
  ctx.reply("Введи текст рассылки:");
});

// ---- обработка текста ----
bot.on("text", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const mode = ctx.session.mode;
  if (!mode) return;

  const text = ctx.message.text.trim();
  const chats = loadChats();
  const cfg = loadConfig();

  // ---- ADD ----
  // При добавлении чата
if (mode === "add") {
    try {
        const chatInfo = await ctx.telegram.getChat(text);
        // Попробуем отправить тестовое сообщение, но не сохраняем его
        await ctx.telegram.sendMessage(text, "Бот подключен ✅");
        
        if (!chats.includes(text)) {
            chats.push(text);
            saveChats(chats);
            ctx.reply(`✔️ Chat ID \`${text}\` добавлен\nНазвание: ${chatInfo.title || chatInfo.username}`);
        } else {
            ctx.reply("Этот ID уже в списке.");
        }
    } catch {
        ctx.reply("❌ Бот не имеет доступа к этому чату. Проверь chat_id и права бота.");
    }
}

  // ---- REMOVE ----
  if (mode === "remove") {
    saveChats(chats.filter((c) => c != text));
    ctx.reply(`❌ Chat ID \`${text}\` удалён`, { parse_mode: "Markdown" });
  }

  // ---- BROADCAST ----
  if (mode === "broadcast") {
    cfg.lastBroadcast = text;
    saveConfig(cfg);

    let ok = 0,
      fail = 0;
    let log = "📨 Результат отправки:\n\n";

    for (const id of chats) {
      try {
        const chatInfo = await ctx.telegram.getChat(id);

        await ctx.telegram.sendMessage(id, text);
        ok++;

        log += `✔️ [${id}] — ${chatInfo.title || chatInfo.username || "Без имени"}\n`;
      } catch {
        fail++;
        log += `❌ [${id}] — ошибка доступа\n`;
      }
    }

    ctx.reply(
      `📨 Рассылка завершена\n✔️ ${ok}\n❌ ${fail}\n\n${log}`,
      { parse_mode: "Markdown" }
    );
  }

  ctx.session.mode = null;
});

bot.launch();
console.log("Bot started...");