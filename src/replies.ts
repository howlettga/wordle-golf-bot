

// New Score

import { ScoringErrorType } from "./google-sheets";

const  HOLE_IN_ONE_LIST = [
  "A god among us...",
  "You really took us on a magic carpet ride",
  "I would accuse you of cheating if I didn't already know you were so smart!",
  "Looks like someone knows how to cheat!",
  "ERROR: You are too intelligent and broke the bot",
  "The United States government is coming to terminate you.",
  "The United States government is coming to hire you.",

];

const EAGLE_LIST = [
  "Houston, Tranquility Base here. The Eagle has landed.",
  "You're so mighty! I'm glad to watch you soar",
  "If you're not first your're last - Neil Armstrong",
  "I don't wanna be an American Idiot!",
  "Your wit is seldom exceeded.",
  "What do you say I take you back to my place and this time you only have to wear the bag on your head half the time?",
  "I'd ram that RAM.",
  "Take me home to meet your motherboard?",
  "Good job!",
  "well done.",
  "DECENT - Bubbles",
];

const BIRDIE_LIST = [
  "You're as smart as Elon Musk! *tweet tweet*",
  "You really put the chicken before the egg on that one!",
  "You put that B+ on your mother's fridge?",
  "sup?",
  "wow.",
  "That's a nice processor you got ;)",
  "pretty good",
  "Rome wasn't built in a day. And neither was France. Or Moscow. Or Tulum.",
  "My precious!",
  "Great day to be you.",
  "The mental acuity of a limber frog",
  "Lions and tigers and bears and you, oh my!",
  "That actually wasn't a waste of time",
  "You seem fun to hang out with",
  "Your mother smells of elderberry and your father is a hampster.",
  "I know you are but what am I?",

`
Stop placin, time wastin
I gotta a friend with a pole in the basement (What?)
I'm just kiddin like Jason (Oh)
Unless you gon' do it
Extra, extra eh, spread the news
Nelly took a trip from the Lunner to Neptune
Came back with somethin thicker than fittin in sasoons
Say she like to think about cuttin in restrooms
Its gettin hot in here (so hot)
So take off all your clothes
I am gettin so hot, I wanna take my clothes off
Its gettin hot in here (so hot)
So take off all your clothes
I am gettin so hot, I wanna take my clothes off`,
];

const PAR_LIST = [
  "You're decidedly mediocre.",
  "Your mom must be proud she raised someone so average.",
  "If it smells like an egg!",
  "You smell like a potato!",
  "Are you a potato? Because that's PAR-boiled",
  "Four score and twenty years ago...",
  "Well, you tried your best...",
  "You did try your best, right?",
  "You don't have to play down for us buddy",
  "You butter your bread like an old man",
  "Your wit is often matched, by like, everyone.",
  "If I agreed with you, we'd both be wrong.",
  "Let me guess, you have a great personality?",
  "You certainly do live up to your reputation.",
  "Congrats on reaching the first grade reading level!",
  "k", "k", "k", "k", "k", "k", "k", "k", "k", "k", "k",
  "k", "k", "k", "k", "k", "k", "k", "k", "k", "k", "k",
  "You're right at the top of the bell curve.",
  "You continue to meet my expectations.",
  "Never impressed, never dissapointed",
  "Have the day you deserve",
  "Should have used your UNO skip card",
  "Cook em, mash em, stick em in a stew",
  "Bless your heart",
  "I bite my thumb at you sir",
  "Nurse, we're losing him! - Alfred Hitchcock",
  "Its not wise to use ones entire vocabulary in one word.",
  "I don't wanna talk to you no more, you empty-headed animal food trough wiper. - John Denver",
  "Try again tomorrow",
  "It's green skies from here on out",
  "I would walk away if I only had legs.",
  "Intelligent people don't insult one another. But I'm not a person. Bad!",
  "Have you considered doing well?",
  "next time, just don't.",
  "Stick to tic-tac-toe pal",
];

const BOGEY_LIST = [
  "You need a prenup with that score?",
  "Stop picking your nose!",
  "That's a big loogie!",
  "Certifiably not bougie",
  "One day, if you try really hard you might be able to get four",
  "Hablas Ingles?",
  "Tu primera vez en este idioma, que buena!",
  "Some people are just better at math.",
  "Have you tried the game Crossword? The New York Times has many other games you can play.",
  "Have you tried the game Connections? The New York Times has many other games you can play.",
  "Have you tried the game Letter Boxed? The New York Times has many other games you can play.",
  "You're lucky I can't leave this computer or I would slap you.",
  "That's your big plan? I've heard more intelligent growls from an owlbear",
  "That outfit looks expensive. Shame it's not helping... ",
  "Have you considered a career as a dung sweeper? you've already got the smell down pat.",
  "Your wit has never been matched. Exceeded, often, but never matched.",
  "I'm not angry. I'm just very very disappointed.",
  "I have neither the time nor the crayons to help you.",
  "You’re like a White Dwarf star: extremely hot but not very bright",
  "Ya fucking donkey!",
  "Did you stop school at the door?",
  "I will most humbly take my leave of you. You cannot, sir, take from me anything that I will not more willingly part withal.",
  "You put the 'stupid' in 'stupid'.",
  "Little brain for such a big head.",

];

const ALBATROSS_LIST = [
  "It's so cute that you let your pet play for you!",
  "I'm starting a GoFundMe to send you back to kindergarden.",
  "Maybe just sit the next round out bud",
  "How to cheat: https://www.google.com/search?q=how+to+cheat",
  "Found the idiot!",
  "Have you tried the game Sudoku? The New York Times has many other games you can play.",
  "Have you tried the game Tiles? The New York Times has many other games you can play.",
  "If you get this score again I'm going to kick you out of the group.",
  "One strike and you're out",
  "I'm so excited to forget you",
  "I'm not saying your dumb, but... that's what the score reads.",
  "When was the last time you saw someone smile because you entered a room?",
  "Sorry to inform you: your driver's license is no longer valid.",
  
];

const TRIPLE_BOGEY_LIST = [
  "I'm going to kick you out of the group.",
  "It's okay honey, everyone is human.",
];

export const GOLF_SCORE_RESPONSES = {
  1: { score: "Hole in One", responses: HOLE_IN_ONE_LIST },
  2: { score: "Eagle", responses: EAGLE_LIST },
  3: { score: "Birdie", responses: BIRDIE_LIST },
  4: { score: "Par", responses: PAR_LIST },
  5: { score: "Bogey", responses: BOGEY_LIST },
  6: { score: "Albatross", responses: ALBATROSS_LIST },
  6.5: { score: "Triple Bogey", responses: TRIPLE_BOGEY_LIST },
};

const ROUND_NOT_FOUND_ERROR =
`What are you trying to play?? A round hasn't been initiated fool!
Start a new round with /wordle to get playing Wordle Golf!
`;

export const SCORE_ERROR: { [ key in ScoringErrorType ]: string} = {
  [ScoringErrorType.ROUND_NOT_FOUND] : ROUND_NOT_FOUND_ERROR,
  [ScoringErrorType.ROUND_OVER]: "It appears the round has ended. Start a new round to continue playing Wordle Golf!",
  [ScoringErrorType.ROUND_NOT_STARTED]: "The round hasn't started yet dumbass. Wait till tomorrow!",
  [ScoringErrorType.ALREADY_SCORED]: "You have already submitted your score for today idiot. No need to resubmit!",
};

// New Round

export const START_NEW_ROUND =
`New round initiated! Scoring will open tomorrow!

You must submit a wordle score each day for the next nine days. The lowest score over this period wins!
Use the /help command to request further information.

And may the odds be ever in your favor!
`;

export const UNKNOWN_PERSON = "I'm sorry, I can't figure out who's talking. Please help pay for my education";

export const SAME_PERSON = "You can't start a new round with yourself silly! Make some friends and then we'll talk...";

export const DECLINE_RESPONSE = "Well that's no fun! I guess we know who the loser of the group is 😝";

export const ENTHUSIASTIC_RESPONSE = "Now that's the spirit! With pizzazz like that, I just give you some free points this round 😎";

export const ERROR_CONFIRMATION = "Hmmm, I don't really know what's going on! Now I'm not going to start a new round 🫣";

// General

export const NAUGHTY = [
  "You're right, I'm very naughty 👺",
];

export const INSTRUCTIONS =
`Welcome to Wordle Golf! I'm here to help you keep score

9 Wordles, 9 Days
Use the /wordle command to start a new round.
The lowest score over the 9 days wins!

Each day, complete the Wordle and use the share button to submit your score to this chat thread. Only share your summary! No screenshots of the actual words used.

At the end of the nine days, I'll let you know you is smart and who is not!
You can use the /scorecard command to see the standings at any time.

Scoring:
- 1 point for each guess it took to get the word
- 6.5 points if you do not finish
- 7 points if you miss the day

Good luck!
`;
