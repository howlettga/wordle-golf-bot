import { format } from "date-fns";

interface NYCWordle {
  id: number;
  solution: string;
  print_date: string;
  days_since_launch: number;
  editor: string;
}

export async function getTodaysWordle() {
  const today = format(new Date(new Date().toLocaleString("en-US", {timeZone: "America/New_York"})), "yyyy-MM-dd");
  const todaysWordle: NYCWordle = await (await fetch(`https://www.nytimes.com/svc/wordle/v2/${today}.json`)).json();

  return todaysWordle;
}
