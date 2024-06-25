# Wordle Golf Bot

A telegram bot that can be used to track Wordle Golf scores

## Description

This project runs a telegram bot server that creates and tracks Wordle Golf games within a chat group. It relies on Google Sheets to keep track of scores.

## Dependencies

* [Telegram Bot](https://core.telegram.org/bots)
* [Google Sheets](https://developers.google.com/sheets/api/guides/concepts)

## Configure

Create a `.env` file with the following properties:

```env
TELEGRAM_BOT_TOKEN=
GOOGLE_AUTH_METHOD=
GOOGLE_SHEET_ID=
```

### Google Sheets Authentication

Authentication methods supported are `adc` (application default credentials) or `oauth2`.

#### Application Default Crednetials

```sh
npm run login -- --impersonate-service-account=<account>@<project>.iam.gserviceaccount.com
```

#### OAuth 2.0

Must add a `credentials.json` file.

## Install

```sh
npm install
```

## Run

```sh
npm start
```
