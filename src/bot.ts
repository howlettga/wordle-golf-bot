import { Bot, type Context, session } from "grammy";
import { type Conversation, type ConversationFlavor, conversations, createConversation } from "@grammyjs/conversations";
import { User } from "grammy/types";
import fetch from 'node-fetch';
import { format } from "date-fns";
import { scheduleJob } from "node-schedule";
import { GoogleSheet } from "./google-sheets";
import 'dotenv/config';

type MyContext = Context & ConversationFlavor;
type MyConversation = Conversation<MyContext>;

interface WordleScore {
  initialWord: string;
  gameId: {
    label: string;
    value: number;
  };
  score: {
    label: string;
    value: number;
  };
  lines: string[];
}

export class WordleBot {
  private bot: Bot<MyContext>;
  private sheet: GoogleSheet;

  constructor(sheet: GoogleSheet) {
    this.bot = new Bot<MyContext>(process.env.TELEGRAM_BOT_TOKEN as string);
    this.sheet = sheet;
  }

  start() {
    this.bot.use(session({ initial: () => ({}) }));
    this.bot.use(conversations());

    this.bot.use(createConversation(this.newRound.bind(this), 'new-round'));

    this.registerWordle();
    this.registerScore();
    this.registerScorecard();
    this.registerHelp();
    this.registerInstructions();
    this.registerEasterEggs();

    this.bot.catch((err) => {
      console.log(err);
      const ctx = err.ctx;
      ctx.reply("I'm sorry, there was an error :(\nI've been a bad bot", { message_thread_id: ctx.message?.message_thread_id });
    });

    this.bot.start();
    this.initScheduledMessages();
  }

  private async newRound(conversation: MyConversation, ctx: MyContext) {
    const initiator = ctx.from;
    await ctx.reply(`@${initiator?.username} has requested to start a new round of Wordle Golf. Would someone confirm? (yes/no)\n\n🚨This will reset the existing round!`, { message_thread_id: ctx.message?.message_thread_id });
    const { message } = await conversation.wait();
    const respondor = message?.from;

    if (!initiator || !respondor) {
      await ctx.reply("I'm sorry, I can't figure out who's talking. Please help pay for my education", { message_thread_id: ctx.message?.message_thread_id });
    } else if (message.text?.toLowerCase() === 'no' || message.text?.toLowerCase() === 'n') {
      await ctx.reply("Well that's no fun! I guess we know who the loser of the group is 😝", {
        reply_parameters: {
          message_id: message.message_id,
        },
        message_thread_id: ctx.message?.message_thread_id
      });
    } else if (message.text?.match(/.*bad bot.*/i)) {
      await ctx.reply("You're right, I'm very naughty 👺", {
        reply_parameters: {
          message_id: message.message_id,
        },
        message_thread_id: ctx.message?.message_thread_id
      });
    } else if (respondor.id === initiator.id) {
      await ctx.reply("You can't start a new round with yourself silly! Make some friends and then we'll talk...", {
        reply_parameters: {
          message_id: message.message_id,
        },
        message_thread_id: ctx.message?.message_thread_id,
      });
    } else if (message.text?.toLowerCase() === 'yes' || message?.text?.toLowerCase() === 'y') {
      console.log(this);
      const title = this.getGroupId(ctx);
      await this.sheet.newSheet(title, ctx.message?.chat.id, ctx.message?.message_thread_id);
      ctx.reply("New round initiated! Scoring will open tomorrow!\n\nYou must submit a wordle score each day for the next nine days. The lowest score over this period wins!\nUse the /instructions command to request further information.\n\nAnd may the odds be ever in your favor!", { message_thread_id: ctx.message?.message_thread_id });
    } else if (message.text?.match(/^yes!*\z/i)) {
      ctx.reply("Now that's the spirit! With pizzazz like that, I just give you some free points this round 😎", {
        reply_parameters: {
          message_id: message.message_id,
        },
        message_thread_id: ctx.message?.message_thread_id
      });
      const title = this.getGroupId(ctx);
      await this.sheet.newSheet(title, ctx.message?.chat.id, ctx.message?.message_thread_id);
      ctx.reply("New round initiated! Scoring will open tomorrow!\n\nYou must submit a wordle score each day for the next nine days. The lowest score over this period wins!\nUse the /instructions command to request further information.\n\nAnd may the odds be ever in your favor!", { message_thread_id: ctx.message?.message_thread_id });
    } else {
      await ctx.reply("Hmmm, I don't really know what's going on! Now I'm not going to start a new round 🫣", {
        reply_parameters: {
          message_id: message.message_id,
        },
        message_thread_id: ctx.message?.message_thread_id
      });
    }
  }

  private registerWordle() {
    this.bot.command("wordle", async (ctx) => {
      await ctx.conversation.enter("new-round");
    });
  }

  private registerHelp() {
    this.bot.command("help", ctx => {
      ctx.reply("Get bent... I'm not helping you!\nalright, alright. just use the /instructions command to figure out how to play idot", {
        reply_parameters: {
          message_id: ctx.message!.message_id,
        },
        message_thread_id: ctx.message?.message_thread_id
      });
    });
  }

  private registerInstructions() {
    this.bot.command("instructions", (ctx) => ctx.reply(
`Welcome to Wordle Golf!
The game the NYT can't be bothered to invest development resources into, so... I am a bot to help you keep score!

Use the /wordle command to start a new round. The round will begin the day after you use the /wordle command.
Each new round consists of 9 days of scoring. The lowest score over the 9 days wins!

Each day, complete the Wordle and use the share button to submit your score to this chat thread. Only share your summary! No screenshots of the actual words used.

At the end of the nine days, I'll let you know you is smart and who is not! You can use the /scorecard command to see the standings at any time.

Scoring:
- 1 point for each guess it took to get the word
- 6.5 points if you do not finish
- 7 points if you miss the day

May the odds be ever in your favor!
`, {
        message_thread_id: ctx.message?.message_thread_id
      }));
  }

  private registerScorecard() {
    this.bot.command("scorecard", async (ctx) => {
      const title = this.getGroupId(ctx);
      const report = await this.getReport(title);
      
      ctx.reply(report, { message_thread_id: ctx.message?.message_thread_id });
    });
  }

  private registerScore() {
    this.bot.hears(/^Wordle.*/, async (ctx) => {
      // console.log(ctx.message);
      if (ctx.from?.username && ctx.message?.text) {
        const title = this.getGroupId(ctx);
        const wordle = this.parseWordleScore(ctx.message.text, ctx.from);
        if (await this.isTodaysWordle(wordle)) {
          if (this.validateWordleScore(wordle)) {
            try {
              await this.sheet.addScore(wordle.username, wordle.score.value, title);
              // TODO bogey, par, etc
              ctx.reply(`Thanks for submitting your wordle score @${ctx.from.username}.\nYou have been marked down for a score of ${wordle.score.value}`, { message_thread_id: ctx.message?.message_thread_id });
            } catch (err: any) {
              if (err.message === 'ROUND_NOT_FOUND') {
                ctx.reply("What are you trying to play?? A round hasn't been initiated fool!\nStart a new round with /wordle to get playing Wordle Golf!", {
                  reply_parameters: {
                    message_id: ctx.message!.message_id,
                  },
                  message_thread_id: ctx.message?.message_thread_id
                });
              } else if (err.message === 'ROUND_OVER') {
                // im not sure this can ever hit with the new archive and schedule logic. Maybe at 8am on the next day
                ctx.reply("It appears the round has ended. Start a new round to continue playing Wordle Golf!", { message_thread_id: ctx.message?.message_thread_id });
              } else if (err.message === 'ROUND_NOT_STARTED') {
                ctx.reply("The round hasn't started yet dumbass. Wait till tomorrow!", {
                  reply_parameters: {
                    message_id: ctx.message!.message_id,
                  },
                  message_thread_id: ctx.message?.message_thread_id 
                });
               } else if (err.message === 'ALREADY_SCORED') {
                ctx.reply("You have already submitted your score for today idiot. No need to resubmit!", {
                  reply_parameters: {
                    message_id: ctx.message!.message_id,
                  },
                  message_thread_id: ctx.message?.message_thread_id,
                });
              } else {
                console.log(err);
                ctx.reply("There was an issue submitting your score :(\nI'm not sure why", {
                  reply_parameters: {
                    message_id: ctx.message!.message_id,
                  },
                  message_thread_id: ctx.message?.message_thread_id 
                });
              }
            }
          } else {
            ctx.reply(`🚨🚨🚨 CHEATER 🚨🚨🚨\nSomething is wrong with your wordle score @${ctx.from.username}`, { message_thread_id: ctx.message?.message_thread_id });
          }
        } else {
          ctx.reply(`This is not today's score @${ctx.from.username}. Don't try to fool me!`, { message_thread_id: ctx.message?.message_thread_id });
        }
      } else {
        ctx.reply(`I'm sorry, I don't know who you are. I'm not sure what you want me to do.`, { message_thread_id: ctx.message?.message_thread_id });
      }
    });
  }

  private registerEasterEggs() {
    this.bot.hears(/.*\bbad bot\b.*/i, async (ctx) => {
      ctx.reply("You can spank me now 😈", {
        reply_parameters: {
          message_id: ctx.message!.message_id,
        },
        message_thread_id: ctx.message?.message_thread_id,
      });
    });
    this.bot.hears(/.*\bcheater\b.*/i, async (ctx) => {
      ctx.reply("🚨🚨🚨 CHEATER ALERT 🚨🚨🚨 CHEATER ALERT 🚨🚨🚨 CHEATER ALERT 🚨🚨🚨\n\nLooks like we have a cheater!! Get em!!!!!!", { message_thread_id: ctx.message?.message_thread_id });
    });
    this.bot.hears(/.*\blooks like\b.*/i, async (ctx) => {
      ctx.reply("It looks like a fucking Wordle score! Geeeeeeesh 😂", {
        reply_parameters: {
          message_id: ctx.message!.message_id,
        },
        message_thread_id: ctx.message?.message_thread_id,
      });
    });
  }

  private initScheduledMessages() {
    const that = this;
    const daily = scheduleJob('0 9 * * *', async function() {
      const rounds = await that.sheet.getActiveRounds(false);
      for (const round of rounds) {
        await that.bot.api.sendMessage(round.title.split('|')[1], "One more day down! Don't forget to submit today's score.\nFeel free to use the /scorecard command to check the current standings.", { message_thread_id: round.threadId });
      }
    }.bind(this));
    const complete = scheduleJob('0 11 * * *', async function() {
      const rounds = await that.sheet.getActiveRounds(true);
      for (const round of rounds) {
        await that.bot.api.sendMessage(round.title.split('|')[1], "The round is complete! Lets see who won!", { message_thread_id: round.threadId });
        await that.bot.api.sendMessage(round.title.split('|')[1], await that.getFinalTabulation(round.title), { message_thread_id: round.threadId });
      }
    })
  }

  /** HELPERS */

  private parseWordleScore(message: string, user: User) {
    const lines = message.split("\n");
    const title = lines[0].split(" ");
    
    return {
      username: user.username!,
      initialWord: title[0],
      gameId: {
        label: title[1],
        value: parseInt(title[1].split(",").join("")),
      },
      score: {
        label: title[2],
        value: parseInt(title[2].split('/')[0]),
      },
      lines: lines,
    };
  }

  private async isTodaysWordle(wordle: WordleScore) {
    const today = format(new Date(), "yyyy-MM-dd");
    const todaysWordle = await (await fetch(`https://www.nytimes.com/svc/wordle/v2/${today}.json`)).json();
  
    return todaysWordle.days_since_launch === wordle.gameId.value;
  }

  private validateWordleScore(wordle: WordleScore) {
    const scoring = wordle.score.label.split("/");
    if (scoring.length !== 2 || scoring[1] !== '6' || parseInt(scoring[0]) < 1 || parseInt(scoring[0]) > 6) {
      return false
    }
  
    if (wordle.lines.length !== wordle.score.value + 2) {
      return false
    }
  
    if (wordle.lines[wordle.lines.length - 1] !== "🟩🟩🟩🟩🟩") {
      return false
    }
  
    return true;
  }

  private async getReport(groupId: string) {
    try {
      const round = await this.sheet.getScoringReport(groupId);
  
      let replyString = "Current Round:\n-----\n";
      replyString += `Started on ${format(round.startDate, 'M/d/yy')}\n${round.days} days completed`;
      replyString += "\n-----\nScores:\n\n";
      for (const player in round.scores) {
        replyString += `${player}: ${round.scores[player].total}\n    ${round.scores[player].holes.join(" ")}\n`;
      }
      replyString += "-----\nScores may be adjusted for penalties on conclusion of the round.\nThanks for playing!";
  
      return replyString;
    } catch (err: any) {
      if (err.message === "SHEET_NOT_FOUND") {
        return "There is no active round right now.\nStart a new round with the /wordle command!";
      } else {
        console.log(err);
        return "I'm having trouble retrieving the current scores. Maybe I need to be punished?";
      }
    }
  }

  private async getFinalTabulation(groupId: string) {
    try {
      const round = await this.sheet.tabulateFinalResults(groupId);
      const getWinnerLines = () => {
        if (round.tie) {
          return `We have ${round.winners.length} winners: ${round.winners.join(", ")}!!\n\n🎉🎉CONGRATULATIONS🎉🎉\n🍾🍾🍾🍾🍾`
        } else {
          return `We have a winner: ${round.winners[0]}!!\n\n🎊🎊CONGRATULATIONS🎊🎊\n🍾🍾🍾🍾🍾`
        }
      }
  
      const reply =
`Round Results:
-----
${getWinnerLines()}
With a score of ${round.winningScore} they are clearly the smartest!!
-----
This round was started on ${format(round.startDate, 'M/d/yy')}
-----
Here are the final scores:

${round.scores.map(p => `${p[0]}: ${p[1].total}\n    ${p[1].holes.join(" ")}`).join("\n")}
-----
Thanks for playing! You can start a new round with the /wordle command!
`;
      return reply;
    } catch (err: any) {
      if (err.message === 'ROUND_NOT_FINISHED') {
        return "The round hasn't finished yet. Wait till later!";
      } else {
        throw err;
      }
    }
  }

  private getGroupId(ctx: any) {
    if (ctx.message?.chat.type === "group") {
      return ctx.message.chat.title + "|" + ctx.message.chat.id;
    } else if (ctx.message?.chat.type === "supergroup") {
      if (ctx.message.reply_to_message?.forum_topic_created) {
        return ctx.message.reply_to_message.forum_topic_created!.name + "|" + ctx.message.chat.id;
      } else {
        return ctx.message.chat.title + "|" + ctx.message.chat.id;
      }
    } else {
      return ctx.message.chat.title + "|" + ctx.message.chat.id;
    }
  }

}
