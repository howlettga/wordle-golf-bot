import fs from "fs/promises";
import path from "path";
import process from "process";
import { google } from "googleapis";
import { GoogleAuth, JWT } from "google-auth-library";
import { authenticate } from "@google-cloud/local-auth";
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { format } from "date-fns";
import 'dotenv/config';
import { getTodaysWordle } from "./wordle-api";

export class GoogleSheetDataSource implements WordleGolfDataSource {
  private static readonly SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
  private static readonly TOKEN_PATH = path.join(process.cwd(), "token.json");
  private static readonly CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

  private doc: GoogleSpreadsheet;

  constructor(sheetId: string, auth: any) {
    this.doc = new GoogleSpreadsheet(sheetId, auth);
  }

  static async initAuth() {
    if (process.env.GOOGLE_AUTH_METHOD === 'adc') {
      return new GoogleAuth({
        scopes: this.SCOPES,
      });
    } else if (process.env.GOOGLE_AUTH_METHOD === 'oauth2') {
      return await this.authorize();
    } else if (process.env.GOOGLE_AUTH_METHOD === 'service_account') {
      // TODO: verify
      const content = await fs.readFile(this.CREDENTIALS_PATH, 'utf-8');
      const credentials = JSON.parse(content);

      console.log(credentials);
      return new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: this.SCOPES,
      });
    } else {
      throw new Error('INVALID_GOOGLE_AUTH_METHOD');
    }
  }

  public async newGame(config: GameConfig) {
    await this.doc.loadInfo();

    // archive any existing game with this game id
    const existingSheet = this.doc.sheetsByTitle[config.id];
    if (existingSheet) {
      await existingSheet.updateProperties({
        title: `${config.id.split('|')[0]}|${format(new Date(), 'yy-MM-dd')}|${this.uid()}|bkp`,
      });
    }

    // create new sheet and load cells required for initial metadata
    const sheet = await this.doc.addSheet({
      title: config.id,
    });
    await sheet.loadCells(`A1:C${config.holes+10}`);

    // write metadata
    sheet.getCellByA1('A1').value = 'Metadata';
    sheet.getCellByA1('A2').value = 'Initiation Date:';
    sheet.getCellByA1('A3').value = config.initiationDate;
    sheet.getCellByA1('A4').value = 'Chat Id:';
    sheet.getCellByA1('A5').value = config.chatId;
    sheet.getCellByA1('A6').value = 'Thread Id:';
    sheet.getCellByA1('A7').value = config.threadId;
    sheet.getCellByA1('A8').value = 'Holes:';
    sheet.getCellByA1('A9').value = config.holes;
    sheet.getCellByA1('A10').value = 'Mulligans:';
    sheet.getCellByA1('A11').value = config.mulligans;

    // write round numbers
    sheet.getCellByA1('C1').value = 'Round';

    for (let i = 1; i < config.holes+1; i++) {
      sheet.getCellByA1(`C${i + 1}`).value = config.initialGameNumber+i;
    }

    sheet.getCellByA1(`C${config.holes+2}`).value = 'Total';

    // save sheet updates
    await sheet.saveUpdatedCells();

    // return anything?
  }

  public async addScore(score: WordleScore) {
    await this.doc.loadInfo();
    if (!await this.checkRoundExists(score.gameId)) {
      throw new ScoringError(ScoringErrorType.ROUND_NOT_FOUND, "");
    }

    const sheet = this.doc.sheetsByTitle[score.gameId];

    // get players from header - add new player if first time scoring
    await sheet.loadHeaderRow();
    if (!sheet.headerValues.includes(score.playerId)) {
      sheet.headerValues.push(score.playerId);
      await sheet.setHeaderRow(sheet.headerValues);
    }

    // load total rounds
    await sheet.loadCells('C2');
    await sheet.loadCells('A9');
    const holeIndex = score.puzzle - (sheet.getCellByA1('C2').value as number);
    const totalHoles = sheet.getCellByA1('A9').value as number;

    const rows = await sheet.getRows();

    // TODO: verify input validity
    // ? should this be done as pulled data during validate score?

    // verify validity
    //   is a game in the available rounds
    if (holeIndex < 0) {
      throw new ScoringError(ScoringErrorType.ROUND_NOT_STARTED, "");
    }
    if (holeIndex > totalHoles) {
      throw new ScoringError(ScoringErrorType.ROUND_OVER, "");
    }
    //   is the only score of this round
    if (rows[holeIndex].get(score.playerId)) {
      throw new ScoringError(ScoringErrorType.ALREADY_SCORED, "");
    }

    // save score
    rows[holeIndex].set(score.playerId, score.score.value);
    await rows[holeIndex].save();
  }

  public async getScorecard(gameId: string): Promise<RoundScorecard> {
    await this.doc.loadInfo();
    const sheet = this.doc.sheetsByTitle[gameId];
    try {
      await sheet.loadHeaderRow();
    } catch (err) {
      throw new ScoringError(ScoringErrorType.ROUND_NOT_FOUND, "");
    }
    const rows = await sheet.getRows();

    // pull metadata
    const metadata = await this.getRoundMetadata(sheet);

    const round: RoundScorecard = {
      metadata: metadata,
      scores: { },
    };

    // pull scores
    for (let player of sheet.headerValues.slice(3)) {
      round.scores[player] = { total: 0, holes: { numerical: [], visual: [] } };
      [...Array(metadata.holes).keys()].forEach((hole, index) => {
        const recordedValue = rows[hole].get(player);
        let numericalValue; let visualValue;

        if (recordedValue) {
          // scored already
          visualValue = recordedValue;
          if (visualValue === 'M') {
            numericalValue = 0;
          } else {
            numericalValue = parseFloat(recordedValue);
            if (numericalValue === 6.5) {
              visualValue = 'x';
            }
          }
        } else if (hole < metadata.completedHoles) {
          // TODO: verify
          visualValue = 'X';
          numericalValue = 7;
        } else {
          visualValue = ' ';
          numericalValue = 0;
        }

        round.scores[player].holes.numerical[index] = numericalValue;
        round.scores[player].holes.visual[index] = visualValue;
        round.scores[player].total += numericalValue;
        // return visualValue;
      });
    }

    // const util = require('util')
    // console.log(util.inspect(round, false, null, true));
    // console.log(round);

    return round;
  }

  public async finalizeRound(gameId: string): Promise<RoundScorecard> {
    await this.doc.loadInfo();
    const sheet = this.doc.sheetsByTitle[gameId];
    if (!sheet) {
      throw new Error("ROUND_DOES_NOT_EXIST");
    }
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();
    const metadata = await this.getRoundMetadata(sheet);

    const todaysWordle = await getTodaysWordle();
    console.log(todaysWordle);

    console.log(metadata);
    if (!metadata.isComplete) {
      throw new Error("ROUND_NOT_FINISHED");  // TODO: extend error class
    }

    const scorecard = await this.getScorecard(gameId);

    for (const player in scorecard.scores) {
      // set mulligans
      const sortedHoles = [...scorecard.scores[player].holes.numerical].sort().reverse();
      sortedHoles.splice(0, metadata.mulligans).forEach(async (score) => {
        // get index of highest scores
        const replaceHole = scorecard.scores[player].holes.numerical.indexOf(score);
        // replace them with M's
        scorecard.scores[player].total -= score;
        scorecard.scores[player].holes.visual[replaceHole] = 'M';
        scorecard.scores[player].holes.numerical[replaceHole] = 0;
        rows[replaceHole].set(player, 'M');
        await rows[replaceHole].save();
      });

      // set totals
      rows[metadata.holes].set(player, scorecard.scores[player].total);
      await rows[metadata.holes].save();
    }

    // archive sheet
    await this.archiveSheet(sheet);

    return scorecard;
  }

  public async getActiveRounds() {
    await this.doc.loadInfo();
    const sheets = this.doc.sheetsByIndex;

    const active = [];
    for (const sheet of sheets.slice(1)) {
      if (!sheet.title.endsWith('|bkp')) {
        active.push(await this.getRoundMetadata(sheet));
      }
    }

    return active;
  }

  public checkRoundExists = async (sheetTitle: string) => {
    await this.doc.loadInfo();
    const sheet = this.doc.sheetsByTitle[sheetTitle];
    return !!sheet;
  }

  private async getRoundMetadata(sheet: GoogleSpreadsheetWorksheet): Promise<RoundMetadata> {
    await sheet.loadCells('A1:C11');
    const todaysWordle = await getTodaysWordle();

    const holes = sheet.getCellByA1('A9').value as number;
    const initialGameNumber = sheet.getCellByA1('C2').value as number;
    const completedHoles = todaysWordle.days_since_launch - initialGameNumber;
    const isComplete = completedHoles >= holes;
    const isArchived = sheet.title.endsWith('|bkp');

    return {
      // stored properties
      id: sheet.title,
      initiationDate: sheet.getCellByA1('A3').value as string,  // broken
      chatId: sheet.getCellByA1('A5').value as number,
      threadId: sheet.getCellByA1('A7').value as number,
      holes: holes,
      mulligans: sheet.getCellByA1('A11').value as number,
      initialGameNumber: initialGameNumber,
      // computed properties
      completedHoles: completedHoles,
      isComplete: isComplete,
      isArchived: isArchived,
    };
  }

  private archiveSheet = async (sheet: GoogleSpreadsheetWorksheet) => {
    await sheet.updateProperties({
      title: `${sheet.title.split('|')[0]}|${format(new Date(), 'yy-MM-dd')}|${this.uid()}|bkp`,
    });
  }

  /**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
  private static loadSavedCredentialsIfExist = async () => {
    try {
      const content = await fs.readFile(this.TOKEN_PATH, 'utf-8');
      const credentials = JSON.parse(content);
      return google.auth.fromJSON(credentials);
    } catch (err) {
      return null;
    }
  }

  /**
   * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
   *
   * @param {OAuth2Client} client
   * @return {Promise<void>}
   */
  private static saveCredentials = async (client: any) => {
    const content = await fs.readFile(this.CREDENTIALS_PATH, 'utf-8');
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
      type: 'authorized_user',
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(this.TOKEN_PATH, payload);
  }

  /**
   * Load or request or authorization to call APIs.
   *
   */
  private static authorize = async (): Promise<any> => {
    let client: any = await this.loadSavedCredentialsIfExist();
    if (client) {
      return client;
    }
    client = await authenticate({
      scopes: this.SCOPES,
      keyfilePath: this.CREDENTIALS_PATH,
    });
    if (client.credentials) {
      await this.saveCredentials(client);
    }
    return client;
  }

  private uid = () => Math.random().toString(36).substring(2, 6);

}

export enum ScoringErrorType{
  ROUND_NOT_FOUND,
  ROUND_OVER,
  ROUND_NOT_STARTED,
  ALREADY_SCORED,
}

export class ScoringError extends Error {
  type: ScoringErrorType;

  constructor(type: ScoringErrorType, msg: string) {
    super(msg);
    this.type = type;
    this.name = "ScoringError";
  }
}
