import {
  type ParseError,
  type ModificationOptions,
  applyEdits,
  modify,
  parse,
  printParseErrorCode,
} from "jsonc-parser";

export interface JsoncParseResult<T> {
  data: T | null;
  errors: Array<{ message: string; offset: number; length: number }>;
}

export function parseJsonc<T = unknown>(content: string): T {
  const errors: ParseError[] = [];
  const result = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as T;

  if (errors.length > 0) {
    const messages = errors
      .map((e) => `${printParseErrorCode(e.error)} at offset ${e.offset}`)
      .join(", ");
    throw new SyntaxError(`JSONC parse error: ${messages}`);
  }

  return result;
}

export function parseJsoncSafe<T = unknown>(
  content: string,
): JsoncParseResult<T> {
  const errors: ParseError[] = [];
  const data = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as T | null;

  return {
    data: errors.length > 0 ? null : data,
    errors: errors.map((e) => ({
      message: printParseErrorCode(e.error),
      offset: e.offset,
      length: e.length,
    })),
  };
}

export interface StringifyOptions {
  indent?: number | string;
  trailingComma?: boolean;
}

export function stringifyJsonc(
  data: unknown,
  options: StringifyOptions = {},
): string {
  const indent = options.indent ?? 2;
  const indentStr = typeof indent === "number" ? " ".repeat(indent) : indent;
  const trailingComma = options.trailingComma ?? true;

  return JSON.stringify(data, null, indentStr)
    .replace(/\n\s*}/g, trailingComma ? ",\n}" : "\n}")
    .replace(/\n\s*]/g, trailingComma ? ",\n]" : "\n]");
}

export function modifyJsonc(
  content: string,
  modifications: Array<{
    path: string[];
    value: unknown;
    op: "set" | "unset" | "replace";
  }>,
): string {
  let result = content;

  for (const mod of modifications) {
    const options: ModificationOptions = {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
      },
    };

    if (mod.op === "unset") {
      result = applyEdits(
        result,
        modify(result, mod.path, undefined, {
          ...options,
          isArrayInsertion: false,
        }),
      );
    } else {
      result = applyEdits(result, modify(result, mod.path, mod.value, options));
    }
  }

  return result;
}

export function setJsoncValue(
  content: string,
  path: string[],
  value: unknown,
): string {
  return modifyJsonc(content, [{ path, value, op: "set" }]);
}

export function removeJsoncKey(content: string, path: string[]): string {
  return modifyJsonc(content, [{ path, value: undefined, op: "unset" }]);
}
