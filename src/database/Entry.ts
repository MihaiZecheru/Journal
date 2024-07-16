import TDateString from "./TDateString";

export default interface Entry {
  date: TDateString;
  rating: number; // 1 - 10
  journalEntry: string;
}