import express from "express";
import { WordleBot } from "./bot";
import { GoogleSheet } from "./google-sheets";

console.log("Wordle bot booting...");

const app = express();

app.get('/', (req, res) => {
  res.send("Healthy");
});

GoogleSheet.initAuth().then((auth) => {
  const sheet = new GoogleSheet(process.env.GOOGLE_SHEET_ID as string, auth);
  const bot = new WordleBot(sheet);

  bot.start();
  app.listen(process.env.PORT || 8080, () => {
    console.log("Wordle bot running...");
  });
}).catch((err) => {
  if (err.message === "INVALID_GOOGLE_AUTH_METHOD") {
    console.error("Invalid Google Auth Method Please set the required GOOGLE_AUTH_METHOD environment variable. Exiting...");
    process.exit(1);
  } else {
    console.error(err);
    process.exit(1);
  }
});

// import { Bot, type Context, session } from "grammy";
// import {
//     type Conversation,
//     type ConversationFlavor,
//     conversations,
//     createConversation,
// } from "@grammyjs/conversations";
// import 'dotenv/config';

// type MyContext = Context & ConversationFlavor;
// type MyConversation = Conversation<MyContext>;

// const bot = new Bot<MyContext>(process.env.TELEGRAM_BOT_TOKEN as string);

// /** Defines the conversation */
// async function greeting(conversation: MyConversation, ctx: MyContext) {
//     await ctx.reply("Hi there! What is your name?");
//     const { message } = await conversation.wait();
//     await ctx.reply(`Welcome to the chat, ${message?.text}!`);
// }

// bot.use(session({ initial: () => ({}) }));
// bot.use(conversations());

// bot.use(createConversation(greeting));

// bot.command("enter", async (ctx) => {
//     await ctx.reply("Entering conversation!");
//     // enter the function "greeting" you declared
//     await ctx.conversation.enter("greeting");
// });

// bot.command("start", (ctx) => ctx.reply("Hi! Send /enter"));
// bot.use((ctx) => ctx.reply("What a nice update."));

// bot.start();
// console.log("started.")
