declare const __brand: unique symbol
type Brand<B> = { [__brand]: B };
type Branded<T, B> = T & Brand<B>;

// ----------------------------------------

type ID = Branded<`${string}-${string}-${string}-${string}`, "ID">; // UUID
export type UserID = Branded<ID, "UserID">;