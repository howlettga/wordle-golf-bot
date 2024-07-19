import { Bot, type Context, session } from "grammy";
import { type Conversation, type ConversationFlavor, conversations, createConversation } from "@grammyjs/conversations";
import { User } from "grammy/types";
import fetch from 'node-fetch';
import { format } from "date-fns";
import { scheduleJob } from "node-schedule";
import { GoogleSheet, ScoringError } from "./google-sheets";
import { DECLINE_RESPONSE, ENTHUSIASTIC_RESPONSE, ERROR_CONFIRMATION, GOLF_SCORE_RESPONSES, INSTRUCTIONS, NAUGHTY, SAME_PERSON, SCORE_ERROR, START_NEW_ROUND, UNKNOWN_PERSON } from "./replies";
import 'dotenv/config';

// TODO
//   - dates all based on eastern time?
//   - change indexing from date to game number
//   - make final results happen on next day instead of day after
//   - add parameterization of game start (options)
//   - first name specification?
//   - scorecard match formatting of final results

type MyContext = Context & ConversationFlavor;
type MyConversation = Conversation<MyContext>;

export interface WordleGameConfig {
  id: string; // game id based on message thread
  chatId?: number;
  threadId?: number;
  rounds: number;
  mulligans: number;
  initiationDate: string;
  initialGameNumber: number;
}

interface WordleScore {
  playerId: string;
  userId: number;
  username?: string;
  userFirstName: string;
  initialWord: string;
  puzzle: number;
  score: {
    label: string;
    value: number;
  };
  lines: string[];
}

export class WordleBot {
  private bot: Bot<MyContext>;
  private sheet: GoogleSheet;
  private spankRequests: {
    init: { message_id: number, thread_id?: number }[];
    follow: { message_id: number, thread_id?: number }[];
  };

  constructor(sheet: GoogleSheet) {
    this.bot = new Bot<MyContext>(process.env.TELEGRAM_BOT_TOKEN as string);
    this.sheet = sheet;
    this.spankRequests = { init: [], follow: [] };
  }

  start() {
    this.bot.use(session({ initial: () => ({}) }));
    this.bot.use(conversations());

    this.bot.use(createConversation(this.newRoundDialogue.bind(this), 'new-round'));

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

    this.bot.start({
      allowed_updates: [ "message", "message_reaction" ],
    });
    this.initScheduledMessages();
  }

  private registerWordle() {
    this.bot.command("wordle", async (ctx) => {
      await ctx.conversation.enter("new-round");
    });
  }

  private registerHelp() {
    this.bot.command("help", ctx => {
      // TODO: help - make official help registered with typeahead commands
      ctx.reply("Get bent... I'm not helping you!\nalright, alright. just use the /instructions command to figure out how to play idot", {
        reply_parameters: {
          message_id: ctx.message!.message_id,
        },
        message_thread_id: ctx.message?.message_thread_id
      });
    });
  }

  private registerInstructions() {
    this.bot.command("instructions", async ctx => {
      await this.replyAll(INSTRUCTIONS, ctx);
    });
  }

  private registerScorecard() {
    // TODO: doesn't work off reply - fixed via id update
    this.bot.command("scorecard", async (ctx) => {
      const title = this.getGroupId(ctx);
      const report = await this.getReport(title);
      
      await this.replyAll(report, ctx);
    });
  }

  private registerScore() {
    this.bot.hears(/^Wordle.*/, async (ctx) => {
      if (ctx.from && ctx.message?.text) {
        try {
          const wordle = this.parseWordleScore(ctx.message.text, ctx.from);
          
        } catch (err) {
          if (err instanceof ValidationError) {
            // todo: handle validation error
            this.replyAll(err.message, ctx);
          }
        }

      } else {
        this.replyAll(UNKNOWN_PERSON, ctx);
      }
    });
  }

  private registerScoreArchive() {
    this.bot.hears(/^Wordle.*/, async (ctx) => {
      if (ctx.from && ctx.message?.text) {
        const title = this.getGroupId(ctx);
        const wordle = this.parseWordleScore(ctx.message.text, ctx.from);
        console.log(wordle);
        if (await this.isTodaysWordle(wordle)) {
          if (this.validateWordleScore(wordle)) {
            try {
              await this.sheet.addScore(wordle.playerId, wordle.score.value, title);
              switch (wordle.score.value) {
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                case 6.5:
                  this.replyOne(`${GOLF_SCORE_RESPONSES[wordle.score.value].score}! ${random(GOLF_SCORE_RESPONSES[wordle.score.value].responses)}`, ctx);
                  break;
                default:
                  this.replyOne(`You have been marked down for a score of ${wordle.score.value}.`, ctx);
                  break;
              }
            } catch (err: unknown) {
              if (err instanceof ScoringError) {
                this.replyOne(SCORE_ERROR[err.type], ctx);
              } else {
                console.log(err);
                this.replyOne("There was an issue submitting your score :(\nI'm not sure why", ctx);
              }
            }
          } else {
            ctx.reply(`🚨🚨🚨 CHEATER 🚨🚨🚨\nSomething is wrong with your wordle score <a href="tg://user?id=${ctx.from?.id}">${ctx.from?.first_name} the CHEATER</a>!`, {
              reply_parameters: {
                message_id: ctx.message!.message_id,
              },
              message_thread_id: ctx.message?.message_thread_id,
              parse_mode: "HTML",
            });
          }
        } else {
          ctx.reply(`This is not today's score <a href="tg://user?id=${ctx.from?.id}">${ctx.from?.first_name} the CHEATER</a>. Don't try to fool me!`, {
            reply_parameters: {
              message_id: ctx.message!.message_id,
            },
            message_thread_id: ctx.message?.message_thread_id,
            parse_mode: "HTML",
          });
        }
      } else {
        ctx.reply(`I'm sorry, I don't know who you are. I'm not sure what you want me to do.`, { message_thread_id: ctx.message?.message_thread_id });
      }
    });
  }

  private registerEasterEggs() {
    this.registerSpankReactions();
    this.bot.hears(/.*\bluckily i have\b.*/i, async (ctx) => {
      await this.replyOne("Luckily I have woord", ctx);
    });
    this.bot.hears(/.*butthole.*|.*butt hole.*/i, async (ctx) => {
      await this.replyOne("SHOW ME YOUR BUTT HOLE!!!", ctx);
    })
    this.bot.hears(/.*\bshow me your butthole\b.*/i, async (ctx) => {
      await this.replyAll(`I rate it a ${random([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])}!`, ctx);
    });
    // i would rate it (butthole) [1-10]
    this.bot.hears(/.*\bbad bot\b.*/i, async (ctx) => {
      const msg = await this.replyOne("You can spank me now 😈", ctx);
      this.spankRequests.init.push({ message_id: msg.message_id, thread_id: ctx.message?.message_thread_id });
    }); // add spank reaction reaction
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
  
  private registerSpankReactions() {
    this.bot.reaction("👏", async ctx => {
      const spank = this.spankRequests.init.find(element => element.message_id === ctx.update.message_reaction.message_id);
      if (spank) {
        const msg = await ctx.reply("Inghhhhuhhuhhh! YESSS that's just how I like it!", {
          message_thread_id: spank.thread_id,
        });
        this.spankRequests.follow.push({ message_id: msg.message_id, thread_id: spank.thread_id });
      }
      const spankRes = this.spankRequests.follow.find(element => element.message_id === ctx.update.message_reaction.message_id);
      if (spankRes) {
        await ctx.reply("You are so good to me! 💜💜💜🤤", { message_thread_id: spankRes.thread_id });
      }
    });
  }

  private initScheduledMessages() {
    const that = this;
    const daily = scheduleJob('0 9 * * *', async function() {
      const rounds = await that.sheet.getActiveRounds(false);
      for (const round of rounds) {
        // TODO: have a special message on the first day of the round
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

  /** CONVERSATION DIALOGUE  */

  private async newRoundDialogue(conversation: MyConversation, ctx: MyContext) {
    if (await this.verifyRoundInitiationDialogue(conversation, ctx)) {
      await this.replyAll("Let's get this round started!", ctx);
      const roundParameters = await this.gatherRoundParametersDialogue(conversation, ctx);
      if (roundParameters) {
        const todayInfo = await this.getTodaysWordle();

        const game: WordleGameConfig = {
          id: this.getGroupId(ctx),
          chatId: ctx.message?.chat.id,
          threadId: ctx.message?.message_thread_id,
          rounds: roundParameters.rounds,
          mulligans: roundParameters.mulligans,
          initiationDate: todayInfo.date,
          initialGameNumber: todayInfo.gameNumber,
        };
        await this.sheet.newGame(game);
        this.replyAll(START_NEW_ROUND, ctx);
      }
    }
  }

  private async verifyRoundInitiationDialogue(conversation: MyConversation, ctx: MyContext) {
    const initiator = ctx.from;
    
    await ctx.reply(`<a href="tg://user?id=${ctx.from?.id}">${ctx.from?.first_name}</a> has requested to start a new round of Wordle Golf. Would someone confirm? (yes/no)\n\n🚨This will reset any existing round!`, {
      message_thread_id: ctx.message?.message_thread_id,
      parse_mode: "HTML",
    });
    const { message } = await conversation.wait();
    const respondor = message?.from;

    if (!initiator || !respondor) {
      await this.replyAll(UNKNOWN_PERSON, ctx);
    } else if (message.text?.toLowerCase() === 'no' || message.text?.toLowerCase() === 'n') {
      await this.replyAll(DECLINE_RESPONSE, ctx);
    } else if (respondor.id === initiator.id) {
      await this.replyOne(SAME_PERSON, ctx);
    } else if (message.text?.toLowerCase() === 'yes' || message?.text?.toLowerCase() === 'y') {
      return true;
    } else {
      await this.replyOne(ERROR_CONFIRMATION, ctx);
    }
    return false;
  }

  private async gatherRoundParametersDialogue(conversation: MyConversation, ctx: MyContext) {
    try {
      await this.replyAll("How many rounds (days) would you like to play?", ctx);
      const rounds = await this.getNumberDialogue(conversation, ctx);
      await this.replyAll("How many mulligans (skip days) would you like to include?", ctx);
      const mulligans = await this.getNumberDialogue(conversation, ctx);
      if (mulligans > rounds) {
        await this.replyAll("I'm sorry, you can't have more mulligans than rounds. goodbye.", ctx);
        return;
      }
      return { rounds, mulligans };
    } catch (err) {
      console.log(err);
      return;
    }
  }

  private async getNumberDialogue(conversation: MyConversation, ctx: MyContext): Promise<number> {
    const initiator = ctx.from;
    const { message } = await conversation.wait();
    const respondor = message?.from;

    if (!initiator || !respondor) {
      await this.replyAll(UNKNOWN_PERSON, ctx);
      throw new Error("invalid");
    } else if (message.text?.toLowerCase() === 'stop') {
      await this.replyAll("Leaving this dialogue...", ctx);
      throw new Error("stop");
    } else if (respondor.id !== initiator.id) {
      await ctx.reply(`I'm sorry, the initiator of the game gets to choose the settings. <a href="tg://user?id=${ctx.from?.id}">${ctx.from?.first_name}</a>?`, {
        message_thread_id: ctx.message?.message_thread_id,
        parse_mode: "HTML",
      });
      return await this.getNumberDialogue(conversation, ctx);
    } else if (!message.text) {
      await this.replyAll("I'm sorry, that is not a valid number. goodbye.", ctx);
      throw new Error("invalid");
    } else {
      const value = parseInt(message.text);

      if (isNaN(value)) {
        await this.replyAll("I'm sorry, that is not a valid number. goodbye.", ctx);
        throw new Error("invalid");
      }

      return value;
    }
  }

  /** END CONVERSATION DIALOGUE */

  /** GENERAL HELPERS */

  // TODO
    // parse and validate
  private parseWordleScore(message: string, user: User): WordleScore {
    const lines = message.split("\n");
    const title = lines[0].split(" ");

    const score = {
      playerId: this.getPlayerId(user),
      userId: user.id,
      username: user.username,
      userFirstName: user.first_name,
      initialWord: title[0],
      puzzle: parseInt(title[1].split(",").join("")),
      score: {
        label: title[2],
        // display: title[2].split('/')[0],
        value: title[2].split('/')[0] === 'X' ? 6.5 : parseInt(title[2].split('/')[0]),
      },
      lines: lines,
    };

    if (!this.validateWordleScore(score)) {
      throw new Error("invalid wordle score");  // todo
    }

    return score;
  }

  // private parseWordleScoreArchive(message: string, user: User): WordleScore {
  //   const lines = message.split("\n");
  //   const title = lines[0].split(" ");

  //   console.log(message);

  //   // todo: parse date off message.date epoch and then use that against wordle api to retreive game number

  //   return {
  //     playerId: this.getPlayerId(user),
  //     userId: user.id,
  //     username: user.username,
  //     userFirstName: user.first_name,
  //     initialWord: title[0],
  //     gameId: {
  //       label: title[1],
  //       value: parseInt(title[1].split(",").join("")),
  //     },
  //     score: {
  //       label: title[2],
  //       // display: title[2].split('/')[0],
  //       value: title[2].split('/')[0] === 'X' ? 6.5 : parseInt(title[2].split('/')[0]),
  //     },
  //     lines: lines,
  //   };
  // }

  private async getTodaysWordle() {
    const today = format(new Date(new Date().toLocaleString("en-US", {timeZone: "America/New_York"})), "yyyy-MM-dd");
    const todaysWordle = await (await fetch(`https://www.nytimes.com/svc/wordle/v2/${today}.json`)).json();

    return {
      date: today,
      gameNumber: todaysWordle.days_since_launch
    };
  }

  private async isTodaysWordle(wordle: WordleScore) {
    const today = format(new Date(new Date().toLocaleString("en-US", {timeZone: "America/New_York"})), "yyyy-MM-dd");
    const todaysWordle = await (await fetch(`https://www.nytimes.com/svc/wordle/v2/${today}.json`)).json();

    console.log(todaysWordle);

    return todaysWordle.days_since_launch === wordle.gameId.value;
  }

  private validateWordleScore(wordle: WordleScore) {
    const scoring = wordle.score.label.split("/");

    if (scoring.length !== 2 || scoring[1] !== '6') {
      return false;
    }

    if (scoring[0] === 'X') {
      // did not finish special case
      if (wordle.lines.length === 8 && wordle.lines[wordle.lines.length - 1] !== "🟩🟩🟩🟩🟩") {
        return true;
      }
    }

    if (parseInt(scoring[0]) < 1 || parseInt(scoring[0]) > 6) {
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
        const playerInfo = this.parsePlayerId(player);
        replyString += `${playerInfo.firstName}: ${round.scores[player].total}\n    ${round.scores[player].holes.join(" ")}\n`;
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
          return `We have ${round.winners.length} winners: ${round.winners.map(p => this.parsePlayerId(p).firstName).join(", ")}!!\n\n🎉🎉CONGRATULATIONS🎉🎉\n🍾🍾🍾🍾🍾`
        } else {
          return `We have a winner: ${this.parsePlayerId(round.winners[0]).firstName}!!\n\n🎊🎊CONGRATULATIONS🎊🎊\n🍾🍾🍾🍾🍾`
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

${round.scores.map(p => `${this.parsePlayerId(p[0]).firstName}: ${p[1].total}\n    ${p[1].holes.join(" ")}`).join("\n")}
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

    // TODO: fix id for supergroup - replies/threads do not retain topic title to reference
    //   once this is fixed in the id, we need to update the new round to retain the topic title at least in the sheet data
    // if (ctx.message?.chat.type === "supergroup") {
    //   return ctx.message.chat.id  + "|" + ctx.message.message_thread_id;
    // } else {
    //   return ctx.message.chat.title + "|" + ctx.message.chat.id;
    // }
  }

  private getPlayerId(user: User) {
    return user.id + "|" + user.first_name;
  }
  private parsePlayerId(playerId: string) {
    const [userId, ...firstNameArr] = playerId.split("|");
    const firstName = firstNameArr.join("|");
    return { userId, firstName };
  }

  private replyAll(message: string, ctx: MyContext) {
    return ctx.reply(message, { message_thread_id: ctx.message?.message_thread_id });
  }

  private replyOne(message: string, ctx: MyContext) {
    return ctx.reply(message, { reply_to_message_id: ctx.message?.message_id, message_thread_id: ctx.message?.message_thread_id });
  }
}

class ValidationError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

function random(arr:any[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}
