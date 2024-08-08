import 'dotenv/config';
import { Bot, type Context, session } from "grammy";
import { type Conversation, type ConversationFlavor, conversations, createConversation } from "@grammyjs/conversations";
import { User } from "grammy/types";
import { scheduleJob } from "node-schedule";
import { ScoringError } from "./google-sheets";
import { getTodaysWordle } from "./wordle-api";
import {
  DECLINE_RESPONSE,
  ERROR_CONFIRMATION,
  GOLF_SCORE_RESPONSES,
  INSTRUCTIONS,
  SAME_PERSON,
  SCORE_ERROR,
  START_NEW_ROUND,
  UNKNOWN_PERSON
} from "./replies";

type MyContext = Context & ConversationFlavor;
type MyConversation = Conversation<MyContext>;

export class WordleBot {
  private bot: Bot<MyContext>;
  private data: WordleGolfDataSource;
  private spankRequests: {
    init: { message_id: number, thread_id?: number }[];
    follow: { message_id: number, thread_id?: number }[];
  };

  constructor(dataSource: WordleGolfDataSource) {
    this.bot = new Bot<MyContext>(process.env.TELEGRAM_BOT_TOKEN as string);
    this.data = dataSource;
    this.spankRequests = { init: [], follow: [] };
  }

  start() {
    this.bot.use(session({ initial: () => ({}) }));
    this.bot.use(conversations());

    this.bot.use(createConversation(this.newRoundDialogue.bind(this), 'new-round'));

    // TODO: parameterize?
    this.registerDev();

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

  private registerDev() {
    this.bot.command("dev", async ctx => {

    });
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
      const scorecard = await this.data.getScorecard(title);
      const report = this.getScorecardMessage(scorecard);
      
      await this.replyAllHtml(report, ctx);
    });
  }

  private registerScore() {
    this.bot.hears(/^Wordle.*/, async (ctx) => {
      if (ctx.from && ctx.message?.text) {
        try {
          const wordle = this.parseWordleScore(ctx.message.text, ctx.from, ctx);
          await this.data.addScore(wordle);
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
        } catch (err) {
          if (err instanceof ValidationError) {
            // TODO: handle validation error
            this.replyOne(err.message, ctx);
          } else if (err instanceof ScoringError) {
            this.replyOne(SCORE_ERROR[err.type], ctx);
          } else {
            console.log(err);
            this.replyOne("There was an issue submitting your score :(\nI'm not sure why", ctx);
          }
        }
      } else {
        this.replyAll(UNKNOWN_PERSON, ctx);
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

  /** CONVERSATION DIALOGUE  */

  private async newDayDialogue(round: RoundMetadata) {
    const score = await this.data.getScorecard(round.id);
    await this.bot.api.sendMessage(
      round.id.split('|')[1],
      [
        `One more day down! You have ${score.metadata.holes - score.metadata.completedHoles} days remaining!`,
        `Don't forget to submit today's score if you want to win!`,
        ``,
        `Feel free to use the /scorecard command to check the current standings.`,
      ].join('\n'),
      { message_thread_id: round.threadId, parse_mode: 'HTML' }
    );
  }

  private async newRoundDialogue(conversation: MyConversation, ctx: MyContext) {
    if (await this.verifyRoundInitiationDialogue(conversation, ctx)) {
      await this.replyAll("Let's get this round started!", ctx);
      const roundParameters = await this.gatherRoundParametersDialogue(conversation, ctx);
      if (roundParameters) {
        const todayInfo = await getTodaysWordle();

        const game: GameConfig = {
          id: this.getGroupId(ctx),
          chatId: ctx.message?.chat.id,
          threadId: ctx.message?.message_thread_id,
          holes: roundParameters.holes,
          mulligans: roundParameters.mulligans,
          initiationDate: todayInfo.print_date,
          initialGameNumber: todayInfo.days_since_launch,
        };
        await this.data.newGame(game);
        this.replyAll(START_NEW_ROUND, ctx);    // todo parameterize number of days
      }
    }
  }

  private async verifyRoundInitiationDialogue(conversation: MyConversation, ctx: MyContext) {
    const initiator = ctx.from;
    
    await ctx.reply(`<a href="tg://user?id=${ctx.from?.id}">${ctx.from?.first_name}</a> has requested to start a new round of Wordle Golf. Would someone confirm? (yes/no)\n\n🚨This will reset any existing round!`, {
      message_thread_id: ctx.message?.message_thread_id,
      parse_mode: "HTML",
      reply_markup: { force_reply: true },
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
      await this.replyAll("How many holes (days) would you like to play?", ctx);
      const holes = await this.getNumberDialogue(conversation, ctx);
      await this.replyAll("How many mulligans (skip days) would you like to include?", ctx);
      const mulligans = await this.getNumberDialogue(conversation, ctx);
      if (mulligans > holes) {
        await this.replyAll("I'm sorry, you can't have more mulligans than rounds. goodbye.", ctx);
        return;
      }
      return { holes, mulligans };
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

  private async initScheduledMessages() {
    const that = this;

    const complete = scheduleJob('0 9 * * *', async function() {
      const rounds = await that.data.getActiveRounds();
      for (const round of rounds) {
        if (round.isComplete) {
          that.finalizeGame(round);
        } else {
          that.newDayDialogue(round);
        }
      }
    });
  }

  private async finalizeGame(round: RoundMetadata) {
    const score = await this.data.finalizeRound(round.id);
    await this.bot.api.sendMessage(
      round.id.split('|')[1],
      "The round is complete! Lets see who won!",
      { message_thread_id: round.threadId },
    );
    await this.bot.api.sendMessage(
      round.id.split('|')[1],
      await this.getFinalScorecardMessage(score),
      { message_thread_id: round.threadId, parse_mode: 'HTML' },
    );
  }

  private parseWordleScore(message: string, user: User, ctx: MyContext): WordleScore {
    const lines = message.split("\n");
    const title = lines[0].split(" ");

    const score = {
      playerId: this.getPlayerId(user),
      gameId: this.getGroupId(ctx),
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

    // TODO: check that a later wordle hasn't been played

    return true;
  }

  private getScorecardMessage(scorecard: RoundScorecard) {
    const sorted = Object.keys(scorecard.scores).sort((a, b) => scorecard.scores[a].total - scorecard.scores[b].total);

    const htmlString = [];
    htmlString.push(`<b>Current Round</b>`);
    htmlString.push(`-----`);
    // htmlString.push(`Started on ${scorecard.metadata.initiationDate}`);  // TODO: initiation date is broken
    htmlString.push(`${scorecard.metadata.completedHoles} days completed`);
    htmlString.push(`${scorecard.metadata.holes - scorecard.metadata.completedHoles} days remaining`);
    htmlString.push(`-----`);

    htmlString.push(`Scores:`);
    htmlString.push(``);
    htmlString.push(...this.getResults(scorecard));

    htmlString.push(`-----`);
    htmlString.push(`Mulligans will be accounted for at the end of the round.`);
    htmlString.push(`Thanks for playing!`);

    return htmlString.join('\n');
  }

  // TODO: fix parsing of user based on datasource formatting
  private async getFinalScorecardMessage(scorecard: RoundScorecard) {
    const sorted = Object.keys(scorecard.scores).sort((a, b) => scorecard.scores[a].total - scorecard.scores[b].total);
    const winners = sorted.filter(user => scorecard.scores[user].total === scorecard.scores[sorted[0]].total);

    const htmlString = [];
    htmlString.push(`<b>Round Complete</b>`);
    htmlString.push(`-----`);

    htmlString.push(`🏆🏆🏆🏆🏆`);
    if (winners.length > 1) {
      const winnersFormatted = winners.map(winner => `<a href="tg://user?id=${winner.split('|')[0]}">${winner.split('|')[1]}</a>`);
      htmlString.push(winnersFormatted.join(" and ") + " win!");
    } else {
      htmlString.push(`<a href="tg://user?id=${winners[0].split('|')[0]}">${winners[0].split('|')[1]}</a> wins!`);
      htmlString.push()
    }
    htmlString.push(`🏆🏆🏆🏆🏆`);

    htmlString.push(`-----`);
    htmlString.push(`Final results:`);
    htmlString.push(``);

    htmlString.push(...this.getResults(scorecard));

    return htmlString.join('\n');
  }

  private getResults(scorecard: RoundScorecard) {
    const results = [];
    const sorted = Object.keys(scorecard.scores).sort((a, b) => scorecard.scores[a].total - scorecard.scores[b].total);

    for (const player of sorted) {
      results.push(`<a href="tg://user?id=${player.split('|')[0]}">${player.split('|')[1]}</a>: <code>${scorecard.scores[player].total}</code>`);
      results.push(`   <code>${scorecard.scores[player].holes.visual.join(" ")}</code>`);
    }

    return results;
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

  // TODO: this should be used in sheets with a real data interface
  private parsePlayerId(playerId: string) {
    const [userId, ...firstNameArr] = playerId.split("|");
    const firstName = firstNameArr.join("|");
    return { userId, firstName };
  }

  private replyAll(message: string, ctx: MyContext) {
    return ctx.reply(message, { message_thread_id: ctx.message?.message_thread_id });
  }

  private replyAllHtml(message: string, ctx: MyContext) {
    return ctx.reply(message, { message_thread_id: ctx.message?.message_thread_id, parse_mode: 'HTML' });
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
