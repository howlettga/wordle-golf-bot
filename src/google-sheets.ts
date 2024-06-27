import fs from "fs/promises";
import path from "path";
import process from "process";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { authenticate } from "@google-cloud/local-auth";
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { addDays, differenceInCalendarDays, format, parse } from "date-fns";
import 'dotenv/config';

export class GoogleSheet {
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
    } else {
      throw new Error('INVALID_GOOGLE_AUTH_METHOD');
    }
  }

  public newSheet = async (title: string, chatId?: number, threadId?: number) => {
    await this.doc.loadInfo();

    const existingSheet = this.doc.sheetsByTitle[title];

    if (existingSheet) {
      await existingSheet.updateProperties({
        title: `${title.split('|')[0]}|${format(new Date(), 'yy-MM-dd')}|${this.uid()}|bkp`,
      });
    }

    const newSheet = await this.doc.addSheet({
      title: title,
    });
    await newSheet.loadCells('A1:A20');
    const a1 = newSheet.getCellByA1('A1');
    const a2 = newSheet.getCellByA1('A2');
    const a3 = newSheet.getCellByA1('A3');
    const a4 = newSheet.getCellByA1('A4');
    const a5 = newSheet.getCellByA1('A5');
    const a6 = newSheet.getCellByA1('A6');
    const a7 = newSheet.getCellByA1('A7');
    const a8 = newSheet.getCellByA1('A8');
    const a9 = newSheet.getCellByA1('A9');
    const a10 = newSheet.getCellByA1('A10');
    const a11 = newSheet.getCellByA1('A11');
    const a15 = newSheet.getCellByA1('A15');
    const a16 = newSheet.getCellByA1('A16');
    const a17 = newSheet.getCellByA1('A17');
    const a18 = newSheet.getCellByA1('A18');
    const a19 = newSheet.getCellByA1('A19');
    const a20 = newSheet.getCellByA1('A20');
    a1.value = "Player";
    a2.value = "1";
    a3.value = "2";
    a4.value = "3";
    a5.value = "4";
    a6.value = "5";
    a7.value = "6";
    a8.value = "7";
    a9.value = "8";
    a10.value = "9";
    a11.value = "Total";
    a15.value = "Start Date:";
    a16.value = format(addDays(new Date(), 1), "yyyy-MM-dd");
    a17.value = "Chat ID:";
    a18.value = chatId;
    a19.value = "Thread ID:";
    a20.value = threadId;
    await newSheet.saveUpdatedCells();
  }

  public addScore = async (playerId: string, score: number, sheetTitle: string) => {
    await this.doc.loadInfo();
    if (!await this.checkRoundExists(sheetTitle)) {
      throw new Error("ROUND_NOT_FOUND");
    }
    const sheet = this.doc.sheetsByTitle[sheetTitle];
    await sheet.loadHeaderRow();
    if (!sheet.headerValues.includes(playerId)) {
      sheet.headerValues.push(playerId);
      await sheet.setHeaderRow(sheet.headerValues);
    }

    // load start date
    await sheet.loadCells('A15:A16');
    const a15 = sheet.getCellByA1('A16');
    
    const day = differenceInCalendarDays(
      new Date(),
      parse(a15.value as string, 'yyyy-MM-dd', new Date()),
    );

    if (day < 0) {
      throw new Error("ROUND_NOT_STARTED");
    }

    if (day > 9) {
      throw new Error("ROUND_OVER");
    }

    const rows = await sheet.getRows();

    if (rows[day].get(playerId)) {
      throw new Error("ALREADY_SCORED");
    }

    rows[day].set(playerId, score);
    await rows[day].save();
  }

  public getScoringReport = async (sheetTitle: string) => {
    await this.doc.loadInfo();
    const sheet = this.doc.sheetsByTitle[sheetTitle];
    try {
      await sheet.loadHeaderRow();
    } catch (err) {
      throw new Error("SHEET_NOT_FOUND");
    }
    const rows = await sheet.getRows();

    await sheet.loadCells('A15:A16');
    const a15 = sheet.getCellByA1('A16');
    const startDate = parse(a15.value as string, 'yyyy-MM-dd', new Date());
    const today = differenceInCalendarDays(new Date(), startDate);

    const round: {
      startDate: Date;
      days: number;
      scores: {[key: string]: {
        total: number;
        holes: string[];
      }};
    } = {
      startDate: startDate,
      days: today,
      scores: {},
    };

    for (let player of sheet.headerValues.slice(1)) {
      let playerTotal = 0;
      round.scores[player] = {total: 0, holes: []};
      round.scores[player].holes = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(day => {
        // if (rows[day].get(player) === 'x')   // i believe x score means dnf and should be 6.5 but i've never seen the formatting
        playerTotal += parseInt(rows[day].get(player) || '0');
        return rows[day].get(player) || (day < today ? 7 : ' ');
      });
      round.scores[player].total = playerTotal;
    }
    return round;
  }

  public tabulateFinalResults = async (sheetTitle: string) => {
    await this.doc.loadInfo();
    const sheet = this.doc.sheetsByTitle[sheetTitle];
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();

    await sheet.loadCells('A15:A16');
    const a15 = sheet.getCellByA1('A16');
    const startDate = parse(a15.value as string, 'yyyy-MM-dd', new Date());
    const today = differenceInCalendarDays(new Date(), startDate);

    if (today < 9) {
      throw new Error("ROUND_NOT_FINISHED");
    }

    const round: {
      startDate: Date;
      days: number;
      scores: {[key: string]: {
        total: number;
        holes: string[];
      }};
    } = {
      startDate: startDate,
      days: today,
      scores: {},
    };

    for (let player of sheet.headerValues.slice(1)) {
      let playerTotal = 0;
      round.scores[player] = {total: 0, holes: []};
      round.scores[player].holes = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(day => {
        let score;
        if (rows[day].get(player) === 'x' || rows[day].get(player) === 'X') {
          playerTotal += 6.5;
          score = 'x';
        } else if (!rows[day].get(player)) {
          playerTotal += 7;
          score = 'X';
        } else {
          playerTotal += parseInt(rows[day].get(player));
          score = rows[day].get(player);
        }
        return score;
      });
      round.scores[player].total = playerTotal;
      rows[9].set(player, playerTotal);
      await rows[9].save();
    }

    const scores = Object.entries(round.scores).sort((a, b) => a[1].total - b[1].total);
    const winners = scores.filter(p => p[1].total === scores[0][1].total);

    await this.archiveSheet(sheet);

    return {
      startDate: startDate,
      days: today,
      tie: winners.length > 1,
      winners: winners.map(p => p[0]),
      winningScore: scores[0][1].total,
      scores: scores
    };
  }

  public checkRoundExists = async (sheetTitle: string) => {
    await this.doc.loadInfo();
    const sheet = this.doc.sheetsByTitle[sheetTitle];
    return !!sheet;
  }

  public getActiveRounds = async (completeOnly: boolean = false) => {
    await this.doc.loadInfo();
    const sheets = this.doc.sheetsByIndex;

    let active = [];
    for (let sheet of sheets.slice(1)) {
      if (!sheet.title.endsWith('|bkp')) {
        const days = await this.getDaysPastStart(sheet);
        if (completeOnly && days > 9) {
          active.push(await this.getSheetData(sheet));
        } else if (!completeOnly) {
          active.push(await this.getSheetData(sheet));
        }
      }
    }

    return active;
  }

  private getDaysPastStart = async (sheet: GoogleSpreadsheetWorksheet) => {
    await sheet.loadCells('A15:A16');
    const a16 = sheet.getCellByA1('A16');
    const startDate = parse(a16.value as string, 'yyyy-MM-dd', new Date());
    return differenceInCalendarDays(new Date(), startDate);
  }

  private getSheetData = async (sheet: GoogleSpreadsheetWorksheet) => {
    await sheet.loadCells('A17:A20');
    const a18 = sheet.getCellByA1('A18');
    const a20 = sheet.getCellByA1('A20');

    return {
      title: sheet.title,
      chatId: a18.value as number,
      threadId: a20.value as number,
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
