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

### Telegram Bot

1. Register a new bot with the @BotFather.

2. Save the token.

### Google Sheet

You need a Google Sheet Document configured to use as the scoring database. Each new round will be added as a new sheet on this document.

1. Create a new Worksheet Document.

2. Rename the initial sheet to `init`. Google Sheets requires one sheet to exist in every document; Wordle Bot will ignore sheets named `init`, so this can safely be used.

3. Save the id.

### Google Sheets Authentication

Authentication methods supported are `adc` (application default credentials) or `oauth2`.
TODO: service_account

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

## Develop

```sh
npm run dev
```

## Build

```sh
npm run build
```

## Run

```sh
npm start
```
