# TypeScript Handbook — Selected Topics

## Type Inference

TypeScript infers types automatically when you declare a variable with an initial value.
If you write `let x = 5`, TypeScript knows `x` is a number. This is called type inference
and it means you rarely need explicit type annotations for local variables.

When a function has a return statement, TypeScript infers the return type from the returned value.
For example, `function double(n: number) { return n * 2 }` is automatically inferred as returning `number`.

## Union Types

A union type describes a value that can be one of several types. Use the `|` character to separate each type.
For example, `string | number` describes a value that can be either a string or a number.

When using union types, TypeScript only allows operations that are valid for every member of the union.
You can narrow unions with `typeof`, `instanceof`, or custom type guards.

## Generics

Generics let you write reusable code that works with any type. The identity function is the classic example:

```typescript
function identity<T>(arg: T): T {
  return arg;
}
```

The `T` is a type parameter that is filled in when the function is called.
You can constrain generics with `extends`: `function getLength<T extends { length: number }>(arg: T): number`.

## Interfaces vs Type Aliases

Both `interface` and `type` let you describe the shape of an object. The key differences:
- Interfaces can be extended with `extends` and can be declaration-merged.
- Type aliases can describe unions, tuples, and primitive types.
- Use `interface` for public API surfaces; use `type` for complex type manipulation.

## Decorators

Decorators are a TypeScript feature (stage-3 proposal) that let you annotate and modify classes and their members.
A decorator is a function applied to a class, method, property, or parameter using the `@` syntax.
Enable them with `"experimentalDecorators": true` in your tsconfig.

Example:
```typescript
function log(target: any, key: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  descriptor.value = function(...args: any[]) {
    console.log(`Calling ${key}`);
    return original.apply(this, args);
  };
  return descriptor;
}
```

## Async/Await

TypeScript fully supports async/await for working with Promises.
An `async` function always returns a `Promise`, even if you return a plain value.
Use `await` inside an async function to pause execution until a Promise resolves.

Error handling with async/await uses try/catch blocks, just like synchronous code.
You can type the resolved value: `const result: string = await fetchData()`.

## Enums

Enums allow you to define a set of named constants. TypeScript supports:
- Numeric enums (default): `enum Direction { Up, Down, Left, Right }` (values 0, 1, 2, 3)
- String enums: `enum Status { Active = "ACTIVE", Inactive = "INACTIVE" }`
- Const enums: `const enum Size { Small, Medium, Large }` — inlined by the compiler for zero runtime overhead

## Mapped Types

Mapped types let you create new types by transforming properties of an existing type.
The built-in `Partial<T>`, `Required<T>`, `Readonly<T>`, and `Record<K,V>` are all mapped types.

```typescript
type Optional<T> = {
  [P in keyof T]?: T[P];
};
```

## Conditional Types

Conditional types select one of two possible types based on a condition:
`T extends U ? X : Y`

The built-in `NonNullable<T>`, `ReturnType<F>`, `Parameters<F>`, and `Awaited<T>` use conditional types.
Conditional types can also be distributive: when used with union types, they are applied to each member.

## Template Literal Types

Template literal types build string types by combining string literals:
```typescript
type EventName = `on${Capitalize<string>}`;
type CSSProperty = `${string}-${string}`;
```

This is useful for describing APIs where property names follow a pattern.
